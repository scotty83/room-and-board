import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { mapChart } from '../../worker/src/chart.js';
import FIXTURE from './fixtures/statista-cotd.html?raw';

const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init, extraEnv = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), { ...env, ...extraEnv }, ctx);

const cacheKey = (kind, key) => new Request(`https://api.test/__cache/${kind}/${encodeURIComponent(key)}`);
const clearCache = (key) =>
  Promise.all([caches.default.delete(cacheKey('fresh', key)), caches.default.delete(cacheKey('stale', key))]);

describe('mapChart', () => {
  it('parses the cards and picks the newest by publish date, not DOM order', () => {
    const { chart } = mapChart(FIXTURE);
    // fixture: 2026-07-09 Nike card first, 2026-07-10 population card second
    expect(chart.id).toBe('28744');
    expect(chart.date).toBe('2026-07-10');
    expect(chart.title).toBe('How Global Population Growth Is Slowing');
    expect(chart.url).toBe('https://cdn.statcdn.com/Infographic/images/normal/28744.jpeg');
    expect(chart.link).toBe('https://www.statista.com/chart/28744/world-population-growth-timeline-and-forecast/');
    expect(chart.desc.length).toBeGreaterThan(20);
    expect(chart.desc).not.toMatch(/</); // tags stripped
  });
  it('throws when no cards parse (so cached() serves stale)', () => {
    expect(() => mapChart('<html>consent wall</html>')).toThrow();
  });
});

describe('GET /chart', () => {
  afterEach(async () => {
    await clearCache('chart');
    vi.unstubAllGlobals();
  });

  it('walks the sso redirect chain carrying cookies from every hop', async () => {
    // Real chain: /chartoftheday/ -> /sso/iplogin (sets STATSESSID) ->
    // /chartoftheday/ (sets __sso_iplogin) -> 200 once both cookies ride along.
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url, cookie: init?.headers?.Cookie ?? '' });
      if (calls.length === 1) {
        return new Response(null, { status: 302, headers: { 'Set-Cookie': 'STATSESSID=abc123; path=/; HttpOnly', Location: 'https://www.statista.com/sso/iplogin?__sso_redirect=/chartoftheday/' } });
      }
      if (calls.length === 2) {
        return new Response(null, { status: 302, headers: { 'Set-Cookie': '__sso_iplogin=ok; path=/', Location: '/chartoftheday/' } });
      }
      return new Response(FIXTURE, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }));
    const res = await call('/chart');
    expect(res.status).toBe(200);
    expect((await res.json()).chart.id).toBe('28744');
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain('/sso/iplogin');
    expect(calls[2].url).toContain('/chartoftheday/');
    expect(calls[2].cookie).toContain('STATSESSID=abc123');
    expect(calls[2].cookie).toContain('__sso_iplogin=ok');
  });

  it('serves without the bounce when the page answers 200 directly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { status: 200 })));
    const res = await call('/chart');
    expect(res.status).toBe(200);
    expect((await res.json()).chart.date).toBe('2026-07-10');
  });

  it('502s when upstream fails with no cached copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    const res = await call('/chart');
    expect(res.status).toBe(502);
  });
});
