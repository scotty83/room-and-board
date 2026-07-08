// Config schema, normalization and codec. Runs in browser (Chromium >=102),
// on user phones (setup page) and in Node >=20 (tests, tooling).
//
// Schema v3 (2026-07-02): grid refined from 6x4 to 12x8 — v2 rects double.
// Schema v2 (2026-07-02): the ordered `widgets` list became `layout`
// ({id,x,y,w,h} on the 6×4 grid); `lirr` became a Penn-only branch filter;
// the default location moved to ZIP 10001. v1 configs migrate automatically.
// `widgets` survives as a derived convenience array (layout ids, in order).

import { DEFAULT_LAYOUT, normalizeLayout, migrateWidgetsToLayout } from './layout.js';

export const ART_CATS = [
  ['european', 'European'],
  ['american', 'American'],
  ['asian', 'Asian'],
];

export const WIDGET_IDS = [
  'weather', 'subway', 'lirr', 'mnr', 'njt', 'path', 'ferry', 'bus', 'art', 'photos', 'history', 'aqi', 'quote', 'wotd', 'markets', 'marketsnews', 'worldclock', 'sports', 'worldcup', 'news', 'substack', 'bsky',
];

// Display grouping for the widget pickers (board Settings and phone /setup).
// WIDGET_IDS above stays the validity source of truth; this is only on-screen
// order + categories, and must remain an exact partition of WIDGET_IDS
// (asserted in test/settings-logic.test.js).
export const WIDGET_GROUPS = [
  { label: 'Commute', ids: ['subway', 'lirr', 'mnr', 'njt', 'path', 'ferry', 'bus'] },
  { label: 'Weather & Air', ids: ['weather', 'aqi'] },
  { label: 'Markets & Sports', ids: ['markets', 'marketsnews', 'sports', 'worldcup'] },
  { label: 'News & Social', ids: ['news', 'substack', 'bsky'] },
  { label: 'Ambient', ids: ['art', 'photos', 'worldclock'] },
  { label: 'Daily Extras', ids: ['history', 'quote', 'wotd'] },
];

export const DEFAULT_CONFIG = Object.freeze({
  v: 3,
  t: 0,
  name: '',
  loc: Object.freeze({ lat: 40.7506, lon: -73.9971, label: 'New York 10001', units: 'F' }),
  layout: DEFAULT_LAYOUT,
  worldclock: Object.freeze({ cities: Object.freeze([
    { label: 'New York', zone: 'America/New_York' },
    { label: 'San Francisco', zone: 'America/Los_Angeles' },
    { label: 'London', zone: 'Europe/London' },
    { label: 'Hyderabad', zone: 'Asia/Kolkata' },
    { label: 'Hong Kong', zone: 'Asia/Hong_Kong' },
  ].map(Object.freeze)) }),
  // Status board defaults to the Penn Station lines (matches 10001 default).
  subway: Object.freeze({ lines: Object.freeze(['1', '2', '3']) }),
  lirr: Object.freeze({ dest: '', alerts: true }), // Penn board destination filter ('' = all trains)
  mnr: Object.freeze({ dest: '', alerts: true }), // Grand Central board destination filter
  bus: Object.freeze({ legs: Object.freeze([]) }), // up to 2 route-first legs
  markets: Object.freeze({ symbols: Object.freeze(['^DJI', '^IXIC', '^GSPC']) }), // removable like any ticker
  marketsnews: Object.freeze({ sources: Object.freeze(['cnbc', 'nyt-business']) }),
  sports: Object.freeze({ teams: Object.freeze([]) }), // [{lg, id}] up to 6
  news: Object.freeze({ sources: Object.freeze(['nyt-home', 'nyt-nyregion']) }),
  // Starter accounts (AI/tech/finance, politically neutral, verified active
  // 2026-07-05) — removable entries like the markets tickers.
  substack: Object.freeze({ pubs: Object.freeze([
    { id: 'oneusefulthing', label: 'One Useful Thing' },
    { id: 'importai', label: 'Import AI' },
    { id: 'netinterest', label: 'Net Interest' },
    { id: 'pragmaticengineer', label: 'The Pragmatic Engineer' },
    { id: 'exponentialview', label: 'Exponential View' },
  ].map(Object.freeze)) }),
  bsky: Object.freeze({ handles: Object.freeze([
    { id: 'bloomberg.com', label: 'Bloomberg' },
    { id: 'reuters.com', label: 'Reuters' },
    { id: 'theverge.com', label: 'The Verge' },
    { id: 'emollick.bsky.social', label: 'Ethan Mollick' },
    { id: 'simonwillison.net', label: 'Simon Willison' },
  ].map(Object.freeze)) }),
  njt: Object.freeze({ station: 'NY', alerts: true }),
  path: Object.freeze({ station: '33S', dir: 'both' }), // ridepath consideredStation code
  ferry: Object.freeze({ landing: '17' }), // NYC Ferry stop_id (East 34th Street)
  art: Object.freeze({ every: 30, cats: Object.freeze([]) }), // rotation minutes; [] = all categories
  photos: Object.freeze({ source: 'icloud', album: '', screensaver: false }), // iCloud shared-album token
  mode: 'dashboard',
  theme: 'dark',
});

