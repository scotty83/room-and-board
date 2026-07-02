import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  pickNewest,
} from '../site/js/config.js';

describe('normalizeConfig', () => {
  it('fills v2 defaults for an empty object', () => {
    const cfg = normalizeConfig({});
    expect(cfg.v).toBe(2);
    expect(cfg.layout).toEqual(DEFAULT_CONFIG.layout);
    expect(cfg.widgets).toEqual(cfg.layout.map((r) => r.id)); // derived
    expect(cfg.mode).toBe('dashboard');
    expect(cfg.theme).toBe('dark');
    expect(cfg.loc).toEqual({ lat: 40.7506, lon: -73.9971, label: 'New York 10001' });
    expect(cfg.lirr).toEqual({ dest: '', alerts: true });
    expect(cfg.mnr).toEqual({ dest: '', alerts: true });
    expect(cfg.bus).toEqual({ stops: [] });
    expect(cfg.markets).toEqual({ symbols: ['^DJI', '^IXIC', '^GSPC'] });
    expect(normalizeConfig({ v: 2, markets: { symbols: [] } }).markets.symbols).toEqual(['^DJI', '^IXIC', '^GSPC']);
    expect(normalizeConfig({ v: 2, markets: { symbols: ['aapl', '^GSPC', 'bad ticker!', 'MSFT'] } }).markets.symbols).toEqual(['AAPL', '^GSPC', 'MSFT']);
    expect(normalizeConfig({ v: 2, bus: { stops: ['550685', 'junk', '12'] } }).bus.stops).toEqual(['550685']);
  });

  it('migrates a v1 config: widgets->layout, lirr, Midtown loc', () => {
    const cfg = normalizeConfig({
      v: 1,
      name: 'Sean',
      widgets: ['weather', 'lirr', 'bogus'],
      subway: { lines: ['4', '5'] },
      lirr: { orig: '237', dest: 'PWS' },
      loc: { lat: 40.754, lon: -73.984, label: 'Midtown' },
      mode: 'ambient',
    });
    expect(cfg.v).toBe(2);
    expect(cfg.widgets).toEqual(['weather', 'lirr']); // unknown ids dropped
    const lirr = cfg.layout.find((r) => r.id === 'lirr');
    expect(lirr.w).toBeGreaterThanOrEqual(2);
    expect(cfg.lirr).toEqual({ dest: 'PWS', alerts: true }); // v1 dest carries into the v2 filter
    expect(cfg.loc.label).toBe('New York 10001'); // old default replaced
    expect(cfg.mode).toBe('ambient');
  });

  it('keeps a customized v1 location during migration', () => {
    const cfg = normalizeConfig({ v: 1, loc: { lat: 41.03, lon: -73.76, label: 'White Plains' } });
    expect(cfg.loc.label).toBe('White Plains');
  });

  it('normalizes a v2 layout (clamps, resolves overlap, keeps branches)', () => {
    const cfg = normalizeConfig({
      v: 2,
      layout: [
        { id: 'weather', x: 0, y: 0, w: 3, h: 2 },
        { id: 'markets', x: 1, y: 1, w: 2, h: 1 }, // overlaps weather -> re-placed
      ],
      lirr: { dest: '171' },
    });
    expect(cfg.layout).toHaveLength(2);
    expect(cfg.layout[1].y).toBe(0); // moved out of weather's rect
    expect(cfg.lirr.dest).toBe('171');
  });

  it('defaults transit alerts on, honors explicit opt-out', () => {
    expect(normalizeConfig({}).njt.alerts).toBe(true);
    const cfg = normalizeConfig({ v: 2, lirr: { dest: '', alerts: false } });
    expect(cfg.lirr.alerts).toBe(false);
    expect(cfg.njt.alerts).toBe(true);
  });

  it('defaults the subway status board to the Penn lines and art to 30 min', () => {
    const cfg = normalizeConfig({});
    expect(cfg.subway.lines).toEqual(['1', '2', '3']);
    expect(cfg.art).toEqual({ every: 30, cats: [] });
    const custom = normalizeConfig({ v: 2, subway: { lines: ['G'] }, art: { every: 5, cats: ['asian', 'bogus'] } });
    expect(custom.subway.lines).toEqual(['G']);
    expect(custom.art).toEqual({ every: 5, cats: ['asian'] });
  });

  it('throws on non-objects and unknown future versions', () => {
    expect(() => normalizeConfig(null)).toThrow(TypeError);
    expect(() => normalizeConfig('x')).toThrow(TypeError);
    expect(() => normalizeConfig({ v: 3 })).toThrow(TypeError);
    expect(() => normalizeConfig({ v: 99 })).toThrow(TypeError);
  });

  it('clamps name length and invalid mode/theme', () => {
    const cfg = normalizeConfig({ name: 'x'.repeat(99), mode: 'weird', theme: 'neon' });
    expect(cfg.name.length).toBeLessThanOrEqual(24);
    expect(cfg.mode).toBe('dashboard');
    expect(cfg.theme).toBe('dark');
  });
});

describe('encode/decode round trip', () => {
  it('round-trips a full config', async () => {
    const cfg = normalizeConfig({
      v: 2,
      name: 'Sean',
      t: 1782000000,
      loc: { lat: 40.75, lon: -73.99, label: 'Chelsea' },
      layout: [
        { id: 'weather', x: 0, y: 0, w: 3, h: 2 },
        { id: 'subway', x: 3, y: 0, w: 2, h: 2 },
        { id: 'worldclock', x: 5, y: 0, w: 1, h: 2 },
        { id: 'lirr', x: 0, y: 2, w: 3, h: 2 },
        { id: 'markets', x: 3, y: 2, w: 3, h: 2 },
      ],
      subway: { lines: ['4', '5', '6'] },
      lirr: { dest: '171' },
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
      v: 2,
      name: 'Maximiliano Longname',
      t: 2000000000,
      subway: { lines: ['4', '5', '6', 'N', 'Q', 'R'] },
      lirr: { dest: '171' },
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
