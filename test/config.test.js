import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  encodeConfig,
  decodeConfig,
  pickNewest,
  WIDGET_IDS,
  WIDGET_GROUPS,
} from '../site/js/config.js';

describe('normalizeConfig', () => {
  it('fills v3 defaults for an empty object', () => {
    const cfg = normalizeConfig({});
    expect(cfg.v).toBe(3);
    expect(cfg.layout).toEqual(DEFAULT_CONFIG.layout);
    expect(cfg.widgets).toEqual(cfg.layout.map((r) => r.id)); // derived
    expect(cfg.mode).toBe('dashboard');
    expect(cfg.theme).toBe('dark');
    expect(cfg.loc).toEqual({ lat: 40.7506, lon: -73.9971, label: 'New York 10001', units: 'F' });
    expect(cfg.lirr).toEqual({ dest: '', alerts: true });
    expect(cfg.mnr).toEqual({ dest: '', alerts: true });
    expect(cfg.bus).toEqual({ legs: [] });
    expect(cfg.markets).toEqual({ symbols: ['^DJI', '^IXIC', '^GSPC'] });
    expect(normalizeConfig({ v: 2, markets: { symbols: [] } }).markets.symbols).toEqual(['^DJI', '^IXIC', '^GSPC']);
    expect(normalizeConfig({ v: 2, markets: { symbols: ['aapl', '^GSPC', 'bad ticker!', 'MSFT'] } }).markets.symbols).toEqual(['AAPL', '^GSPC', 'MSFT']);
    expect(normalizeConfig({ v: 2, bus: { stops: ['550685', 'junk', '12'] } }).bus).toEqual({ legs: [] });
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

describe('photos config', () => {
  it('defaults empty and sanitizes source/album/screensaver', () => {
    expect(normalizeConfig({}).photos).toEqual({ source: 'icloud', album: '', screensaver: false, every: 30 });
    const cfg = normalizeConfig({ photos: { source: 'icloud', album: 'B1m5fk75vLWwX', screensaver: true, every: 15 } });
    expect(cfg.photos).toEqual({ source: 'icloud', album: 'B1m5fk75vLWwX', screensaver: true, every: 15 });
    const bad = normalizeConfig({ photos: { source: 'myspace', album: 'nope!', screensaver: 'yes', every: 'soon' } });
    expect(bad.photos).toEqual({ source: 'icloud', album: '', screensaver: false, every: 30 });
    // every clamps like art.every (1–360 minutes)
    expect(normalizeConfig({ photos: { every: 0 } }).photos.every).toBe(1);
    expect(normalizeConfig({ photos: { every: 999 } }).photos.every).toBe(360);
  });
  it('accepts a gdrive source with a folder-id album', () => {
    const cfg = normalizeConfig({ photos: { source: 'gdrive', album: '1RHow60mcBwzMturimQSbziK3hqCvP2lz', screensaver: true, every: 15 } });
    expect(cfg.photos).toEqual({ source: 'gdrive', album: '1RHow60mcBwzMturimQSbziK3hqCvP2lz', screensaver: true, every: 15 });
    expect(normalizeConfig({ photos: { source: 'gdrive', album: 'nope!' } }).photos.album).toBe('');
    expect(normalizeConfig({ photos: { source: 'gdrive', album: 'short' } }).photos.album).toBe('');
    // icloud tokens are NOT valid gdrive ids by length alone — but a 10+ char
    // icloud-looking string is structurally a valid id; the source disambiguates.
    expect(normalizeConfig({ photos: { source: 'bogus', album: '1RHow60mcBwzMturimQSbziK3hqCvP2lz' } }).photos).toEqual({ source: 'icloud', album: '', screensaver: false, every: 30 });
  });
});

describe('weather units', () => {
  it('defaults to F, preserves C, sanitizes junk', () => {
    expect(normalizeConfig({}).loc.units).toBe('F');
    expect(normalizeConfig({ loc: { label: 'X', lat: 1, lon: 2, units: 'C' } }).loc.units).toBe('C');
    expect(normalizeConfig({ loc: { label: 'X', lat: 1, lon: 2, units: 'K' } }).loc.units).toBe('F');
  });
});

describe('marketsnews config', () => {
  it('defaults to all sources except Seeking Alpha and filters junk ids', () => {
    const DEFAULTS = ['mw', 'wsj-markets', 'ft-markets', 'cnbc', 'nyt-business', 'yahoo-finance'];
    expect(normalizeConfig({}).marketsnews.sources).toEqual(DEFAULTS);
    expect(normalizeConfig({ marketsnews: { sources: ['cnbc', 'bogus'] } }).marketsnews.sources).toEqual(['cnbc']);
    expect(normalizeConfig({ marketsnews: { sources: [] } }).marketsnews.sources).toEqual(DEFAULTS);
  });
});

describe('bus legs config', () => {
  it('defaults to empty legs', () => {
    expect(normalizeConfig({}).bus).toEqual({ legs: [] });
    expect(DEFAULT_CONFIG.bus).toEqual({ legs: [] });
  });
  it('migrates old stop-code config to empty legs', () => {
    expect(normalizeConfig({ bus: { stops: ['550789', '504123'] } }).bus).toEqual({ legs: [] });
  });
  it('keeps valid legs, caps at 2, drops junk, carries lineRef', () => {
    const legs = [
      { route: 'QM24', lineRef: 'MTABC_QM24', dir: 0, stopId: '550789', stopName: 'Madison Av / E 34 St' },
      { route: 'x27', lineRef: 'MTA NYCT_X27', dir: 1, stopId: '504123', stopName: 'Some Stop' }, // route case-insensitive
      { route: 'M15', lineRef: 'x', dir: 0, stopId: '1', stopName: 'x' },       // not express -> dropped
      { route: 'QM1', lineRef: 'x', dir: 5, stopId: '2', stopName: 'x' },       // bad dir -> dropped
      { route: 'QM2', lineRef: 'x', dir: 0, stopId: '', stopName: 'x' },        // empty stopId -> dropped
    ];
    const out = normalizeConfig({ bus: { legs } }).bus.legs;
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ route: 'QM24', lineRef: 'MTABC_QM24', dir: 0, stopId: '550789', stopName: 'Madison Av / E 34 St' });
    expect(out[1]).toEqual({ route: 'x27', lineRef: 'MTA NYCT_X27', dir: 1, stopId: '504123', stopName: 'Some Stop' });
  });
});

describe('parseDriveFolder', () => {
  const ID = '1RHow60mcBwzMturimQSbziK3hqCvP2lz';
  const load = async () => (await import('../site/js/util.js')).parseDriveFolder;
  it('extracts the id from shared links', async () => {
    const parseDriveFolder = await load();
    expect(parseDriveFolder(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(parseDriveFolder(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
  });
  it('accepts a bare id and rejects junk', async () => {
    const parseDriveFolder = await load();
    expect(parseDriveFolder(ID)).toBe(ID);
    expect(parseDriveFolder('not a link')).toBeNull();
    expect(parseDriveFolder('')).toBeNull();
  });
});

describe('services config', () => {
  const ALL = ['webex', 'zoom', 'slack', 'ubiquiti', 'cloudflare', 'github', 'm365', 'gworkspace', 'aws'];
  it('defaults to all nine services and filters junk ids', () => {
    expect(normalizeConfig({}).services.list).toEqual(ALL);
    expect(normalizeConfig({ services: { list: ['zoom', 'bogus'] } }).services.list).toEqual(['zoom']);
    expect(normalizeConfig({ services: { list: [] } }).services.list).toEqual(ALL);
  });
});

describe('apod widget id', () => {
  it('apod is a valid, grouped widget id', () => {
    expect(WIDGET_IDS).toContain('apod');
    expect(WIDGET_GROUPS.flatMap((g) => g.ids)).toContain('apod');
  });
});

describe('citibike config', () => {
  it('defaults to 3 office stations and caps custom at 6', () => {
    expect(normalizeConfig({}).citibike.stations).toHaveLength(3);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `S${i}` }));
    expect(normalizeConfig({ citibike: { stations: many } }).citibike.stations).toHaveLength(6);
    expect(normalizeConfig({ citibike: { stations: [{ id: 'a' }] } }).citibike.stations).toHaveLength(3);
  });
  it('strips a default citibike from the wire (custom is longer)', async () => {
    const def = await encodeConfig(normalizeConfig({}));
    const custom = await encodeConfig(normalizeConfig({ citibike: { stations: [{ id: 'zzzzzzzz-0000-0000-0000-000000000000', name: 'Custom Station Far Away' }] } }));
    expect(custom.length).toBeGreaterThan(def.length);
  });
});

describe('tfl config', () => {
  it('defaults to the 11 tube lines and drops junk ids', () => {
    expect(normalizeConfig({}).tfl.lines).toHaveLength(11);
    expect(normalizeConfig({ tfl: { lines: ['central', 'nope', 'central'] } }).tfl.lines).toEqual(['central']);
    expect(normalizeConfig({ tfl: { lines: [] } }).tfl.lines).toHaveLength(11);
  });
  it('strips a default tfl from the wire (custom is longer)', async () => {
    const def = await encodeConfig(normalizeConfig({}));
    const custom = await encodeConfig(normalizeConfig({ tfl: { lines: ['central', 'elizabeth', 'dlr'] } }));
    expect(custom.length).toBeGreaterThan(def.length);
  });
});
