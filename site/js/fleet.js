// Anonymous usage heartbeat (Tier 2 metrics): once an hour the board POSTs a
// tiny payload to the worker's /fleet route so the operator can count active
// devices and see widget adoption. No PII — a random locally-generated device
// id, the widget ids on the layout, the display mode, the running site
// version, and the coarse IANA timezone. Toggle: Settings → Diagnostics
// ("Anonymous usage ping", cfg.beacon); the tick re-reads the config so a
// saved toggle takes effect without a reload.

import { schedule } from './scheduler.js';
import { fetchJSON } from './net.js';
import { WORKER_URL } from './env.js';

const DEVICE_KEY = 'sgn.device';
const HOUR_MS = 60 * 60 * 1000;

// Stable random device id, persisted in localStorage. Regenerated if storage
// was wiped (Diagnostics "Clear web storage") — anonymity-preserving.
export function deviceId(storage) {
  let id = null;
  try {
    id = storage.getItem(DEVICE_KEY);
  } catch {
    // storage unavailable: fall through to a per-session id
  }
  if (id && /^[a-f0-9-]{8,64}$/i.test(id)) return id;
  id = crypto.randomUUID();
  try {
    storage.setItem(DEVICE_KEY, id);
  } catch {
    // best effort
  }
  return id;
}

export function beaconPayload(cfg, id, version) {
  return {
    deviceId: id,
    widgets: (cfg.layout ?? []).map((r) => r.id),
    mode: cfg.mode,
    version: version || 'unknown',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  };
}

// Fire-and-forget POST. A plain-string body is a "simple request" (text/plain,
// no CORS preflight); sendBeacon also survives page unload/reload.
export function postBeacon(payload, nav = navigator) {
  const body = JSON.stringify(payload);
  const url = `${WORKER_URL}/fleet`;
  if (nav.sendBeacon?.(url, body)) return;
  fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
}

// Hourly loop. The page reloads on every deploy (self-healing version check),
// so the running version is constant per page lifetime — fetched once here.
export function startBeacon(getCfg) {
  const id = deviceId(window.localStorage);
  const versionP = fetchJSON('version.json').then((v) => v.version).catch(() => 'unknown');
  return schedule(async () => {
    const cfg = getCfg();
    if (!cfg || cfg.beacon === false) return;
    postBeacon(beaconPayload(cfg, id, await versionP));
  }, HOUR_MS);
}
