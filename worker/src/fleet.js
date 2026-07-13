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
  const widgets = [...new Set(b.widgets.filter((w) => typeof w === 'string' && /^[a-z]{2,20}$/.test(w)))].slice(0, 32);
  return {
    deviceId: b.deviceId.toLowerCase(),
    widgets,
    mode: MODES.has(b.mode) ? b.mode : 'unknown',
    version: typeof b.version === 'string' && /^[\w.-]{1,20}$/.test(b.version) ? b.version : 'unknown',
    tz: typeof b.tz === 'string' && /^[\w/+-]{1,40}$/.test(b.tz) ? b.tz : '',
  };
}

// Analytics Engine shape. The index is the device id so AE's sampling keys on
// devices, not pings; blobs carry the dimensions, doubles the widget count.
export function beaconDataPoint(p) {
  return {
    indexes: [p.deviceId],
    blobs: [p.deviceId, p.version, p.mode, p.tz, p.widgets.join(',')],
    doubles: [p.widgets.length],
  };
}
