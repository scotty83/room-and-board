import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { loadConfig, saveConfig, loadCache, saveCache } from '../site/js/store.js';
import { schedule } from '../site/js/scheduler.js';
import { resolveMode } from '../site/js/modes.js';
import { normalizeConfig, encodeConfig } from '../site/js/config.js';

// store.js resolves storage via window.localStorage; provide a conformant
// in-memory implementation (Node's own localStorage global is a flag-gated
// stub, and vitest's DOM environments cannot override it).
const mem = new Map();
const fakeStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

beforeAll(() => {
  vi.stubGlobal('window', { localStorage: fakeStorage });
});

beforeEach(() => window.localStorage.clear());

describe('store', () => {
  it('round-trips config through localStorage', async () => {
    const cfg = normalizeConfig({ name: 'Sean', t: 42 });
    await saveConfig(cfg);
    expect(await loadConfig()).toEqual(cfg);
  });
  it('returns null for missing or corrupt config', async () => {
    expect(await loadConfig()).toBeNull();
    fakeStorage.setItem('sgn.cfg', '!!corrupt!!');
    expect(await loadConfig()).toBeNull();
  });
  it('round-trips feed caches with timestamps', () => {
    saveCache('weather', { now: { temp: 80 } }, 1234);
    expect(loadCache('weather')).toEqual({ t: 1234, data: { now: { temp: 80 } } });
    expect(loadCache('missing')).toBeNull();
  });
});

describe('scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs immediately, then at jittered intervals', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const cancel = schedule(fn, 1000, { jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps jitter within bounds', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const delays = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms) => {
      delays.push(ms);
      return origSetTimeout(cb, ms);
    });
    const cancel = schedule(fn, 1000, { jitter: 0.2 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1300);
    cancel();
    for (const d of delays.slice(1)) {
      expect(d).toBeGreaterThanOrEqual(800);
      expect(d).toBeLessThanOrEqual(1200);
    }
  });

  it('backs off exponentially on failure and resets on success', async () => {
    let failures = 3;
    const fn = vi.fn().mockImplementation(() =>
      failures-- > 0 ? Promise.reject(new Error('x')) : Promise.resolve(),
    );
    const delays = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms) => {
      delays.push(ms);
      return origSetTimeout(cb, ms);
    });
    const cancel = schedule(fn, 1000, { jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);      // fail 1
    await vi.advanceTimersByTimeAsync(2000);   // fail 2 (delay 2000)
    await vi.advanceTimersByTimeAsync(4000);   // fail 3 (delay 4000)
    await vi.advanceTimersByTimeAsync(8000);   // success (delay 8000)
    await vi.advanceTimersByTimeAsync(1000);   // back to base
    cancel();
    expect(delays.slice(1, 5)).toEqual([2000, 4000, 8000, 1000]);
  });

  it('caps backoff at 8x the interval', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    const delays = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms) => {
      delays.push(ms);
      return origSetTimeout(cb, ms);
    });
    const cancel = schedule(fn, 1000, { jitter: 0 });
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(8000);
    cancel();
    expect(Math.max(...delays)).toBe(8000);
  });
});

describe('resolveMode', () => {
  const cfg = (mode) => ({ mode });
  const at = (h, m = 0) => new Date(2026, 6, 2, h, m); // a Thursday
  it('respects explicit modes', () => {
    expect(resolveMode(cfg('dashboard'), at(23))).toBe('dashboard');
    expect(resolveMode(cfg('ambient'), at(8))).toBe('ambient');
  });
  it('auto: dashboard during commute windows, ambient otherwise', () => {
    expect(resolveMode(cfg('auto'), at(6))).toBe('dashboard');
    expect(resolveMode(cfg('auto'), at(9, 59))).toBe('dashboard');
    expect(resolveMode(cfg('auto'), at(10))).toBe('ambient');
    expect(resolveMode(cfg('auto'), at(15))).toBe('dashboard');
    expect(resolveMode(cfg('auto'), at(19, 59))).toBe('dashboard');
    expect(resolveMode(cfg('auto'), at(20))).toBe('ambient');
    expect(resolveMode(cfg('auto'), at(2))).toBe('ambient');
  });
});
