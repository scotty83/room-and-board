import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { digestNext, digestSchedule, mapTeamSummary } from '../../worker/src/sports.js';
import { env } from 'cloudflare:test';
import worker from '../../worker/src/index.js';
import { resetNjtToken } from '../../worker/src/njt.js';
import { mapRidePath } from '../../worker/src/path.js';
import GtfsRt from 'gtfs-realtime-bindings';
import { mapFerryFeed } from '../../worker/src/ferry.js';
import { mapSubstackPosts } from '../../worker/src/posts.js';
import { mapIcloudAlbum } from '../../worker/src/icloud.js';
import { newsFeedUrl } from '../../worker/src/news.js';
import { parseLegs, siriUrl } from '../../worker/src/bus.js';
import { njtDateToEpoch } from '../../worker/src/njt.js';
import { mapMtaAlerts } from '../../worker/src/alerts.js';

const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (path, init, extraEnv = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), { ...env, ...extraEnv }, ctx);

const NJT_ENV = { NJT_USER: 'user', NJT_PASS: 'pass' };

// The upstream-proxy cache lives in the Cache API now (not KV). Keys mirror
// cached() in worker/src/index.js: `${origin}/__cache/{fresh,stale}/{key}`,
// with the test origin https://api.test.
const cacheKey = (kind, key) => new Request(`https://api.test/__cache/${kind}/${encodeURIComponent(key)}`);
const clearCache = (key) =>
  Promise.all([caches.default.delete(cacheKey('fresh', key)), caches.default.delete(cacheKey('stale', key))]);

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
      route.raw ? route.body
        : typeof route.body === 'string' ? route.body : JSON.stringify(route.body),
      { status: route.status ?? 200, headers: { 'Content-Type': route.raw ? 'application/x-protobuf' : 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', stub);
  return calls;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetNjtToken(env); // clears the KV session token + isolate memo so it can't leak between cases
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

const clearThrottle = (ip = 'anon') =>
  caches.default.delete(new Request(`https://api.test/__throttle/code/${encodeURIComponent(ip)}`));

describe('/code exchange', () => {
  beforeEach(() => clearThrottle());

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

// Upstream fixtures in NJT RailData's real response shape (verified against the
// live API 2026-07-14; mapping isolated in njt.js). getStationSchedule returns
// an ARRAY of station objects, departures nested in ITEMS, no live track/status
// (TRACK holds the line name), and includes Amtrak trains + arrivals we drop.
// The station is pinned to New York Penn (NY): departures are "Westbound",
// NY-bound arrivals are "Eastbound" and get dropped by the direction filter.
const TOKEN_RESPONSE = { UserToken: 'tok-1' };
const SCHEDULE_RESPONSE = [
  {
    STATION_2CHAR: 'NY',
    STATIONNAME: 'New York',
    ITEMS: [
      { SCHED_DEP_DATE: '02-Jul-2026 08:15:00 AM', DESTINATION: 'Trenton &#9992', TRACK: 'Northeast Corridor Line', LINE: 'Northeast Corridor Line', TRAIN_ID: '3919', DIRECTION: 'Westbound' }, // NJT departure; airport entity decodes
      { SCHED_DEP_DATE: '02-Jul-2026 08:20:00 AM', DESTINATION: 'Dover', TRACK: 'Morris & Essex Line', LINE: 'Morris & Essex Line', TRAIN_ID: '6621', DIRECTION: 'Westbound' }, // NJT departure
      { SCHED_DEP_DATE: '02-Jul-2026 08:25:00 AM', DESTINATION: 'Washington', TRACK: 'ACELA', LINE: 'ACELA', TRAIN_ID: 'A2151', DIRECTION: 'Westbound' }, // Amtrak (letter id) — dropped
      { SCHED_DEP_DATE: '02-Jul-2026 08:28:00 AM', DESTINATION: 'Baltimore', TRACK: 'Northeast Corridor Line', LINE: 'Northeast Corridor Line', TRAIN_ID: 'A2121', DIRECTION: 'Westbound' }, // Amtrak sharing the NJT line name — dropped by the numeric-id rule
      { SCHED_DEP_DATE: '02-Jul-2026 08:26:00 AM', DESTINATION: 'Long Branch', TRACK: 'North Jersey Coast Line', LINE: 'North Jersey Coast Line', TRAIN_ID: '3244', DIRECTION: 'Eastbound' }, // NJT arrival INTO Penn terminating elsewhere — dropped by DIRECTION (name check would MISS this)
      { SCHED_DEP_DATE: '02-Jul-2026 08:30:00 AM', DESTINATION: 'New York', TRACK: 'North Jersey Coast Line', LINE: 'North Jersey Coast Line', TRAIN_ID: '3288', DIRECTION: 'Eastbound' }, // NJT arrival at NY (terminus literally "New York") — dropped
    ],
  },
];

describe('/njt/departures', () => {
  beforeEach(() => clearCache('njt:NY'));

  it('503s when secrets are not configured', async () => {
    const res = await call('/njt/departures');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('njt_not_configured');
  });

  it('fetches, maps and caches upstream departures', async () => {
    const calls = stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    const res = await call('/njt/departures', {}, NJT_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.station).toBe('NY');
    expect(body.stale).toBe(false);
    // Only the two NJT departures survive: both Amtrak trains (letter ids, one
    // sharing the NJT line name) and both Eastbound arrivals into Penn (one
    // terminating elsewhere, one literally "New York") are filtered out.
    expect(body.trains).toHaveLength(2);
    const dests = body.trains.map((t) => t.dest);
    expect(dests).not.toContain('Washington'); // Amtrak (ACELA) dropped
    expect(dests).not.toContain('Baltimore'); // Amtrak sharing the NJT line name dropped
    expect(dests).not.toContain('New York'); // Eastbound arrival (name match) dropped
    expect(dests).not.toContain('Long Branch'); // Eastbound arrival terminating elsewhere dropped by DIRECTION
    // Every surviving train is a departure (Westbound), never an arrival.
    expect(body.trains.every((t) => t.direction === 'Westbound')).toBe(true);
    const train = body.trains[0];
    expect(train.dest).toContain('Trenton'); // "Trenton ✈" after entity decode
    expect(train.dest).toContain('✈'); // &#9992 decoded to the airport glyph
    expect(train.dest).not.toContain('&#'); // no raw HTML entity leaks to the board
    expect(train.track).toBeNull(); // this endpoint has no real track number
    expect(train.status).toBe(''); // nor a live status
    expect(train.line).toBe('Northeast Corridor Line');
    // 08:15 AM America/New_York on 2026-07-02 is 12:15 UTC (EDT).
    expect(train.time).toBe(Date.UTC(2026, 6, 2, 12, 15, 0) / 1000);

    // Cached in the Cache API, not KV — KV's daily write cap is reserved for
    // setup codes, so nothing cache-related should land in the CODES namespace.
    expect(await env.CODES.get('njt:NY:last')).toBeNull();
    expect(await caches.default.match(cacheKey('fresh', 'njt:NY'))).toBeTruthy();

    // Second call inside the TTL is served from cache without touching upstream.
    const before = calls.length;
    const res2 = await call('/njt/departures', {}, NJT_ENV);
    expect(res2.status).toBe(200);
    expect((await res2.json()).trains).toHaveLength(2);
    expect(calls.length).toBe(before);
  });

  it('retries once with a fresh token when the schedule call fails', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'expired', status: 401 },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    const res = await call('/njt/departures', {}, NJT_ENV);
    expect(res.status).toBe(200);
    expect((await res.json()).trains).toHaveLength(2);
  });

  it('reuses the Cache-API session token across fetches (getToken fires once)', async () => {
    const calls = stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 5 },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE, times: 5 },
      { match: /getStationMSG/, body: [], times: 5 },
    ]);
    // First fleet-cache-miss fetch authenticates and caches the token.
    await call('/njt/departures', {}, NJT_ENV);
    // Expire the digest cache (both layers) but keep the token — simulates a fresh
    // isolate 60 s later that lost its in-memory state but shares the colo cache.
    await clearCache('njt:NY');
    await call('/njt/departures', {}, NJT_ENV);
    const tokenCalls = calls.filter((u) => /getToken/.test(u)).length;
    expect(tokenCalls).toBe(1); // the second fetch reused the cached token — no extra getToken
  });

  it('dedupes concurrent cold-cache token mints (getToken fires once)', async () => {
    const calls = stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 5 },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE, times: 5 },
      { match: /getStationMSG/, body: [], times: 5 },
    ]);
    // Two independent fetches race on a cold token cache. cached() doesn't dedupe
    // concurrent misses, so both reach fetchNjtDepartures -> njtToken. Without an
    // in-flight guard each would read the empty cache and mint its own token —
    // the burst that drained the 10/day getToken cap. The in-flight promise
    // collapses them to one mint.
    await Promise.all([
      call('/njt/departures', {}, NJT_ENV),
      call('/njt/departures', {}, NJT_ENV),
    ]);
    const tokenCalls = calls.filter((u) => /getToken/.test(u)).length;
    expect(tokenCalls).toBe(1);
  });

  it('serves stale data when upstream fails after a success', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE },
      { match: /getStationSchedule/, body: SCHEDULE_RESPONSE },
    ]);
    await call('/njt/departures', {}, NJT_ENV);
    await caches.default.delete(cacheKey('fresh', 'njt:NY')); // expire fresh, keep stale backup
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'err', status: 500, times: 2 },
    ]);
    const res = await call('/njt/departures', {}, NJT_ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.trains).toHaveLength(2);
  });

  it('502s when upstream fails with no cached copy', async () => {
    stubFetch([
      { match: /getToken/, body: TOKEN_RESPONSE, times: 2 },
      { match: /getStationSchedule/, body: 'err', status: 500, times: 2 },
    ]);
    const res = await call('/njt/departures', {}, NJT_ENV);
    expect(res.status).toBe(502);
  });
});

