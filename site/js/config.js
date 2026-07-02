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
  'weather', 'subway', 'lirr', 'mnr', 'njt', 'bus', 'art', 'history', 'aqi', 'quote', 'markets', 'worldclock', 'sports', 'worldcup', 'news',
];

export const DEFAULT_CONFIG = Object.freeze({
  v: 3,
  t: 0,
  name: '',
  loc: Object.freeze({ lat: 40.7506, lon: -73.9971, label: 'New York 10001' }),
  layout: DEFAULT_LAYOUT,
  // Status board defaults to the Penn Station lines (matches 10001 default).
  subway: Object.freeze({ lines: Object.freeze(['1', '2', '3']) }),
  lirr: Object.freeze({ dest: '', alerts: true }), // Penn board destination filter ('' = all trains)
  mnr: Object.freeze({ dest: '', alerts: true }), // Grand Central board destination filter
  bus: Object.freeze({ stops: Object.freeze([]) }), // 6-digit bus stop codes, up to 2
  markets: Object.freeze({ symbols: Object.freeze(['^DJI', '^IXIC', '^GSPC']) }), // removable like any ticker
  sports: Object.freeze({ teams: Object.freeze([]) }), // [{lg, id}] up to 6
  news: Object.freeze({ sources: Object.freeze(['nyt-home', 'nyt-nyregion']) }),
  njt: Object.freeze({ station: 'NY', alerts: true }),
  art: Object.freeze({ every: 30, cats: Object.freeze([]) }), // rotation minutes; [] = all categories
  mode: 'dashboard',
  theme: 'dark',
});

const MODES = ['auto', 'dashboard', 'ambient'];
const THEMES = ['dark', 'light'];
const MAX_NAME = 24;

const str = (v, fallback, max = 64) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
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
    bus: { stops: strList(raw.bus?.stops, 2).filter((c) => /^\d{4,7}$/.test(c)) },
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
    njt: {
      station: str(raw.njt?.station, DEFAULT_CONFIG.njt.station, 4),
      alerts: raw.njt?.alerts !== false,
    },
    art: {
      every: Math.min(Math.max(num(raw.art?.every, 30), 1), 360),
      cats: strList(raw.art?.cats, 6).filter((c) => ART_CATS.some(([id]) => id === c)),
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
  // `widgets` is derived from layout; keep the wire format minimal.
  const { widgets, ...wire } = cfg;
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
