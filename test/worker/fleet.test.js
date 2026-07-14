import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { parseBeacon, beaconDataPoint, deviceModel } from '../../worker/src/fleet.js';

const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init, extraEnv = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), { ...env, ...extraEnv }, ctx);

const VALID = {
  deviceId: 'a3f1c2d4-5678-4abc-9def-0123456789ab',
  widgets: ['weather', 'subway', 'markets'],
  mode: 'scheduled',
  version: '9d757c6ee919',
  tz: 'America/New_York',
};

describe('parseBeacon', () => {
  it('accepts a valid payload and normalizes it', () => {
    const p = parseBeacon(JSON.stringify(VALID));
    expect(p).toEqual(VALID);
  });
  it('lowercases the device id and tolerates missing optional fields', () => {
    const p = parseBeacon(JSON.stringify({ deviceId: 'ABCDEF12-3456', widgets: [] }));
    expect(p.deviceId).toBe('abcdef12-3456');
    expect(p).toMatchObject({ widgets: [], mode: 'unknown', version: 'unknown', tz: '' });
  });
  it('filters junk widget ids, dedupes, caps at 32', () => {
    const widgets = ['weather', 'weather', '<svg>', 'x'.repeat(30), 42, ...Array.from({ length: 40 }, (_, i) => `w${'x'.repeat((i % 18) + 1)}`)];
    const p = parseBeacon(JSON.stringify({ ...VALID, widgets }));
    expect(p.widgets[0]).toBe('weather');
    expect(p.widgets).not.toContain('<svg>');
    expect(p.widgets.length).toBeLessThanOrEqual(32);
    expect(new Set(p.widgets).size).toBe(p.widgets.length);
  });
  it('rejects malformed bodies', () => {
    expect(parseBeacon('not json')).toBeNull();
    expect(parseBeacon(JSON.stringify({ widgets: [] }))).toBeNull(); // no deviceId
    expect(parseBeacon(JSON.stringify({ deviceId: 'nope!', widgets: [] }))).toBeNull();
    expect(parseBeacon(JSON.stringify({ ...VALID, widgets: 'weather' }))).toBeNull();
    expect(parseBeacon('x'.repeat(3000))).toBeNull(); // oversized
  });
  it('sanitizes hostile mode/version/tz to safe fallbacks', () => {
    const p = parseBeacon(JSON.stringify({ ...VALID, mode: 'evil', version: '<script>', tz: 'a'.repeat(99) }));
    expect(p).toMatchObject({ mode: 'unknown', version: 'unknown', tz: '' });
  });
});

describe('deviceModel', () => {
  it('parses the model from a RoomOS WebEngine User-Agent', () => {
    expect(deviceModel('Mozilla/5.0 (Linux; RoomOS; Cisco Board Pro) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.14.2 Chrome/77 Safari/537.36')).toBe('Cisco Board Pro');
    expect(deviceModel('Mozilla/5.0 (Linux; RoomOS; Cisco Webex Desk Pro) AppleWebKit/537.36')).toBe('Cisco Webex Desk Pro');
  });
  it('handles a malformed model paren and defaults non-RoomOS traffic to other', () => {
    // Legacy Board 70 UA has an unbalanced paren before AppleWebKit.
    expect(deviceModel('Mozilla/5.0 (Linux; RoomOS; Cisco Webex Board (70) AppleWebKit/537.36')).toBe('Cisco Webex Board');
    expect(deviceModel('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/149 Safari/537.36')).toBe('other');
    expect(deviceModel(null)).toBe('other');
  });
});

describe('beaconDataPoint', () => {
  it('maps to the Analytics Engine shape indexed by device, country then model last', () => {
    const p = { ...parseBeacon(JSON.stringify(VALID)), country: 'US', model: 'Cisco Board Pro' };
    expect(beaconDataPoint(p)).toEqual({
      indexes: [VALID.deviceId],
      blobs: [VALID.deviceId, VALID.version, VALID.mode, VALID.tz, 'weather,subway,markets', 'US', 'Cisco Board Pro'],
      doubles: [3],
    });
  });
  it('defaults country to XX and model to other when absent (never trusts the payload)', () => {
    const base = parseBeacon(JSON.stringify(VALID));
    expect(beaconDataPoint(base).blobs[5]).toBe('XX');
    expect(beaconDataPoint(base).blobs[6]).toBe('other');
    expect(beaconDataPoint({ ...base, country: 'usa' }).blobs[5]).toBe('XX'); // not alpha-2
    expect(beaconDataPoint({ ...base, country: '<b>' }).blobs[5]).toBe('XX');
  });
});

describe('POST /fleet', () => {
  it('writes a data point and returns 204', async () => {
    const writeDataPoint = vi.fn();
    const res = await call('/fleet', { method: 'POST', body: JSON.stringify(VALID) }, { ANALYTICS: { writeDataPoint } });
    expect(res.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledWith(beaconDataPoint(VALID));
  });
  it('rejects malformed payloads with 400', async () => {
    const writeDataPoint = vi.fn();
    const res = await call('/fleet', { method: 'POST', body: 'junk' }, { ANALYTICS: { writeDataPoint } });
    expect(res.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
  it('accepts quietly when the ANALYTICS binding is absent (self-host without metrics)', async () => {
    const res = await call('/fleet', { method: 'POST', body: JSON.stringify(VALID) }, { ANALYTICS: undefined });
    expect(res.status).toBe(204);
  });
  it('stamps the edge country and the RoomOS model from request headers', async () => {
    const writeDataPoint = vi.fn();
    const res = await call('/fleet', {
      method: 'POST', body: JSON.stringify(VALID),
      headers: { 'CF-IPCountry': 'GB', 'User-Agent': 'Mozilla/5.0 (Linux; RoomOS; Cisco Board Pro G2) AppleWebKit/537.36' },
    }, { ANALYTICS: { writeDataPoint } });
    expect(res.status).toBe(204);
    expect(writeDataPoint.mock.calls[0][0].blobs[5]).toBe('GB');
    expect(writeDataPoint.mock.calls[0][0].blobs[6]).toBe('Cisco Board Pro G2');
  });
  it('refuses oversized bodies', async () => {
    const writeDataPoint = vi.fn();
    const res = await call('/fleet', {
      method: 'POST', body: 'x'.repeat(99999),
    }, { ANALYTICS: { writeDataPoint } });
    expect(res.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