describe('njt token persistence (KV)', () => {
  it('mints once, persists to KV, and reuses without re-authenticating', async () => {
    const calls = stubFetch([
      { match: /getToken/, body: { UserToken: 'tok-1' } },
      { match: /getStationSchedule/, body: [], times: 2 },
      { match: /getStationMSG/, body: [], times: 2 },
    ]);
    const creds = { NJT_USER: 'u', NJT_PASS: 'p' };
    expect((await call('/njt/departures', {}, creds)).status).toBe(200);
    expect((await call('/njt/departures', {}, creds)).status).toBe(200);
    expect(calls.filter((u) => u.includes('getToken'))).toHaveLength(1);
    expect(await env.CODES.get('njt:token')).toBe('tok-1'); // durable, global — the Cache API layer this replaces was colo-local and evictable
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
  beforeEach(() => clearCache('alerts:subway'));

  it('digests and caches the subway alert feed', async () => {
    const calls = stubFetch([{ match: /subway-alerts\.json/, body: FEED }]);
    const res = await call('/alerts/subway');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toEqual([{ routes: ['4'], header: 'Delays at 14 St.' }]);
    const before = calls.length;
    await call('/alerts/subway'); // served from the Cache API inside the TTL
    expect(calls.length).toBe(before);
  });

  it('404s unknown systems', async () => {
    expect((await call('/alerts/bus')).status).toBe(404);
  });
});

describe('/bus/stops', () => {
  it('503s without a key and returns empty stops for missing legs', async () => {
    expect((await call('/bus/stops?legs=550685:MTABC_QM24')).status).toBe(503);
    const empty = await call('/bus/stops', {}, { MTA_BUS_KEY: 'k' });
    expect(empty.status).toBe(200);
    expect((await empty.json()).stops).toEqual([]);
  });
  it('proxies SIRI per stop with LineRef filter', async () => {
    await clearCache('bus:550685:MTABC_QM24');
    stubFetch([{ match: /bustime\.mta\.info/, body: { Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [] }] } } } }]);
    const res = await call('/bus/stops?legs=550685:MTABC_QM24', {}, { MTA_BUS_KEY: 'k' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stops).toEqual([{ id: '550685', name: '', arrivals: [] }]);
  });
});

