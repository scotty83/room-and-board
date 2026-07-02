import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  pickNewest,
} from '../site/js/config.js';

describe('normalizeConfig', () => {
  it('fills defaults for an empty object', () => {
    const cfg = normalizeConfig({});
    expect(cfg.v).toBe(1);
    expect(cfg.widgets).toEqual(DEFAULT_CONFIG.widgets);
    expect(cfg.mode).toBe('auto');
    expect(cfg.theme).toBe('dark');
    expect(cfg.loc.lat).toBeCloseTo(40.754);
  });

  it('keeps provided values and coerces types', () => {
    const cfg = normalizeConfig({
      name: 'Sean',
      widgets: ['weather', 'lirr', 'bogus'],
      subway: { stops: ['635N'], lines: ['4', '5'] },
      mode: 'ambient',
    });
    expect(cfg.name).toBe('Sean');
    expect(cfg.widgets).toEqual(['weather', 'lirr']); // unknown ids dropped
    expect(cfg.subway.stops).toEqual(['635N']);
    expect(cfg.mode).toBe('ambient');
  });

  it('throws on non-objects and unknown future versions', () => {
    expect(() => normalizeConfig(null)).toThrow(TypeError);
    expect(() => normalizeConfig('x')).toThrow(TypeError);
    expect(() => normalizeConfig({ v: 99 })).toThrow(TypeError);
  });

  it('clamps name length and invalid mode/theme', () => {
    const cfg = normalizeConfig({ name: 'x'.repeat(99), mode: 'weird', theme: 'neon' });
    expect(cfg.name.length).toBeLessThanOrEqual(24);
    expect(cfg.mode).toBe('auto');
    expect(cfg.theme).toBe('dark');
  });
});

describe('encode/decode round trip', () => {
  it('round-trips a full config', async () => {
    const cfg = normalizeConfig({
      name: 'Sean',
      t: 1782000000,
      loc: { lat: 40.75, lon: -73.99, label: 'Midtown' },
      widgets: ['weather', 'subway', 'lirr', 'njt', 'art', 'history', 'aqi', 'quote'],
      subway: { stops: ['635N', '635S'], lines: ['4', '5', '6'] },
      lirr: { orig: 'NYK', dest: 'PWS' },
      njt: { station: 'NY' },
      mode: 'auto',
      theme: 'dark',
    });
    const enc = await encodeConfig(cfg);
    expect(typeof enc).toBe('string');
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    const dec = await decodeConfig(enc);
    expect(dec).toEqual(cfg);
  });

  it('stays small enough for URL fragments and setup flows', async () => {
    const cfg = normalizeConfig({
      name: 'Maximiliano Longname',
      t: 2000000000,
      widgets: ['weather', 'subway', 'lirr', 'njt', 'art', 'history', 'aqi', 'quote'],
      subway: { stops: ['635N', '635S', 'R20N', 'R20S', 'A32N', 'A32S'], lines: ['4', '5', '6', 'N', 'Q', 'R'] },
      lirr: { orig: 'NYK', dest: 'PWS' },
      njt: { station: 'NY' },
    });
    const enc = await encodeConfig(cfg);
    expect(enc.length).toBeLessThan(500);
  });

  it('throws on corrupt input', async () => {
    await expect(decodeConfig('!!!not-base64url!!!')).rejects.toThrow();
    await expect(decodeConfig('AAAA')).rejects.toThrow();
    await expect(decodeConfig('')).rejects.toThrow();
  });
});

describe('pickNewest', () => {
  const a = { v: 1, t: 100 };
  const b = { v: 1, t: 200 };
  it('handles nulls', () => {
    expect(pickNewest(null, null)).toBeNull();
    expect(pickNewest(a, null)).toBe(a);
    expect(pickNewest(null, b)).toBe(b);
  });
  it('picks higher t', () => {
    expect(pickNewest(a, b)).toBe(b);
    expect(pickNewest(b, a)).toBe(b);
  });
  it('treats missing t as 0', () => {
    expect(pickNewest({ v: 1 }, a)).toBe(a);
  });
});