const MODES = ['auto', 'dashboard', 'ambient'];
const THEMES = ['dark', 'light'];
const MAX_NAME = 24;

const str = (v, fallback, max = 64) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const isZone = (z) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
};
const strList = (v, max = 12) =>
  Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, max) : [];

// v1 shipped with a Midtown default; migrated configs still carrying it get
// the new 10001 default instead of a stale "chosen" location.
function normalizeLoc(rawLoc) {
  const d = DEFAULT_CONFIG.loc;
  if (!rawLoc || rawLoc.label === 'Midtown') return { ...d };
  return {
    lat: num(rawLoc.lat, d.lat),
    lon: num(rawLoc.lon, d.lon),
    label: str(rawLoc.label, d.label, 40),
    units: rawLoc.units === 'C' ? 'C' : 'F',
  };
}

export function normalizeConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('config must be an object');
  }
  if (raw.v !== undefined && ![1, 2, 3].includes(raw.v)) {
    throw new TypeError(`unsupported config version: ${raw.v}`);
  }
  // v2 layouts lived on a 6x4 grid; double onto today's 12x8.
  const rawLayout = Array.isArray(raw.layout)
    ? raw.v === 2
      ? raw.layout.map((r) => ({ id: r.id, x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2 }))
      : raw.layout
    : null;
  const layout =
    rawLayout && rawLayout.length
      ? normalizeLayout(rawLayout)
      : Array.isArray(raw.widgets)
        ? migrateWidgetsToLayout(raw.widgets)
        : [...DEFAULT_LAYOUT];

  return {
    v: 3,
    t: num(raw.t, 0),
    name: str(raw.name, DEFAULT_CONFIG.name, MAX_NAME),
    loc: normalizeLoc(raw.loc),
    layout,
    widgets: layout.map((r) => r.id),
    subway: {
      // Status board: lines only (stops/alerts fields from older configs drop).
      lines: strList(raw.subway?.lines, 24).length
        ? strList(raw.subway?.lines, 24)
        : [...DEFAULT_CONFIG.subway.lines],
    },
    lirr: {
      dest: str(raw.lirr?.dest, '', 4), // older branches configs fall back to all trains
      alerts: raw.lirr?.alerts !== false,
    },
    mnr: {
      dest: str(raw.mnr?.dest, '', 4),
      alerts: raw.mnr?.alerts !== false,
    },
    bus: {
      legs: (Array.isArray(raw.bus?.legs) ? raw.bus.legs : [])
        .filter((l) =>
          l && /^(QM|BM|SIM|X)\d+[A-Z]?$/i.test(String(l.route ?? '')) &&
          (l.dir === 0 || l.dir === 1) &&
          typeof l.stopId === 'string' && l.stopId.length > 0)
        .slice(0, 2)
        .map((l) => ({ route: String(l.route), lineRef: String(l.lineRef ?? ''), dir: l.dir, stopId: String(l.stopId), stopName: String(l.stopName ?? '') })),
    },
    sports: {
      teams: (Array.isArray(raw.sports?.teams) ? raw.sports.teams : [])
        .filter((t) => typeof t?.lg === 'string' && typeof t?.id === 'string')
        .map((t) => ({ lg: t.lg, id: t.id.toLowerCase().slice(0, 8) }))
        .slice(0, 6),
    },
    news: {
      sources: (() => {
        const list = strList(raw.news?.sources, 7);
        return list.length ? list : [...DEFAULT_CONFIG.news.sources];
      })(),
    },
    // Short-lived combined `posts` configs (2026-07-05) migrate into the two
    // split widgets; the account shape {id, label} stays.
    // An empty follow list falls back to the starter accounts (a card with
    // zero accounts is never useful — remove the widget instead), matching
    // the markets-tickers convention.
    substack: {
      pubs: (() => {
        const list = [
          ...(Array.isArray(raw.substack?.pubs) ? raw.substack.pubs : []),
          ...(Array.isArray(raw.posts?.accounts) ? raw.posts.accounts.filter((a) => a?.net === 'substack') : []),
        ]
          .filter((a) => /^[a-z0-9-]{2,64}$/.test(a?.id ?? ''))
          .map((a) => ({ id: a.id, label: str(a.label, a.id, 30) }))
          .slice(0, 6);
        return list.length ? list : DEFAULT_CONFIG.substack.pubs.map((a) => ({ ...a }));
      })(),
    },
    bsky: {
      handles: (() => {
        const list = [
          ...(Array.isArray(raw.bsky?.handles) ? raw.bsky.handles : []),
          ...(Array.isArray(raw.posts?.accounts) ? raw.posts.accounts.filter((a) => a?.net === 'bsky') : []),
        ]
          .filter((a) => /^[a-z0-9.-]{4,253}$/i.test(a?.id ?? ''))
          .map((a) => ({ id: a.id, label: str(a.label, a.id, 30) }))
          .slice(0, 6);
        return list.length ? list : DEFAULT_CONFIG.bsky.handles.map((a) => ({ ...a }));
      })(),
    },
    markets: {
      // An empty list falls back to the defaults (a markets card with zero
      // tickers is never useful — remove the widget instead).
      symbols: (() => {
        const list = strList(raw.markets?.symbols, 10)
          .map((t) => t.toUpperCase())
          .filter((t) => /^[\^A-Z0-9.\-]{1,10}$/.test(t));
        return list.length ? list : [...DEFAULT_CONFIG.markets.symbols];
      })(),
    },
    marketsnews: {
      sources: (() => {
        const valid = new Set(['mw', 'wsj-markets', 'ft-markets', 'sa', 'cnbc', 'nyt-business', 'yahoo-finance']); // MARKET_SOURCES ids
        const picked = (Array.isArray(raw.marketsnews?.sources) ? raw.marketsnews.sources : []).filter((s) => valid.has(s));
        return picked.length ? picked : ['cnbc', 'nyt-business'];
      })(),
    },
    njt: {
      station: str(raw.njt?.station, DEFAULT_CONFIG.njt.station, 4),
      alerts: raw.njt?.alerts !== false,
    },
    path: {
      station: /^[A-Z0-9]{3}$/.test(raw.path?.station ?? '') ? raw.path.station : DEFAULT_CONFIG.path.station,
      dir: ['both', 'ToNY', 'ToNJ'].includes(raw.path?.dir) ? raw.path.dir : DEFAULT_CONFIG.path.dir,
    },
    ferry: {
      landing: /^\d{1,4}$/.test(raw.ferry?.landing ?? '') ? raw.ferry.landing : DEFAULT_CONFIG.ferry.landing,
    },
    art: {
      every: Math.min(Math.max(num(raw.art?.every, 30), 1), 360),
      cats: strList(raw.art?.cats, 6).filter((c) => ART_CATS.some(([id]) => id === c)),
    },
    photos: {
      source: 'icloud', // only source today; the discriminator reserves the slot for more
      album: /^[A-Za-z0-9]{8,25}$/.test(raw.photos?.album ?? '') ? raw.photos.album : '',
      screensaver: raw.photos?.screensaver === true,
    },
    worldclock: {
      cities: (() => {
        const seen = new Set();
        const list = (Array.isArray(raw.worldclock?.cities) ? raw.worldclock.cities : [])
          .filter((c) => typeof c?.label === 'string' && typeof c?.zone === 'string' && isZone(c.zone))
          .map((c) => ({ label: c.label.trim().slice(0, 24), zone: c.zone }))
          .filter((c) => c.label && !seen.has(`${c.label}|${c.zone}`) && !!seen.add(`${c.label}|${c.zone}`))
          .slice(0, 10);
        return list.length ? list : DEFAULT_CONFIG.worldclock.cities.map((c) => ({ ...c }));
      })(),
    },
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULT_CONFIG.mode,
    theme: THEMES.includes(raw.theme) ? raw.theme : DEFAULT_CONFIG.theme,
  };
}

function bytesToBase64url(buf) {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64urlToBytes(str) {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) throw new Error('invalid base64url');
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeConfig(cfg) {
  // Keep the wire format minimal: `widgets` is derived from layout, and
  // follow lists equal to the starter defaults re-derive on decode (only
  // customized lists pay for their bytes in the URL fragment).
  const { widgets, ...wire } = cfg;
  const isDefault = (list, defs) => JSON.stringify(list) === JSON.stringify(defs);
  if (wire.substack && isDefault(wire.substack.pubs, DEFAULT_CONFIG.substack.pubs)) delete wire.substack;
  if (wire.bsky && isDefault(wire.bsky.handles, DEFAULT_CONFIG.bsky.handles)) delete wire.bsky;
  if (wire.photos && isDefault(wire.photos, DEFAULT_CONFIG.photos)) delete wire.photos; // unconfigured → re-derives on decode
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  return bytesToBase64url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeConfig(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('empty config string');
  }
  const compressed = base64urlToBytes(encoded);
  const bytes = await pipe(compressed, new DecompressionStream('deflate-raw'));
  return normalizeConfig(JSON.parse(new TextDecoder().decode(bytes)));
}

export function pickNewest(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return (b.t ?? 0) > (a.t ?? 0) ? b : a;
}
