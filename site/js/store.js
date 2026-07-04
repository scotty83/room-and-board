// localStorage persistence. The signage web-engine profile keeps this data
// across standby, reboots and RoomOS upgrades (per Cisco's WebEngine guide);
// the macro vault is the recovery layer if it is ever wiped.

import { encodeConfig, decodeConfig } from './config.js';

const CFG_KEY = 'sgn.cfg';
const CACHE_PREFIX = 'sgn.cache.';

// Resolve through window: Node >=22 defines a stub `localStorage` global that
// is undefined without a flag and would shadow the DOM one under test.
const storage = () => window.localStorage;

export async function loadConfig() {
  const raw = storage().getItem(CFG_KEY);
  if (!raw) return null;
  try {
    return await decodeConfig(raw);
  } catch {
    return null;
  }
}

export async function saveConfig(cfg) {
  storage().setItem(CFG_KEY, await encodeConfig(cfg));
}

export function saveCache(id, data, t = Math.floor(Date.now() / 1000)) {
  try {
    storage().setItem(CACHE_PREFIX + id, JSON.stringify({ t, data }));
  } catch {
    // Storage full or unavailable — cache is best-effort.
  }
}

export function loadCache(id) {
  try {
    const raw = storage().getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null; // storage unavailable — best-effort, mirroring saveCache
  }
}
