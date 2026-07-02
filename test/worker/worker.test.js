import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { resetNjtToken } from '../../worker/src/njt.js';

const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init, extraEnv = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), { ...env, ...extraEnv }, ctx);

const NJT_ENV = { NJT_USER: 'user', NJT_PASS: 'pass' };

// Route-based fetch stub: routes = [{match: RegExp, status, body}], each entry
// consumed in order per matching URL; records calls for assertions.
function stubFetch(routes) {
  const calls = [];
  const stub = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push(url);
    const route = routes.find((r) => r.match.test(url) && (r.times ?? 1) > 0);
    if (!route) throw new Error(`unmocked fetch: ${url}`);
    route.times = (route.times ?? 1) - 1;
    return new Response(
      typeof route.body === 'string' ? route.body : JSON.stringify(route.body),
      { status: route.status ?? 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', stub);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetNjtToken();
});

describe('CORS and routing', () => {
  it('handles OPTIONS preflight', async () => {
    const res = await call('/code', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('404s unknown routes with CORS', async () => {
    const res = await call('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('/code exchange', () => {
  it('stores a config and returns a 6-char single-use code', async () => {
    const post = await call('/code', {
      method: 'POST',
      body: JSON.stringify({ cfg: 'abc123_-' }),
    });
    expect(post.status).toBe(200);
    const { code } = await post.json();
    expect(code).toMatch(/^[A-HJ-NP-TV-Z0-9]{6}$/);

    const get1 = await call(`/code/${code}`);
    expect(get1.status).toBe(200);
    expect((await get1.json()).cfg).toBe('abc123_-');

    const get2 = await call(`/code/${code}`);
    expect(get2.status).toBe(404); // single use
  });
  it('is case-insensitive on retrieval', async () => {
    const post = await call('/code', { method: 'POST', body: JSON.stringify({ cfg: 'x' }) });
    const { code } = await post.json();
    const res = await call(`/code/${code.toLowerCase()}`);
    expect(res.status).toBe(200);
  });
  it('rejects bad bodies and oversized configs', async () => {
    expect((await call('/code', { method: 'POST', body: 'not json' })).status).toBe(400);
    expect((await call('/code', { method: 'POST', body: JSON.stringify({}) })).status).toBe(400);
    const big = JSON.stringify({ cfg: 'x'.repeat(5000) });
    expect((await call('/code', { method: 'POST', body: big })).status).toBe(413);
  });
  it('404s unknown codes', async () => {
    expect((await call('/code/ZZZZZZ')).status).toBe(404);
  });
});

// Upstream fixtures in NJT RailData's response shape (verify against the
// live API when credentials arrive; the mapping is isolated in njt.js).
const TOKEN_RESPONSE = { UserToken: 'tok-1' };
const SCHEDULE_RESPONSE = {
  STATION_2CHAR: 'NY',
  ITEMS: [
    {
      SCHED_DEP_DATE: '02-Jul-2026 08:15:00 AM',
      DESTINATION: 'Trenton',
      TRACK: '3',
      LINE: 'Northeast Corridor',
      STATUS: 'BOARDING',
    },
  ],
};

describe('/njt/departures', () => {
  beforeEach(async () => {
    await env.CODES.delete('njt:NY:last');
    await env.CODES.delete('njt:NY:cachedAt');
  });

  it('503s when secrets are not configured', async () => {
    const res = await call('/njt/departures?station=NY');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('njt_not_configured');
  });

  it('fetches, maps and caches upstream departures', async () => {
    const calls = stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    const res = await call('/njt/departures?station=NY', {}, NJT_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.station).toBe('NY');
    expect(body.stale).toBe(false);
    expect(body.trains).toHaveLength(1);
    const train = body.trains[0];
    expect(train.dest).toBe('Trenton');
    expect(train.track).toBe('3');
    expect(train.line).toBe('Northeast Corridor');
    // 08:15 AM America/New_York on 2026-07-02 is 12:15 UTC (EDT).
    expect(train.time).toBe(Date.UTC(2026, 6, 2, 12, 15, 0) / 1000);

    // Second call inside the TTL is served from KV without touching upstream.
    const before = calls.length;
    const res2 = await call('/njt/departures?station=NY', {}, NJT_ENV);
    expect(res2.status).toBe(200);
    expect((await res2.json()).trains).toHaveLength(1);
    expect(calls.length).toBe(before);
  });

  it('retries once with a fresh token when the schedule call fails', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'expired', status: 401 },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    const res = await call('/njt/departures?station=NY', {}, NJT_ENV);
    expect(res.status).toBe(200);
    expect((await res.json()).trains).toHaveLength(1);
  });

  it('serves stale data when upstream fails after a success', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    await call('/njt/departures?station=NY', {}, NJT_ENV);
    await env.CODES.delete('njt:NY:cachedAt'); // force refetch
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'err', status: 500, times: 2 },
    ]);
    const res = await call('/njt/departures?station=NY', {}, NJT_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.trains).toHaveLength(1);
  });

  it('502s when upstream fails with no cached copy', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'err', status: 500, times: 2 },
    ]);
    const res = await call('/njt/departures?station=NY', {}, NJT_ENV);
    expect(res.status).toBe(502);
  });

  it('rejects missing station', async () => {
    expect((await call('/njt/departures', {}, NJT_ENV)).status).toBe(400);
  });
});