describe('/sports/team', () => {
  it('validates league and id, composes team + schedule digest', async () => {
    expect((await call('/sports/team?lg=xfl&id=abc')).status).toBe(400);
    await clearCache('sports:mlb:21');
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

describe('eventLine guards', () => {
  it('digestSchedule/digestNext tolerate a competition with no competitors array', () => {
    const sched = { events: [
      { date: '2099-01-01T00:00Z', competitions: [{ status: { type: { state: 'pre', shortDetail: 'TBD' } } }] },
      { date: '2020-01-01T00:00Z', competitions: [{ status: { type: { state: 'post', shortDetail: 'Final' } } }] },
    ] };
    expect(() => digestSchedule(sched, 'NYY')).not.toThrow();
    expect(() => digestNext(sched, 'NYY', 0)).not.toThrow();
  });
});

describe('digestNext (next scheduled game)', () => {
  const NOW = Date.parse('2026-07-19T04:00:00Z');
  const ev = (date, state, opp = 'LAD', home = true) => ({
    date,
    competitions: [{
      status: { type: { state, shortDetail: state === 'pre' ? '7/20 - 7:10 PM EDT' : 'Final' } },
      competitors: [
        { team: { abbreviation: 'NYY' }, homeAway: home ? 'home' : 'away', score: { value: 2 } },
        { team: { abbreviation: opp }, homeAway: home ? 'away' : 'home', score: { value: 1 } },
      ],
    }],
  });
  it('picks the earliest FUTURE pre event', () => {
    const sched = { events: [
      ev('2026-07-25T23:00:00Z', 'pre', 'BOS'),
      ev('2026-07-18T23:00:00Z', 'post'),
      ev('2026-07-20T23:00:00Z', 'pre', 'LAD'),
    ] };
    expect(digestNext(sched, 'NYY', NOW)).toBe('vs LAD · 7/20 - 7:10 PM EDT');
  });
  it('skips postponed games (state pre with a PAST date)', () => {
    const sched = { events: [
      ev('2026-07-18T23:00:00Z', 'pre', 'LAD'), // postponed: pre but already past
      ev('2026-07-21T23:00:00Z', 'pre', 'BAL'),
    ] };
    expect(digestNext(sched, 'NYY', NOW)).toBe('vs BAL · 7/20 - 7:10 PM EDT');
  });
  it('returns null with no future games (offseason)', () => {
    expect(digestNext({ events: [ev('2026-07-18T23:00:00Z', 'post')] }, 'NYY', NOW)).toBeNull();
    expect(digestNext({}, 'NYY', NOW)).toBeNull();
  });
});

describe('mapTeamSummary nextLine passthrough', () => {
  it('carries nextLine onto the row (null default)', () => {
    const teamJson = { team: { abbreviation: 'NYJ', shortDisplayName: 'Jets', logos: [] } };
    expect(mapTeamSummary(teamJson, null, 'nfl', null, 'vs MIA · 10/28').nextLine).toBe('vs MIA · 10/28');
    expect(mapTeamSummary(teamJson, null, 'nfl').nextLine).toBeNull();
  });
});

describe('/sports/team live scores', () => {
  const TEAM_LIVE = { team: {
    id: '10', abbreviation: 'NYY', shortDisplayName: 'Yankees',
    logos: [{ href: 'https://a.espncdn.com/i/teamlogos/mlb/500-dark/nyy.png', rel: ['full', 'dark'] }],
    record: { items: [{ summary: '48-38' }] },
    nextEvent: [{ id: '401816004', competitions: [{
      status: { type: { state: 'in', shortDetail: 'Mid 5th' } },
      competitors: [
        { homeAway: 'home', team: { abbreviation: 'NYY' }, score: null },
        { homeAway: 'away', team: { abbreviation: 'MIN' }, score: null },
      ],
    }] }],
  } };
  const SCOREBOARD = { events: [
    { id: '999', competitions: [{ status: { type: { state: 'in', shortDetail: 'Bot 3rd' } }, competitors: [] }] },
    { id: '401816004', competitions: [{
      status: { type: { state: 'in', shortDetail: 'Mid 5th' } },
      competitors: [
        { homeAway: 'home', team: { abbreviation: 'NYY' }, score: '3' },
        { homeAway: 'away', team: { abbreviation: 'MIN' }, score: '2' },
      ],
    }] },
  ] };

  it('joins live scores from the league scoreboard by event id', async () => {
    await clearCache('sports:mlb:10');
    stubFetch([
      { match: /teams\/10$/, body: TEAM_LIVE },
      { match: /teams\/10\/schedule/, body: { events: [] } },
      { match: /scoreboard/, body: SCOREBOARD },
    ]);
    const res = await call('/sports/team?lg=mlb&id=10');
    const body = await res.json();
    expect(body.row.line).toBe('3-2 vs MIN · Mid 5th');
    expect(body.row.state).toBe('in');
  });

  it('degrades to a scoreless live line when the scoreboard is unavailable', async () => {
    await clearCache('sports:mlb:10');
    stubFetch([
      { match: /teams\/10$/, body: TEAM_LIVE },
      { match: /teams\/10\/schedule/, body: { events: [] } },
      { match: /scoreboard/, body: 'down', status: 500 },
    ]);
    const res = await call('/sports/team?lg=mlb&id=10');
    const body = await res.json();
    expect(body.row.line).toBe('vs MIN · Mid 5th');
    expect(body.row.line).not.toContain('\u2013');
  });
});

describe('/code rate limiting', () => {
  beforeEach(() => clearThrottle('1.2.3.4'));
  it('429s a second code request from the same IP within the window', async () => {
    const init = { method: 'POST', body: JSON.stringify({ cfg: 'abc123' }), headers: { 'CF-Connecting-IP': '1.2.3.4' } };
    expect((await call('/code', init)).status).toBe(200);
    expect((await call('/code', init)).status).toBe(429);
  });
  it('does not throttle on invalid requests', async () => {
    const ip = { 'CF-Connecting-IP': '1.2.3.4' };
    expect((await call('/code', { method: 'POST', body: 'nope', headers: ip })).status).toBe(400);
    expect((await call('/code', { method: 'POST', body: JSON.stringify({ cfg: 'ok123' }), headers: ip })).status).toBe(200);
  });
});

describe('/sports/team prototype-key guard', () => {
  it('rejects inherited-property league names', async () => {
    expect((await call('/sports/team?lg=constructor&id=abc')).status).toBe(400);
    expect((await call('/sports/team?lg=toString&id=abc')).status).toBe(400);
  });
});

describe('/news', () => {
  it('proxies whitelisted feeds and 404s unknown ids', async () => {
    await clearCache('news:npr');
    stubFetch([{ match: /feeds\.npr\.org/, body: '<rss><channel><item><title>Hi</title></item></channel></rss>' }]);
    const res = await call('/news/npr');
    expect(res.status).toBe(200);
    expect((await res.json()).xml).toContain('<title>Hi</title>');
    expect((await call('/news/evil-feed')).status).toBe(404);
  });

  it('resolves the finance feed ids and rejects unknown ids', () => {
    for (const id of ['cnbc', 'marketwatch', 'yahoo-finance', 'seekingalpha']) {
      expect(newsFeedUrl(id)).toMatch(/^https:\/\//);
    }
    expect(newsFeedUrl('not-a-feed')).toBeNull();
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

  beforeEach(() => clearCache('markets:^DJI,^GSPC,^IXIC')); // cache key is sorted

  it('serves custom symbols with Yahoo shortName fallback', async () => {
    await clearCache('markets:AAPL');
    const y = yahoo(200, 190);
    y.chart.result[0].meta.symbol = 'AAPL';
    y.chart.result[0].meta.shortName = 'Apple Inc.';
    stubFetch([{ match: /chart\/AAPL/, body: y }]);
    const res = await call('/markets?symbols=aapl');
    const body = await res.json();
    expect(body.indices).toHaveLength(1);
    expect(body.indices[0]).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.' });
  });

  it('recovers the daily change from daily bars when Yahoo rolls the close (LSE evening)', async () => {
    await clearCache('markets:CBG.L');
    // Rolled single-session payload: price === chartPreviousClose → change 0.
    const rolled = yahoo(413.6, 413.6);
    rolled.chart.result[0].meta.symbol = 'CBG.L';
    rolled.chart.result[0].meta.shortName = 'CLOSE BROTHERS GROUP PLC ORD 25';
    rolled.chart.result[0].indicators.quote[0].close = [407.8, 410.1, 413.6];
    const daily = { chart: { result: [{ meta: { symbol: 'CBG.L' },
      indicators: { quote: [{ close: [402.0, 409.4, 413.6] }] } }] } };
    stubFetch([
      { match: /chart\/CBG\.L\?range=2d/, body: rolled },
      { match: /chart\/CBG\.L\?range=5d&interval=1d/, body: daily },
    ]);
    const res = await call('/markets?symbols=CBG.L');
    const body = await res.json();
    expect(body.indices[0].symbol).toBe('CBG.L');
    expect(body.indices[0].change).toBeCloseTo(413.6 - 409.4, 5); // vs prior daily close
    expect(body.indices[0].changePct).toBeCloseTo(((413.6 - 409.4) / 409.4) * 100, 5);
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

  it('a partial batch serves fresh but never overwrites the complete stale backup', async () => {
    const key = 'markets:AAA,BBB';
    await clearCache(key);
    const y = (sym) => { const b = yahoo(100, 90); b.chart.result[0].meta.symbol = sym; return b; };
    // 1. full success → both fresh + 24h stale hold the complete 2-index list
    stubFetch([{ match: /chart\/AAA/, body: y('AAA') }, { match: /chart\/BBB/, body: y('BBB') }]);
    expect((await (await call('/markets?symbols=aaa,bbb')).json()).indices).toHaveLength(2);
    // 2. expire only the FRESH copy (simulate the 300s TTL lapsing)
    await caches.default.delete(cacheKey('fresh', key));
    // 3. one symbol now fails → partial fresh payload, flagged
    stubFetch([{ match: /chart\/AAA/, body: y('AAA') }, { match: /chart\/BBB/, body: 'no', status: 500 }]);
    const partial = await (await call('/markets?symbols=aaa,bbb')).json();
    expect(partial.indices).toHaveLength(1);
    expect(partial.partial).toBe(true);
    // 4. expire fresh again; a total outage must serve the FULL backup, not the
    //    crippled partial (the bug: step 3 would have poisoned the stale key)
    await caches.default.delete(cacheKey('fresh', key));
    stubFetch([{ match: /chart\/(AAA|BBB)/, body: 'no', status: 500, times: 2 }]);
    const served = await (await call('/markets?symbols=aaa,bbb')).json();
    expect(served.stale).toBe(true);
    expect(served.indices).toHaveLength(2);
  });
});

describe('/path/realtime', () => {
  const RIDEPATH = {
    results: [
      {
        consideredStation: '33S',
        destinations: [
          {
            label: 'ToNJ',
            messages: [
              { target: '33S', secondsToArrival: '120', arrivalTimeMessage: '2 min', lineColor: 'FF9900', headSign: 'Journal Square', lastUpdated: '2026-07-03T20:04:57-04:00' },
              { target: '33S', secondsToArrival: '45', arrivalTimeMessage: '0 min', lineColor: '4D92FB,FF9900', headSign: 'Hoboken', lastUpdated: '2026-07-03T20:04:57-04:00' },
            ],
          },
          { label: 'ToNY', messages: [] },
        ],
      },
    ],
  };
  beforeEach(() => clearCache('path'));

  it('maps the feed into a per-station, per-direction digest with projected epochs', () => {
    const digest = mapRidePath(RIDEPATH, 1000);
    const st = digest.stations['33S'];
    expect(st.ToNY).toEqual([]);
    expect(st.ToNJ).toHaveLength(2);
    // Sorted by projected time: the 45 s Hoboken train first.
    expect(st.ToNJ[0]).toEqual({ t: 1045, headSign: 'Hoboken', lineColors: ['4D92FB', 'FF9900'] });
    expect(st.ToNJ[1]).toEqual({ t: 1120, headSign: 'Journal Square', lineColors: ['FF9900'] });
  });

  it('drops malformed rows and bad colors instead of failing', () => {
    const digest = mapRidePath({ results: [{ consideredStation: 'WTC', destinations: [{ label: 'ToNJ', messages: [
      { secondsToArrival: 'soon', headSign: 'Newark', lineColor: 'D93A30' },
      { secondsToArrival: '60', headSign: 'Newark', lineColor: 'red;evil' },
    ] }] }] }, 0);
    expect(digest.stations.WTC.ToNJ).toEqual([{ t: 60, headSign: 'Newark', lineColors: [] }]);
  });

  it('serves and caches the digest', async () => {
    const calls = stubFetch([{ match: /ridepath\.json/, body: RIDEPATH }]);
    const res = await call('/path/realtime');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stations['33S'].ToNJ).toHaveLength(2);
    const before = calls.length;
    await call('/path/realtime'); // Cache API hit inside the 30 s TTL
    expect(calls.length).toBe(before);
  });
});

describe('/ferry/departures', () => {
  const { FeedMessage } = GtfsRt.transit_realtime;
  const FERRY_BUF = FeedMessage.encode(
    FeedMessage.create({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 1783123914 },
      entity: [
        { id: '1', tripUpdate: { trip: { tripId: '52' }, stopTimeUpdate: [
          { stopId: '88', departure: { time: 1783123756 } },
          { stopId: '118', arrival: { time: 1783126301 } },
        ] } },
        { id: '2', tripUpdate: { trip: { tripId: '96' }, stopTimeUpdate: [] } }, // no stops -> dropped
      ],
    }),
  ).finish();
  beforeEach(() => clearCache('ferry'));

  it('decodes the protobuf and returns a JSON trip digest', async () => {
    stubFetch([{ match: /gtfsrealtime\.aspx/, body: FERRY_BUF, raw: true }]);
    const res = await call('/ferry/departures');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAt).toBe(1783123914);
    expect(body.trips).toEqual([
      { tripId: '52', stops: [{ stopId: '88', t: 1783123756 }, { stopId: '118', t: 1783126301 }] },
    ]);
  });

  it('mapFerryFeed prefers departure over arrival and drops timeless stops', () => {
    const out = mapFerryFeed({ timestamp: null, trips: [
      { tripId: '9', routeId: '', stops: [
        { stopId: '4', arrival: 100, departure: 110 },
        { stopId: '8', arrival: null, departure: null },
      ] },
    ] }, 500);
    expect(out.updatedAt).toBe(500); // header timestamp fallback
    expect(out.trips).toEqual([{ tripId: '9', stops: [{ stopId: '4', t: 110 }] }]);
  });
});

describe('/posts/substack', () => {
  const SUB = [
    { title: 'The AI Superforecasters', subtitle: 'Are here', post_date: '2026-07-02T12:00:00.000Z' },
    { title: 'Untitled draftish', subtitle: null, post_date: null },
  ];
  beforeEach(() => clearCache('sub:acx'));
  it('digests the publication API', async () => {
    stubFetch([{ match: /acx\.substack\.com\/api\/v1\/posts/, body: SUB }]);
    const res = await call('/posts/substack?pub=acx');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts[0]).toEqual({ title: 'The AI Superforecasters', subtitle: 'Are here', t: Math.floor(Date.parse('2026-07-02T12:00:00.000Z') / 1000) });
    expect(body.posts[1].t).toBe(0);
    expect(mapSubstackPosts(null).posts).toEqual([]);
  });
  it('rejects bad slugs', async () => {
    expect((await call('/posts/substack?pub=Not%20A%20Slug')).status).toBe(400);
    expect((await call('/posts/substack')).status).toBe(400);
  });
});

describe('/icloud/album', () => {
  const WS = { photos: [
    { photoGuid: 'g1', dateCreated: '2026-02-24T12:00:00Z', caption: 'Beach', width: '2049', height: '1537',
      derivatives: { 342: { checksum: 'cA', fileSize: '41233', width: '342', height: '257' },
                     2049: { checksum: 'cB', fileSize: '660318', width: '2049', height: '1537' } } },
    { photoGuid: 'g2', dateCreated: '2026-03-01T09:00:00Z', caption: '', width: '2049', height: '2049',
      derivatives: { 2049: { checksum: 'cC', fileSize: '9000000', width: '2049', height: '2049' } } },
  ] };
  const AU = { items: {
    cB: { url_location: 'cvws.icloud-content.com', url_path: '/S/x/1.JPG?a=1' },
    cA: { url_location: 'cvws.icloud-content.com', url_path: '/S/x/1t.JPG?a=1' },
  } };

  it('maps to newest-first photos, largest derivative under the byte cap, joined URLs', () => {
    const out = mapIcloudAlbum(WS, AU, 3_000_000);
    expect(out.photos).toHaveLength(1);
    expect(out.photos[0]).toEqual({
      url: 'https://cvws.icloud-content.com/S/x/1.JPG?a=1',
      w: 2049, h: 1537, ar: expect.closeTo(1.333, 2), caption: 'Beach', date: '2026-02-24T12:00:00Z',
    });
  });

  it('rejects a bad token at the route', async () => {
    expect((await call('/icloud/album?token=short')).status).toBe(400);
    expect((await call('/icloud/album')).status).toBe(400);
  });

  it('follows the 330 partition redirect and returns the digest', async () => {
    stubFetch([
      { match: /p\d+-sharedstreams.*webstream/, status: 330, body: { 'X-Apple-MMe-Host': 'p110-sharedstreams.icloud.com' } },
      { match: /p110-sharedstreams.*webstream/, body: WS },
      { match: /p110-sharedstreams.*webasseturls/, body: AU },
    ]);
    await clearCache('icloud:B1m5fk75vLWwX');
    const res = await call('/icloud/album?token=B1m5fk75vLWwX');
    expect(res.status).toBe(200);
    expect((await res.json()).photos).toHaveLength(1);
  });
});

describe('bus legs', () => {
  it('parses stopId:lineRef pairs (decoded)', () => {
    expect(parseLegs('550789:MTABC_QM24,504123:MTA%20NYCT_X27')).toEqual([
      { stopId: '550789', lineRef: 'MTABC_QM24' },
      { stopId: '504123', lineRef: 'MTA NYCT_X27' }]);
    expect(parseLegs('')).toEqual([]);
  });
  it('caps at 2 legs even when more are supplied', () => {
    const result = parseLegs('1:A,2:B,3:C');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ stopId: '1', lineRef: 'A' });
    expect(result[1]).toEqual({ stopId: '2', lineRef: 'B' });
  });
  it('builds a StopMonitoring URL with a LineRef filter', () => {
    const u = siriUrl('KEY', { stopId: '550789', lineRef: 'MTA NYCT_X27' });
    expect(u).toContain('MonitoringRef=550789');
    expect(u).toContain('LineRef=MTA%20NYCT_X27');
    expect(u).toContain('key=KEY');
  });
});

import { mapGdriveAlbum } from '../../worker/src/gdrive.js';
import gdriveFixture from './fixtures/gdrive-files.json';

describe('mapGdriveAlbum', () => {
  it('maps the drive listing to the photo digest', () => {
    const out = mapGdriveAlbum(gdriveFixture);
    expect(out.stale).toBe(false);
    expect(out.photos).toHaveLength(3); // no-thumb + no-dims entries skipped
    expect(out.photos[0]).toEqual({
      url: 'https://lh3.googleusercontent.com/drive-storage/FAKE1=s2048',
      w: 2000, h: 1123, ar: 1.781, caption: '', date: '2026-07-09T18:00:00.000Z',
    });
    expect(out.photos[1].url).toContain('FAKE2=s2048');
    expect(out.photos[2].url).toContain('FAKE5=s2048');
    // Drive has no real captions, only filenames — never show those on a board.
    expect(out.photos.every((p) => p.caption === '')).toBe(true);
  });
  it('caps at 60 and preserves the API order (already newest-first)', () => {
    const many = { files: Array.from({ length: 80 }, (_, i) => ({
      name: `p${i}.jpg`, mimeType: 'image/jpeg', createdTime: `t${i}`,
      thumbnailLink: `https://lh3.example/x${i}=s220`, imageMediaMetadata: { width: 100, height: 100 } })) };
    const out = mapGdriveAlbum(many);
    expect(out.photos).toHaveLength(60);
    expect(out.photos[0].url).toContain('x0=s2048');
  });
});

describe('/gdrive/album route', () => {
  const FOLDER = '1RHow60mcBwzMturimQSbziK3hqCvP2lz';
  it('503s without GDRIVE_KEY', async () => {
    const res = await call(`/gdrive/album?folder=${FOLDER}`);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('gdrive_not_configured');
  });
  it('400s on a malformed folder id', async () => {
    const res = await call('/gdrive/album?folder=nope!', undefined, { GDRIVE_KEY: 'k' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_folder');
  });
  it('serves the digest from the listing (key + ordering on the wire)', async () => {
    await clearCache(`gdrive:${FOLDER}`);
    const calls = stubFetch([{ match: /googleapis\.com\/drive\/v3\/files/, body: gdriveFixture }]);
    const res = await call(`/gdrive/album?folder=${FOLDER}`, undefined, { GDRIVE_KEY: 'testkey' });
    expect(res.status).toBe(200);
    const digest = await res.json();
    expect(digest.photos).toHaveLength(3);
    expect(digest.photos[0].url).toContain('=s2048');
    expect(calls[0]).toContain('key=testkey');
    expect(calls[0]).toContain('orderBy=createdTime');
  });
});

import { mapStatuspage, mapSlack, mapMicrosoft, mapGoogle, mapWebex, mapAws } from '../../worker/src/svcstatus.js';
import spOk from './fixtures/svc-statuspage-ok.json';
import spBad from './fixtures/svc-statuspage-degraded.json';
import slackFx from './fixtures/svc-slack.json';
import claudeFx from './fixtures/svc-claude.json';
import openaiFx from './fixtures/svc-openai.json';
import m365Fx from './fixtures/svc-m365.json';
import googleFx from './fixtures/svc-google.json';
import webexFx from './fixtures/svc-webex.json';
import awsFx from './fixtures/svc-aws.json';
import { decodeBomJson } from '../../worker/src/svcstatus.js';

describe('service status adapters', () => {
  it('statuspage: ok and degraded (live Cloudflare sample)', () => {
    expect(mapStatuspage(spOk).state).toBe('ok');
    const bad = mapStatuspage(spBad);
    expect(bad.state).toBe('minor');
    expect(bad.note).toBe('Minor Service Outage');
    expect(bad.incidents.length).toBeGreaterThan(0);
    expect(bad.incidents[0].title.length).toBeGreaterThan(0);
    expect(bad.incidents[0].update.length).toBeLessThanOrEqual(500);
  });
  it('slack: ok fixture, synthesized outage is major', () => {
    expect(mapSlack(slackFx).state).toBe('ok');
    const out = mapSlack({ status: 'active', active_incidents: [{ title: 'API errors', type: 'outage', date_created: 'x', notes: [{ body: 'working on it' }] }] });
    expect(out.state).toBe('major');
    expect(out.incidents[0].update).toBe('working on it');
  });
  it('m365: ok fixture, one IsUp:false is major with the name', () => {
    expect(mapMicrosoft(m365Fx).state).toBe('ok');
    const out = mapMicrosoft({ Services: [{ Id: 'x', Name: 'Exchange Online', IsUp: false, Message: 'mailbox issues' }] });
    expect(out.state).toBe('major');
    expect(out.note).toContain('Exchange Online');
  });
  it('google: all-ended fixture is ok, active incident is minor', () => {
    expect(mapGoogle(googleFx, Date.now()).state).toBe('ok');
    const out = mapGoogle([{ begin: '2026-07-11T00:00:00Z', external_desc: '**Gmail delays**\ndetail here' }], Date.now());
    expect(out.state).toBe('minor');
    expect(out.note).toBe('Gmail delays');
  });
  it('webex: maintenance-only fixture is ok, real incident degrades', () => {
    expect(mapWebex(webexFx).state).toBe('ok'); // 3 unresolved, all maintenance
    const out = mapWebex({ unResolvedIncidents: [{ incidentName: 'Meetings join failures', impact: 'major', createTime: 'x' }] });
    expect(out.state).toBe('major');
    expect(out.note).toBe('Meetings join failures');
  });
  it('aws: stale events are ok now, recent event degrades', () => {
    expect(mapAws(awsFx, Date.now()).state).toBe('ok'); // events months old
    const evDate = Number(awsFx[0].date) * 1000;
    const out = mapAws(awsFx, evDate + 3600e3); // one hour after the event
    expect(out.state).toBe('minor');
    expect(out.note).toContain('Increased Error Rates');
  });
});

describe('/services/status route', () => {
  it('400s with no valid ids', async () => {
    expect((await call('/services/status')).status).toBe(400);
    expect((await call('/services/status?ids=bogus,nope')).status).toBe(400);
  });
  it('serves the digest and sorts the cache key', async () => {
    await clearCache('svc:cloudflare,zoom');
    stubFetch([
      { match: /status\.zoom\.us/, body: spOk },
      { match: /cloudflarestatus/, body: spBad },
    ]);
    const res = await call('/services/status?ids=zoom,cloudflare');
    expect(res.status).toBe(200);
    const digest = await res.json();
    expect(digest.services).toHaveLength(2);
    expect(digest.services[0]).toMatchObject({ id: 'zoom', state: 'ok' });
    expect(digest.services[1]).toMatchObject({ id: 'cloudflare', state: 'minor' });
    // permuted ids hit the same cache entry (no upstream stubs left)
    const res2 = await call('/services/status?ids=cloudflare,zoom');
    expect((await res2.json()).services).toHaveLength(2);
  });
  it('reports unknown for a failed service without failing the batch', async () => {
    await clearCache('svc:github,slack');
    stubFetch([
      { match: /githubstatus/, body: 'nope', status: 500 },
      { match: /status\.slack\.com/, body: slackFx },
    ]);
    const digest = await (await call('/services/status?ids=github,slack')).json();
    expect(digest.services.find((s) => s.id === 'github').state).toBe('unknown');
    expect(digest.services.find((s) => s.id === 'slack').state).toBe('ok');
  });
  it('serves Claude and OpenAI (openai: incident.io compat feed, no incidents key)', async () => {
    await clearCache('svc:claude,openai');
    stubFetch([
      { match: /status\.claude\.com/, body: claudeFx },
      { match: /status\.openai\.com/, body: openaiFx },
    ]);
    const digest = await (await call('/services/status?ids=claude,openai')).json();
    expect(digest.services[0]).toMatchObject({ id: 'claude', label: 'Claude', state: 'ok' });
    expect(digest.services[1]).toMatchObject({ id: 'openai', label: 'OpenAI', state: 'ok' });
    expect(digest.services[1].incidents).toEqual([]);
  });
});

describe('decodeBomJson (AWS UTF-16 quirk)', () => {
  const encode = (str, be) => {
    const bom = be ? [0xFE, 0xFF] : [0xFF, 0xFE];
    const bytes = [...bom];
    for (const ch of str) { const c = ch.charCodeAt(0);
      if (be) bytes.push((c >> 8) & 0xff, c & 0xff); else bytes.push(c & 0xff, (c >> 8) & 0xff); }
    return new Uint8Array(bytes).buffer;
  };
  it('parses big-endian (what AWS actually serves)', () => {
    expect(decodeBomJson(encode('[{"a":1}]', true))).toEqual([{ a: 1 }]);
  });
  it('parses little-endian too', () => {
    expect(decodeBomJson(encode('[{"a":1}]', false))).toEqual([{ a: 1 }]);
  });
  it('falls back to utf-8 with no BOM', () => {
    expect(decodeBomJson(new TextEncoder().encode('[1,2,3]').buffer)).toEqual([1, 2, 3]);
  });
});

import { mapApod, fetchApod } from '../../worker/src/apod.js';
import apodWindow from './fixtures/apod-window.json'; // 7 days, 2019-05-06 is video

describe('apod adapter', () => {
  it('mapApod picks the newest image (array is date-ascending)', () => {
    const d = mapApod(apodWindow);
    expect(d.photo.date).toBe('2019-05-11');
    expect(d.photo.url).toMatch(/^https?:/);
    expect(d.photo.title.length).toBeGreaterThan(0);
    expect(typeof d.photo.explanation).toBe('string');
  });
  it('mapApod skips a trailing video day', () => {
    const d = mapApod(apodWindow.slice(0, 2)); // [05-05 image, 05-06 video]
    expect(d.photo.date).toBe('2019-05-05');
  });
  it('mapApod returns photo:null when the window is all videos', () => {
    const d = mapApod([{ date: '2019-05-06', media_type: 'video', url: 'x' }]);
    expect(d.photo).toBeNull();
  });
  it('mapApod trims the copyright credit', () => {
    const d = mapApod([{ date: '1', media_type: 'image', url: 'u', title: 't', copyright: '  Jane Doe\n' }]);
    expect(d.photo.credit).toBe('Jane Doe');
  });
  it('fetchApod retries with yesterday on a 400 (today not posted yet)', async () => {
    const img = [{ date: '2019-05-05', media_type: 'image', url: 'u', title: 't' }];
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('no data', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(img), { status: 200 }));
    const d = await fetchApod({ NASA_KEY: 'K' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(d.photo.date).toBe('2019-05-05');
    spy.mockRestore();
  });
  it('/apod route serves the digest and caches under "apod"', async () => {
    await clearCache('apod');
    stubFetch([{ match: /api\.nasa\.gov/, body: apodWindow }]);
    const res = await call('/apod');
    expect(res.status).toBe(200);
    const digest = await res.json();
    expect(digest.photo.date).toBe('2019-05-11');
    await clearCache('apod');
  });
});

import { mapCitibike, fetchCitibike } from '../../worker/src/citibike.js';
import cbStatus from './fixtures/citibike-status.json';
const CB_IDS = ['66dc7c31-0aca-11e7-82f6-3863bb44ef7c', '66dc51e9-0aca-11e7-82f6-3863bb44ef7c', '1869743938848725856'];

describe('citibike adapter', () => {
  it('maps counts and ok, preserving requested order', () => {
    const d = mapCitibike(cbStatus, CB_IDS);
    expect(d.stations.map((s) => s.id)).toEqual(CB_IDS);
    const s = d.stations[2];
    expect(s.bikes).toBe(22);
    expect(s.ebikes).toBe(17);
    expect(s.docks).toBe(70);
    expect(s.ok).toBe(true);
  });
  it('marks a non-renting station ok:false', () => {
    expect(mapCitibike(cbStatus, CB_IDS).stations[0].ok).toBe(false);
  });
  it('omits ids absent from the feed', () => {
    const d = mapCitibike(cbStatus, [...CB_IDS, 'nope-id']);
    expect(d.stations.find((s) => s.id === 'nope-id')).toBeUndefined();
    expect(d.stations).toHaveLength(3);
  });
  it('/citibike/status 400s with no ids and serves the digest otherwise', async () => {
    expect((await call('/citibike/status')).status).toBe(400);
    await clearCache('citibike:' + [...CB_IDS].sort().join(','));
    stubFetch([{ match: /station_status/, body: cbStatus }]);
    const res = await call(`/citibike/status?ids=${CB_IDS.join(',')}`);
    expect(res.status).toBe(200);
    expect((await res.json()).stations).toHaveLength(3);
    await clearCache('citibike:' + [...CB_IDS].sort().join(','));
  });
});

import { mapTfl, fetchTfl } from '../../worker/src/tfl.js';
import tflStatus from './fixtures/tfl-status.json';

describe('tfl adapter', () => {
  it('maps a disrupted line with its status and reason', () => {
    const d = mapTfl(tflStatus);
    const district = d.lines.find((l) => l.id === 'district');
    expect(district.ok).toBe(false);
    expect(district.status).not.toBe('Good Service');
    expect(district.reason.length).toBeGreaterThan(0);
  });
  it('maps a good-service line as ok', () => {
    const central = mapTfl(tflStatus).lines.find((l) => l.id === 'central');
    expect(central.ok).toBe(true);
  });
  it('returns all 19 lines', () => {
    expect(mapTfl(tflStatus).lines).toHaveLength(19);
  });
  it('/tfl/status serves the digest and caches under "tfl"', async () => {
    await clearCache('tfl');
    stubFetch([{ match: /api\.tfl\.gov\.uk/, body: tflStatus }]);
    const res = await call('/tfl/status');
    expect(res.status).toBe(200);
    expect((await res.json()).lines).toHaveLength(19);
    await clearCache('tfl');
  });
});

describe('review batch-2 worker fixes', () => {
  it('njtDateToEpoch is correct across the spring-forward morning (two-pass offset)', () => {
    // 03:30 EDT on 2026-03-08 (clocks sprang forward at 2AM) → 07:30 UTC.
    expect(njtDateToEpoch('08-Mar-2026 03:30:00 AM')).toBe(Date.UTC(2026, 2, 8, 7, 30, 0) / 1000);
    // a normal EDT day is unchanged: 08:15 EDT → 12:15 UTC.
    expect(njtDateToEpoch('02-Jul-2026 08:15:00 AM')).toBe(Date.UTC(2026, 6, 2, 12, 15, 0) / 1000);
    // a normal EST day: 08:15 EST → 13:15 UTC.
    expect(njtDateToEpoch('02-Jan-2026 08:15:00 AM')).toBe(Date.UTC(2026, 0, 2, 13, 15, 0) / 1000);
  });
  it('parseLegs never throws on malformed input and drops colon-less pairs', () => {
    expect(parseLegs('a%zz:b')).toEqual([]);        // bad %-escape → dropped, no URIError
    expect(parseLegs('400123')).toEqual([]);         // no colon → dropped
    expect(parseLegs('40012:MTA%20NYCT_BM1')).toEqual([{ stopId: '40012', lineRef: 'MTA NYCT_BM1' }]);
  });
  it('mapTfl reports the most-severe status when a line has several', () => {
    const d = mapTfl([{ id: 'x', name: 'X', modeName: 'tube', lineStatuses: [
      { statusSeverity: 10, statusSeverityDescription: 'Good Service' },
      { statusSeverity: 6, statusSeverityDescription: 'Severe Delays', reason: 'signal failure' },
      { statusSeverity: 9, statusSeverityDescription: 'Minor Delays' },
    ] }]);
    expect(d.lines[0].status).toBe('Severe Delays');
    expect(d.lines[0].ok).toBe(false);
  });
  it('mapMtaAlerts unions routes for entities sharing a header instead of dropping one', () => {
    const feed = { entity: [
      { alert: { informed_entity: [{ route_id: 'A' }], header_text: { translation: [{ language: 'en', text: 'Delays in both directions.' }] } } },
      { alert: { informed_entity: [{ route_id: 'C' }], header_text: { translation: [{ language: 'en', text: 'Delays in both directions.' }] } } },
    ] };
    const out = mapMtaAlerts(feed, 1000);
    expect(out).toHaveLength(1);
    expect(out[0].routes.sort()).toEqual(['A', 'C']);
  });
});
