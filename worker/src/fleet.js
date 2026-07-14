// Anonymous usage beacon (Tier 2 metrics): boards POST a tiny heartbeat to
// /beacon hourly; the route writes one Analytics Engine data point per ping.
// No KV (write caps), no caching, no PII — the device id is a random UUID the
// board generates locally, and tz is the coarse IANA zone name.

const MAX_BODY = 2048;
const MODES = new Set(['scheduled', 'dashboard', 'ambient']);

// Parse + validate a beacon body. Returns the normalized payload, or null for
// anything malformed (the route answers 400 — boards never retry beacons).
export function parseBeacon(text) {
  if (typeof text !== 'string' || text.length > MAX_BODY) return null;
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof b?.deviceId !== 'string' || !/^[a-f0-9-]{8,64}$/i.test(b.deviceId)) return null;
  if (!Array.isArray(b.widgets)) return null;
  // Widget ids are a leading letter then lowercase alphanumerics (e.g. 'f1',
  // 'worldcup') — digits MUST be allowed or numbered widgets like f1 get
  // silently dropped from adoption. Still rejects markup, numeric-only, oversized.
  const widgets = [...new Set(b.widgets.filter((w) => typeof w === 'string' && /^[a-z][a-z0-9]{1,19}$/.test(w)))].slice(0, 32);
  return {
    deviceId: b.deviceId.toLowerCase(),
    widgets,
    mode: MODES.has(b.mode) ? b.mode : 'unknown',
    version: typeof b.version === 'string' && /^[\w.-]{1,20}$/.test(b.version) ? b.version : 'unknown',
    tz: typeof b.tz === 'string' && /^[\w/+-]{1,40}$/.test(b.tz) ? b.tz : '',
  };
}

// Country is the ISO-3166 alpha-2 the edge resolved for the request (NOT the
// board — the board sends no location). 'XX' when unknown/absent.
const country = (c) => (typeof c === 'string' && /^[A-Z]{2}$/.test(c) ? c : 'XX');

// Cisco RoomOS WebEngine puts the device model in its User-Agent:
//   Mozilla/5.0 (Linux; RoomOS; Cisco Board Pro) AppleWebKit/...
// Parse it edge-side from the UA header (the board sends nothing). Non-RoomOS
// traffic (a desktop preview, the e2e test) has no such segment → 'other'.
export function deviceModel(ua) {
  const m = /RoomOS;\s*([^)]+)/i.exec(String(ua ?? ''));
  if (!m) return 'other';
  return m[1].replace(/\s*\(.*$/, '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'other';
}

// Analytics Engine shape. The index is the device id so AE's sampling keys on
// devices, not pings; blobs carry the dimensions, doubles the widget count.
// p.country and p.model are stamped by the route from the request, not the payload.
export function beaconDataPoint(p) {
  return {
    indexes: [p.deviceId],
    blobs: [p.deviceId, p.version, p.mode, p.tz, p.widgets.join(','), country(p.country), p.model || 'other'],
    doubles: [p.widgets.length],
  };
}