describe('/alerts', () => {
  const FEED = {
    entity: [
      {
        alert: {
          informed_entity: [{ route_id: '4' }],
          header_text: { translation: [{ text: '[4] Delays at 14 St.', language: 'en' }] },
        },
      },
    ],
  };
  beforeEach(async () => {
    await env.CODES.delete('alerts:subway:last');
    await env.CODES.delete('alerts:subway:cachedAt');
  });

  it('digests and caches the subway alert feed', async () => {
    const calls = stubFetch([{ match: /subway-alerts\.json/, body: FEED }]);
    const res = await call('/alerts/subway');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toEqual([{ routes: ['4'], header: 'Delays at 14 St.' }]);
    const before = calls.length;
    await call('/alerts/subway'); // served from KV inside the TTL
    expect(calls.length).toBe(before);
  });

  it('404s unknown systems', async () => {
    expect((await call('/alerts/bus')).status).toBe(404);
  });
});

describe('/bus/stops', () => {
  it('503s without a key and validates stop ids', async () => {
    expect((await call('/bus/stops?ids=550685')).status).toBe(503);
    expect((await call('/bus/stops?ids=abc', {}, { MTA_BUS_KEY: 'k' })).status).toBe(400);
  });
  it('proxies SIRI per stop', async () => {
    await env.CODES.delete('bus:550685:last');
    await env.CODES.delete('bus:550685:cachedAt');
    stubFetch([{ match: /bustime\.mta\.info/, body: { Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [] }] } } } }]);
    const res = await call('/bus/stops?ids=550685', {}, { MTA_BUS_KEY: 'k' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stops).toEqual([{ id: '550685', name: '', arrivals: [] }]);
  });
});

describe('/sports/team', () => {
  it('validates league and id, composes team + schedule digest', async () => {
    expect((await call('/sports/team?lg=xfl&id=abc')).status).toBe(400);
    await env.CODES.delete('sports:mlb:21:last');
    await env.CODES.delete('sports:mlb:21:cachedAt');
    await env.CODES.delete('sched:mlb:21:at');
    await env.CODES.delete('sched:mlb:21:line');
    stubFetch([
      { match: /teams\/21$/, body: { team: { abbreviation: 'NYM', shortDisplayName: 'Mets', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/mlb/500/nym.png' }], record: { items: [{ summary: '48-37' }] }, nextEvent: [] } } },
      { match: /teams\/21\/schedule/, body: { events: [{ competitions: [{ status: { type: { state: 'post', shortDetail: 'Final' } }, competitors: [
        { homeAway: 'away', team: { abbreviation: 'NYM' }, score: { value: 3 } },
        { homeAway: 'home', team: { abbreviation: 'TOR' }, score: { value: 9 } },
      ]}]}]} },
    ]);
    const res = await call('/sports/team?lg=mlb&id=21');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.row).toMatchObject({ abbr: 'NYM', record: '48-37', lastLine: 'L 3-9 @ TOR · Final' });
  });
});

describe('/news', () => {
  it('proxies whitelisted feeds and 404s unknown ids', async () => {
    await env.CODES.delete('news:npr:last');
    await env.CODES.delete('news:npr:cachedAt');
    stubFetch([{ match: /feeds\.npr\.org/, body: '<rss><channel><item><title>Hi</title></item></channel></rss>' }]);
    const res = await call('/news/npr');
    expect(res.status).toBe(200);
    expect((await res.json()).xml).toContain('<title>Hi</title>');
    expect((await call('/news/evil-feed')).status).toBe(404);
  });
});

describe('/markets', () => {
  const yahoo = (price, prev) => ({
    chart: {
      result: [
        {
          meta: { symbol: '^GSPC', regularMarketPrice: price, chartPreviousClose: prev },
          timestamp: [1, 2, 3],
          indicators: { quote: [{ close: [prev, (price + prev) / 2, price] }] },
        },
      ],
    },
  });

  beforeEach(async () => {
    await env.CODES.delete('markets:^DJI,^IXIC,^GSPC:last');
    await env.CODES.delete('markets:^DJI,^IXIC,^GSPC:cachedAt');
  });

  it('serves custom symbols with Yahoo shortName fallback', async () => {
    await env.CODES.delete('markets:AAPL:last');
    await env.CODES.delete('markets:AAPL:cachedAt');
    const y = yahoo(200, 190);
    y.chart.result[0].meta.symbol = 'AAPL';
    y.chart.result[0].meta.shortName = 'Apple Inc.';
    stubFetch([{ match: /chart\/AAPL/, body: y }]);
    const res = await call('/markets?symbols=aapl');
    const body = await res.json();
    expect(body.indices).toHaveLength(1);
    expect(body.indices[0]).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.' });
  });

  it('aggregates the three indices', async () => {
    stubFetch([{ match: /query1\.finance\.yahoo\.com/, body: yahoo(100, 90), times: 3 }]);
    const res = await call('/markets');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.indices).toHaveLength(3);
    expect(body.indices.map((i) => i.name)).toEqual(['Dow Jones', 'Nasdaq', 'S&P 500']);
    expect(body.indices[0].changePct).toBeCloseTo(11.11, 1);
  });

  it('502s with no cache and failing upstream', async () => {
    stubFetch([{ match: /query1\.finance\.yahoo\.com/, body: 'nope', status: 500, times: 3 }]);
    const res = await call('/markets');
    expect(res.status).toBe(502);
  });
});
