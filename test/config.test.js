import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  pickNewest,
} from '../site/js/config.js';

describe('normalizeConfig', () => {
  it('fills v3 defaults for an empty object', () => {
    const cfg = normalizeConfig({});
    expect(cfg.v).toBe(3);
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
    expect(cfg.v).toBe(3);
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

  it('defaults worldclock to the five offices and validates custom cities', () => {
    const cfg = normalizeConfig({});
    expect(cfg.worldclock.cities).toHaveLength(5);
    expect(cfg.worldclock.cities[0]).toEqual({ label: 'New York', zone: 'America/New_York' });
    expect(cfg.worldclock.cities.map((c) => c.label)).toContain('San Francisco');

    const custom = normalizeConfig({ v: 3, worldclock: { cities: [
      { label: 'Tokyo', zone: 'Asia/Tokyo' },
      { label: 'Nowhere', zone: 'Fake/Zone' },          // invalid zone -> dropped
      { label: 'Tokyo', zone: 'Asia/Tokyo' },            // dupe -> dropped
      { label: '', zone: 'Europe/Paris' },               // empty label -> dropped
      { label: 'A very very long label over 24 chars!!', zone: 'Europe/Paris' },
    ] } });
    expect(custom.worldclock.cities).toEqual([
      { label: 'Tokyo', zone: 'Asia/Tokyo' },
      { label: 'A very very long label o', zone: 'Europe/Paris' },
    ]);

    const many = normalizeConfig({ v: 3, worldclock: { cities: Array.from({ length: 14 }, (_, i) => ({ label: `City ${i}`, zone: 'Asia/Tokyo' })) } });
    expect(many.worldclock.cities).toHaveLength(10);

    expect(normalizeConfig({ v: 3, worldclock: { cities: [] } }).worldclock.cities).toHaveLength(5); // empty -> defaults
  });

  it('throws on non-objects and unknown future versions', () => {
    expect(() => normalizeConfig(null)).toThrow(TypeError);
    expect(() => normalizeConfig('x')).toThrow(TypeError);
    expect(() => normalizeConfig({ v: 4 })).toThrow(TypeError);
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
    // A maximal config must leave ample headroom inside the 2048-char
    // signage URL (which also carries ~100 chars of bridge auth).
    const cfg = normalizeConfig({
      v: 2,
      name: 'Maximiliano Longname',
      t: 2000000000,
      subway: { lines: ['4', '5', '6', 'N', 'Q', 'R', 'A', 'C', 'E', 'L'] },
      lirr: { dest: '171' },
      mnr: { dest: '105' },
      njt: { station: 'NY' },
      bus: { stops: ['550685', '401234'] },
      sports: { teams: [{ lg: 'mlb', id: 'nym' }, { lg: 'nfl', id: 'nyj' }, { lg: 'nba', id: 'nyk' }, { lg: 'nhl', id: 'nyr' }, { lg: 'mls', id: 'nyc' }, { lg: 'epl', id: 'ars' }] },
      markets: { symbols: ['^DJI', '^IXIC', '^GSPC', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOG', 'META'] },
      news: { sources: ['nyt-home', 'nyt-us', 'nyt-business', 'npr', 'bbc', 'nyt-nyregion', 'gothamist'] },
      substack: { pubs: Array.from({ length: 6 }, (_, i) => ({ id: `custompublication${i}`, label: `A Custom Publication Name ${i}` })) },
      bsky: { handles: Array.from({ length: 6 }, (_, i) => ({ id: `somelongname${i}.bsky.social`, label: `Custom Person Number ${i}` })) },
      worldclock: { cities: [
        { label: 'New York', zone: 'America/New_York' }, { label: 'San Francisco', zone: 'America/Los_Angeles' },
        { label: 'Kansas City', zone: 'America/Chicago' }, { label: 'Bermuda', zone: 'Atlantic/Bermuda' },
        { label: 'London', zone: 'Europe/London' }, { label: 'Luxembourg', zone: 'Europe/Luxembourg' },
        { label: 'Hyderabad', zone: 'Asia/Kolkata' }, { label: 'Hong Kong', zone: 'Asia/Hong_Kong' },
        { label: 'Shanghai', zone: 'Asia/Shanghai' }, { label: 'Singapore', zone: 'Asia/Singapore' },
      ] },
    });
    const enc = await encodeConfig(cfg);
    // 2048-char URL minus ~100 chars of bridge auth leaves ~1900 for the
    // fragment; the fully-maxed config (10 tickers, 10 clock cities, 7 feeds,
    // 12 fully-custom follow accounts) measures ~1120, so 1200 still guards
    // ~1.6x headroom. Default follow lists are stripped from the wire and
    // re-derived on decode, so untouched boards stay far smaller.
    expect(enc.length).toBeLessThan(1200);

    const plain = await encodeConfig(normalizeConfig({}));
    expect(plain.length).toBeLessThan(700); // starter lists never ship
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

describe('path/ferry/wotd config (v3 additive)', () => {
  it('defaults path to 33rd St both directions and ferry to East 34th St', () => {
    const cfg = normalizeConfig({});
    expect(cfg.path).toEqual({ station: '33S', dir: 'both' });
    expect(cfg.ferry).toEqual({ landing: '17' });
  });
  it('keeps valid values and falls back on junk', () => {
    const cfg = normalizeConfig({ path: { station: 'HOB', dir: 'ToNY' }, ferry: { landing: '87' } });
    expect(cfg.path).toEqual({ station: 'HOB', dir: 'ToNY' });
    expect(cfg.ferry.landing).toBe('87');
    const bad = normalizeConfig({ path: { station: 'X;DROP', dir: 'sideways' }, ferry: { landing: 'x' } });
    expect(bad.path).toEqual({ station: '33S', dir: 'both' });
    expect(bad.ferry.landing).toBe('17');
  });
  it('accepts the new ids in layouts', () => {
    const cfg = normalizeConfig({ layout: [
      { id: 'path', x: 0, y: 0, w: 3, h: 3 },
      { id: 'ferry', x: 3, y: 0, w: 3, h: 3 },
      { id: 'wotd', x: 6, y: 0, w: 2, h: 2 },
    ] });
    expect(cfg.widgets).toEqual(['path', 'ferry', 'wotd']);
  });
});

describe('substack/bsky config', () => {
  it('defaults to the starter accounts and sanitizes entries', () => {
    const cfg = normalizeConfig({});
    expect(cfg.substack.pubs).toEqual(DEFAULT_CONFIG.substack.pubs.map((a) => ({ ...a })));
    expect(cfg.bsky.handles).toEqual(DEFAULT_CONFIG.bsky.handles.map((a) => ({ ...a })));
    // Emptied lists fall back to the starters (markets-tickers convention).
    expect(normalizeConfig({ substack: { pubs: [] } }).substack.pubs.length).toBe(5);
    const filled = normalizeConfig({
      substack: { pubs: [{ id: 'astralcodexten', label: 'ACX' }, { id: 'Bad Slug!', label: 'x' }] },
      bsky: { handles: [{ id: 'nytimes.com', label: 'NYT' }] },
    });
    expect(filled.substack.pubs).toEqual([{ id: 'astralcodexten', label: 'ACX' }]);
    expect(filled.bsky.handles).toEqual([{ id: 'nytimes.com', label: 'NYT' }]);
  });
  it('migrates the short-lived combined posts config', () => {
    const cfg = normalizeConfig({ posts: { accounts: [
      { net: 'substack', id: 'astralcodexten', label: 'ACX' },
      { net: 'bsky', id: 'nytimes.com', label: 'NYT' },
    ] } });
    expect(cfg.substack.pubs).toEqual([{ id: 'astralcodexten', label: 'ACX' }]);
    expect(cfg.bsky.handles).toEqual([{ id: 'nytimes.com', label: 'NYT' }]);
    expect(cfg.posts).toBeUndefined();
  });
});
