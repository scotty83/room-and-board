import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { mapChart, CHART_TOPICS } from '../../worker/src/chart.js';
import FIXTURE from './fixtures/statista-cotd.html?raw';

const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init, extraEnv = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), { ...env, ...extraEnv }, ctx);

const cacheKey = (kind, key) => new Request(`https://api.test/__cache/${kind}/${encodeURIComponent(key)}`);
const clearCache = (key) =>
  Promise.all([caches.default.delete(cacheKey('fresh', key)), caches.default.delete(cacheKey('stale', key))]);

describe('mapChart', () => {
  it('returns cards newest-first (not DOM order), capped, with charts[0] the newest', () => {
    const { charts } = mapChart(FIXTURE);
    // fixture: 2026-07-09 Nike card first, 2026-07-10 population card second
    expect(Array.isArray(charts)).toBe(true);
    expect(charts.length).toBeGreaterThanOrEqual(2);
    expect(charts.length).toBeLessThanOrEqual(10); // top ~10 only
    const c = charts[0];
    expect(c.id).toBe('28744');
    expect(c.date).toBe('2026-07-10');
    expect(c.title).toBe('How Global Population Growth Is Slowing');
    expect(c.url).toBe('https://cdn.statcdn.com/Infographic/images/normal/28744.jpeg');
    expect(c.link).toBe('https://www.statista.com/chart/28744/world-population-growth-timeline-and-forecast/');
    expect(c.desc.length).toBeGreaterThan(20);
    expect(c.desc).not.toMatch(/</); // tags stripped
    // Sorted strictly newest-first across the whole list.
    const dates = charts.map((x) => x.date);
    expect([...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))).toEqual(dates);
  });
  it('throws when no cards parse (so cached() serves stale)', () => {
    expect(() => mapChart('<html>consent wall</html>')).toThrow();
  });
});

describe('CHART_TOPICS', () => {
  it('is a non-empty [label, slug] allowlist with unique slugs', () => {
    expect(CHART_TOPICS.length).toBeGreaterThan(0);
    for (const t of CHART_TOPICS) {
      expect(Array.isArray(t)).toBe(true);
      expect(typeof t[0]).toBe('string');
      expect(typeof t[1]).toBe('string');
    }
    const slugs = CHART_TOPICS.map(([, s]) => s);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('GET /chart', () => {
  const someTopic = CHART_TOPICS[0][1];
  afterEach(async () => {
    await clearCache('chart');
    await clearCache(`chart:${someTopic}`);
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
    expect((await res.json()).charts[0].id).toBe('28744');
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
    expect((await res.json()).charts[0].date).toBe('2026-07-10');
  });

  it('502s when upstream fails with no cached copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    const res = await call('/chart');
    expect(res.status).toBe(502);
  });

  it('a valid ?topic= re-points the scrape at the per-topic page', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      urls.push(typeof input === 'string' ? input : input.url);
      return new Response(FIXTURE, { status: 200 });
    }));
    const res = await call(`/chart?topic=${encodeURIComponent(someTopic)}`);
    expect(res.status).toBe(200);
    expect((await res.json()).charts[0].id).toBe('28744');
    // The topic slug is appended to the listing URL (spaces URL-encoded).
    expect(urls[0]).toContain(`/chartoftheday/${encodeURIComponent(someTopic)}/`);
  });

  it('rejects an unknown topic with 400 (never blanks the card)', async () => {
    const stub = vi.fn(async () => new Response(FIXTURE, { status: 200 }));
    vi.stubGlobal('fetch', stub);
    const res = await call('/chart?topic=nonsense-not-a-topic');
    expect(res.status).toBe(400);
    expect(stub).not.toHaveBeenCalled(); // rejected before any upstream fetch
  });

  it('caches per-topic under chart:<topic>, separate from the global chart key', async () => {
    // Global fetch first — populates the `chart` key.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { status: 200 })));
    expect((await call('/chart')).status).toBe(200);
    // A topic request must NOT be served from the global cache: upstream is
    // stubbed to fail, so a shared key would surface the stale global copy (200).
    // A distinct `chart:<topic>` key means no cached copy → 502.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    const res = await call(`/chart?topic=${encodeURIComponent(someTopic)}`);
    expect(res.status).toBe(502);
  });
});
