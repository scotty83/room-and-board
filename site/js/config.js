// Config schema, normalization and codec. Runs in browser (Chromium >=102),
// on user phones (setup page) and in Node >=20 (tests, tooling).

export const WIDGET_IDS = ['weather', 'subway', 'lirr', 'njt', 'art', 'history', 'aqi', 'quote'];

export const DEFAULT_CONFIG = Object.freeze({
  v: 1,
  t: 0,
  name: '',
  loc: Object.freeze({ lat: 40.754, lon: -73.984, label: 'Midtown' }),
  widgets: Object.freeze(['weather', 'subway', 'art', 'history', 'aqi', 'quote']),
  subway: Object.freeze({ stops: Object.freeze([]), lines: Object.freeze([]) }),
  lirr: Object.freeze({ orig: 'NYK', dest: '' }),
  njt: Object.freeze({ station: 'NY' }),
  mode: 'auto',
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

export function normalizeConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('config must be an object');
  }
  if (raw.v !== undefined && raw.v !== 1) {
    throw new TypeError(`unsupported config version: ${raw.v}`);
  }
  const d = DEFAULT_CONFIG;
  const widgets = Array.isArray(raw.widgets)
    ? raw.widgets.filter((w) => WIDGET_IDS.includes(w))
    : [...d.widgets];
  return {
    v: 1,
    t: num(raw.t, 0),
    name: str(raw.name, d.name, MAX_NAME),
    loc: {
      lat: num(raw.loc?.lat, d.loc.lat),
      lon: num(raw.loc?.lon, d.loc.lon),
      label: str(raw.loc?.label, d.loc.label, 40),
    },
    widgets,
    subway: {
      stops: strList(raw.subway?.stops, 8),
      lines: strList(raw.subway?.lines, 10),
    },
    lirr: {
      orig: str(raw.lirr?.orig, d.lirr.orig, 4),
      dest: str(raw.lirr?.dest, d.lirr.dest, 4),
    },
    njt: { station: str(raw.njt?.station, d.njt.station, 4) },
    mode: MODES.includes(raw.mode) ? raw.mode : d.mode,
    theme: THEMES.includes(raw.theme) ? raw.theme : d.theme,
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
  const bytes = new TextEncoder().encode(JSON.stringify(cfg));
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
