import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { parseBeacon, beaconDataPoint } from '../../worker/src/fleet.js';

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

describe('beaconDataPoint', () => {
  it('maps to the Analytics Engine shape indexed by device', () => {
    expect(beaconDataPoint(parseBeacon(JSON.stringify(VALID)))).toEqual({
      indexes: [VALID.deviceId],
      blobs: [VALID.deviceId, VALID.version, VALID.mode, VALID.tz, 'weather,subway,markets'],
      doubles: [3],
    });
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
  it('refuses oversized bodies', async () => {
    const writeDataPoint = vi.fn();
    const res = await call('/fleet', {
      method: 'POST', body: 'x'.repeat(99999),
    }, { ANALYTICS: { writeDataPoint } });
    expect(res.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
