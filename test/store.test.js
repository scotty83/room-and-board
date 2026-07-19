// @vitest-environment happy-dom
// Storage resilience: the board runs unattended, so a quota or security throw
// from localStorage must never kill boot or silently eat a Save.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveConfig, loadConfig } from '../site/js/store.js';
import { normalizeConfig } from '../site/js/config.js';

function fakeStorage({ failFirstSet = false } = {}) {
  const map = new Map([
    ['sgn.cache.weather', 'x'],
    ['sgn.cache.golf', 'y'],
    ['unrelated-key', 'z'],
  ]);
  let failed = false;
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (failFirstSet && !failed) {
        failed = true;
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

const realDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
function stubStorage(st) {
  Object.defineProperty(window, 'localStorage', { value: st, configurable: true });
}
afterEach(() => {
  if (realDesc) Object.defineProperty(window, 'localStorage', realDesc);
  vi.unstubAllGlobals();
});

describe('store quota/availability resilience', () => {
  it('clears widget caches and retries when the config write hits quota', async () => {
    const st = fakeStorage({ failFirstSet: true });
    stubStorage(st);
    await saveConfig(normalizeConfig({}));
    expect(st._map.has('sgn.cfg')).toBe(true); // config won
    expect(st._map.has('sgn.cache.weather')).toBe(false); // caches sacrificed
    expect(st._map.has('sgn.cache.golf')).toBe(false);
    expect(st._map.has('unrelated-key')).toBe(true); // only our prefix
  });

  it('loadConfig returns null instead of throwing when storage is unavailable', async () => {
    stubStorage({ getItem: () => { throw new Error('SecurityError'); } });
    await expect(loadConfig()).resolves.toBeNull();
  });
});
