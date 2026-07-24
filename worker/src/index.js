// Signage API worker: setup-code exchange (/code), NJ Transit proxy (/njt/*)
// and market indices (/markets). Everything responds with permissive CORS —
// nothing served here is sensitive, and the boards fetch from a static origin.

import { mapYahooChart } from './markets.js';
import { getNjtSchedule, fetchNjtAlerts } from './njt.js';
import { fetchMtaAlerts } from './alerts.js';
import { fetchBusStops, parseLegs } from './bus.js';
import { fetchNewsFeed, newsFeedUrl } from './news.js';
import { fetchTeamSummary, LEAGUE_PATHS as SPORTS_LEAGUES } from './sports.js';
import { fetchPathRealtime } from './path.js';
import { fetchFerryDepartures } from './ferry.js';
import { fetchSubstackPosts } from './posts.js';
import { fetchIcloudAlbum } from './icloud.js';
import { fetchGdriveAlbum } from './gdrive.js';
import { fetchServiceStatuses, SERVICES } from './svcstatus.js';
import { fetchApod } from './apod.js';
import { fetchCitibike } from './citibike.js';
import { fetchTfl } from './tfl.js';
import { parseBeacon, beaconDataPoint, deviceModel } from './fleet.js';
import { fetchChart, CHART_TOPICS } from './chart.js';
import { fetchF1 } from './f1.js';
import { fetchGolf, fetchTennis } from './scores.js';
import { fetchAmtrak } from './amtrak.js';
import { runHealthChecks, notify, alertPlan } from './health.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });

// Crockford-style alphabet: no I, L, O, U — unambiguous on a keypad.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
const CODE_TTL_S = 3600;
const MAX_CFG_CHARS = 4096;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % 32];
  return code;
}

async function postCode(request, env, origin) {
  // Best-effort per-IP throttle (Cache API, not KV) to blunt a code-generation
  // flood against the 1000/day KV write cap. NOTE: caches.default is colo-local
  // and eventually-consistent, so this is a speed bump, not a hard limit — the
  // reliable protection is the try/catch around the KV put below, which returns
  // a clean 503 instead of a raw 500 when the cap is actually hit. A hard limit
  // would need the Rate Limiting binding or a Durable Object counter.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
  const throttleKey = new Request(`${origin}/__throttle/code/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  if (await cache.match(throttleKey)) return json({ error: 'rate_limited' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (typeof body?.cfg !== 'string' || body.cfg.length === 0) {
    return json({ error: 'missing_cfg' }, 400);
  }
  if (body.cfg.length > MAX_CFG_CHARS) return json({ error: 'cfg_too_large' }, 413);
  await cache.put(throttleKey, new Response('1', { headers: { 'Cache-Control': 'max-age=10' } }));
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    try {
      if (await env.CODES.get(`code:${code}`)) continue; // collision, retry
      await env.CODES.put(`code:${code}`, body.cfg, { expirationTtl: CODE_TTL_S });
    } catch {
      // KV read/write cap hit or namespace unavailable — clear error, not a raw
      // 500 (the collision probe is a read and can trip the quota too).
      return json({ error: 'code_service_unavailable' }, 503);
    }
    return json({ code, expiresInSeconds: CODE_TTL_S });
  }
  return json({ error: 'code_generation_failed' }, 500);
}

async function getCode(env, code) {
  const key = `code:${code.toUpperCase()}`;
  let cfg;
  try {
    cfg = await env.CODES.get(key);
  } catch {
    // KV read cap hit or namespace unavailable — clean 503, not a raw 500
    // (an unthrottled redemption loop can otherwise drain the read quota).
    return json({ error: 'code_service_unavailable' }, 503);
  }
  if (cfg === null) return json({ error: 'not_found' }, 404);
  // Best-effort single use: KV deletes are eventually consistent (~60 s
  // globally), so a code may be redeemable more than once briefly. Codes
  // carry non-sensitive widget prefs and expire after an hour regardless.
  try { await env.CODES.delete(key); } catch { /* best-effort single-use */ }
  return json({ cfg });
}

// Fresh-or-stale response cache shared by the upstream-proxy routes. Uses the
// Cache API, NOT KV: KV's free tier caps writes at 1000/day, and the boards
// polling these short-TTL routes exhausted it — which then broke the setup-code
// writes that share the CODES namespace. The Cache API has no such write limit.
// Serves the fresh copy while it is younger than ttlS; otherwise refetches,
// falling back to a longer-lived stale copy (flagged stale) when upstream fails.
// Keys live under the worker's own origin so put() stays same-zone; a second
// day-long entry survives past ttlS to serve as that stale backup.
const STALE_TTL_S = 24 * 3600;

async function cached(origin, key, ttlS, fetcher) {
  const cache = caches.default;
  const freshKey = new Request(`${origin}/__cache/fresh/${encodeURIComponent(key)}`);
  const staleKey = new Request(`${origin}/__cache/stale/${encodeURIComponent(key)}`);
  const hit = await cache.match(freshKey);
  if (hit) return json(await hit.json());
  try {
    const fresh = await fetcher();
    const body = JSON.stringify(fresh);
    const entry = (ttl) =>
      new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
      });
    try {
      // A `partial` payload (some upstreams failed) is fine to serve fresh, but
      // must NOT overwrite the complete 24h stale backup.
      await Promise.all([
        cache.put(freshKey, entry(ttlS)),
        ...(fresh?.partial ? [] : [cache.put(staleKey, entry(STALE_TTL_S))]),
      ]);
    } catch {
      // Caching is best-effort — a put failure must not drop the fresh payload
      // we already fetched.
    }
    return json(fresh);
  } catch (err) {
    // Observability: log which upstream failed and why (visible in `wrangler
    // tail` / Workers logs), so a silent stale-serve (e.g. NJT returning 500s)
    // is diagnosable without deploying a one-off debug probe.
    console.warn(`[cached] ${key} upstream failed, serving stale if available: ${String(err?.message ?? err)}`);
    const stale = await cache.match(staleKey);
    if (stale) return json({ ...(await stale.json()), stale: true });
    return json({ error: 'upstream_failed', detail: String(err) }, 502);
  }
}

// NJT live alerts (getStationMSG): dynamic, so a short colo cache (~2 min) is
// fine, but a fetch failure returns [] rather than a stale banner — unlike the
// schedule, a resolved delay must not linger. Not the shared cached() helper,
// which serves 24h stale on failure.
async function njtAlerts(env, origin) {
  const key = new Request(`${origin}/__cache/njt-alerts`);
  const hit = await caches.default.match(key);
  if (hit) { try { return await hit.json(); } catch { /* refetch */ } }
  try {
    const alerts = await fetchNjtAlerts(env);
    await caches.default.put(key, new Response(JSON.stringify(alerts), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=120' },
    }));
    return alerts;
  } catch {
    return [];
  }
}

const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const INDEX_NAMES = { '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq', '^GSPC': 'S&P 500' };
const DEFAULT_SYMBOLS = Object.keys(INDEX_NAMES);

async function fetchMarkets(symbols) {
  // One unresolvable symbol shouldn't 502 the whole batch (and, without a
  // negative cache, re-hit Yahoo for the good symbols on every retry). Drop
  // the failures; only a total wipeout throws (so cached() serves stale/502).
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      // 2d, not 1d: once a foreign market closes, Yahoo rolls the session into
      // chartPreviousClose (price === prev → the card showed 0.00 daily change
      // for LSE tickers all evening). With two days of bars, mapYahooChart
      // takes the daily baseline from the prior session's last close itself.
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=15m`;
      const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      const out = mapYahooChart(await res.json(), INDEX_NAMES[symbol]);
      // Yahoo doesn't reliably honor range=2d from Cloudflare egress (it can
      // return a single session with the close already rolled — change 0.00),
      // even though the same request from a browser gets two days. When the
      // change computes to zero, pull the true prior close from a tiny
      // daily-bars request; a genuinely flat day just recomputes to zero.
      if (out.change === 0) {
        try {
          const r2 = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
            { headers: { 'User-Agent': YAHOO_UA }, signal: AbortSignal.timeout(10000) },
          );
          if (r2.ok) {
            const daily = ((await r2.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [])
              .filter(Number.isFinite);
            const prior = daily.length >= 2 ? daily[daily.length - 2] : null;
            if (Number.isFinite(prior) && prior !== 0) {
              out.change = out.price - prior;
              out.changePct = ((out.price - prior) / prior) * 100;
            }
          }
        } catch { /* keep the zero-change mapping */ }
      }
      return out;
    }),
  );
  const indices = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (!indices.length) throw new Error('yahoo: all symbols failed');
  // Mark an incomplete batch so cached() won't promote it over a complete 24h
  // stale backup (a later total outage should serve the full list, not this).
  const partial = indices.length < symbols.length;
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, indices, ...(partial && { partial: true }) };
}

// In-process dispatcher for the health monitor. A Worker fetching its OWN
// custom domain over the network loops (Cloudflare returns 522), so the health
// checks reach the worker's own routes by calling this handler directly instead
// of via fetch(). The hostname is arbitrary — only the path drives routing.
const selfFetch = (env) => (routePath) =>
  handlers.fetch(new Request('https://api.roomboard.app' + routePath), env);

// Last-alerted failing-check set, so the cron only alerts on a CHANGE (see
// alertPlan). Kept in the Cache API, not KV — it's colo-local and evictable, but
// a lost state just means one extra alert on the next run, which is harmless
// (and keeps the CODES KV codes-only). 24h TTL.
const HEALTH_STATE = new Request('https://api.roomboard.app/__health/laststate');
async function readHealthFailing() {
  try {
    const hit = await caches.default.match(HEALTH_STATE);
    if (hit) return (await hit.json()).failing ?? [];
  } catch { /* first run / evicted — treat as no prior failures */ }
  return [];
}
async function writeHealthFailing(failing) {
  try {
    await caches.default.put(
      HEALTH_STATE,
      new Response(JSON.stringify({ failing }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } }),
    );
  } catch { /* best effort */ }
}

const handlers = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (path === '/code' && request.method === 'POST') return postCode(request, env, url.origin);

    if (path === '/fleet' && request.method === 'POST') {
      // Anonymous usage heartbeat → Analytics Engine (see fleet.js). No KV,
      // no caching. A missing ANALYTICS binding (self-host without metrics)
      // accepts and drops so boards never see an error. parseBeacon bounds
      // the body size itself (oversized → 400).
      // Body read can reject on an aborted upload; that's the sender's problem,
      // not a 1101.
      const raw = await request.text().catch(() => null);
      const parsed = raw === null ? null : parseBeacon(raw);
      if (!parsed) return json({ error: 'bad_beacon' }, 400);
      // Country is edge-derived (request.cf.country, CF-IPCountry header at the
      // edge); model is parsed from the RoomOS WebEngine User-Agent — the board
      // never sends either. fleet.js validates/defaults both.
      const geo = request.cf?.country ?? request.headers.get('CF-IPCountry');
      const model = deviceModel(request.headers.get('User-Agent'));
      try {
        env.ANALYTICS?.writeDataPoint(beaconDataPoint({ ...parsed, country: geo, model }));
      } catch {
        // Metrics are best-effort — never fail the board over a write error.
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    const codeMatch = /^\/code\/([A-Za-z0-9]{6})$/.exec(path);
    if (codeMatch && request.method === 'GET') return getCode(env, codeMatch[1]);

    if (path === '/njt/departures' && request.method === 'GET') {
      if (!env.NJT_USER || !env.NJT_PASS) return json({ error: 'njt_not_configured' }, 503);
      // Pinned to New York Penn (the widget filters by line client-side). The
      // schedule is a static daily timetable served from KV (getNjtSchedule);
      // alerts are dynamic, so they ride a short colo cache and empty out (never
      // stale) when NJT is down — a resolved delay must not linger on the board.
      try {
        const schedule = await getNjtSchedule(env);
        const alerts = await njtAlerts(env, url.origin);
        return json({ ...schedule, alerts });
      } catch (err) {
        return json({ error: 'upstream_failed', detail: String(err) }, 502);
      }
    }

    if (path === '/markets' && request.method === 'GET') {
      const requested = (url.searchParams.get('symbols') ?? '')
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[\^A-Z0-9.\-]{1,10}$/.test(t))
        .slice(0, 10);
      // Dedupe for the fetch, but keep request order for display; the cache
      // key is sorted so AAPL,MSFT and MSFT,AAPL coalesce to one entry.
      const symbols = [...new Set(requested.length ? requested : DEFAULT_SYMBOLS)];
      const cacheKey = [...symbols].sort().join(',');
      return cached(url.origin, `markets:${cacheKey}`, 300, () => fetchMarkets(symbols));
    }

    if (path === '/path/realtime' && request.method === 'GET') {
      return cached(url.origin, 'path', 30, () => fetchPathRealtime());
    }

    if (path === '/ferry/departures' && request.method === 'GET') {
      return cached(url.origin, 'ferry', 60, () => fetchFerryDepartures());
    }

    if (path === '/posts/substack' && request.method === 'GET') {
      const pub = url.searchParams.get('pub') ?? '';
      if (!/^[a-z0-9-]{2,64}$/.test(pub)) return json({ error: 'bad_pub' }, 400);
      return cached(url.origin, `sub:${pub}`, 600, () => fetchSubstackPosts(pub));
    }

    if (path === '/services/status' && request.method === 'GET') {
      const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter((id) => Object.hasOwn(SERVICES, id)))].slice(0, 11);
      if (!ids.length) return json({ error: 'bad_ids' }, 400);
      // Sorted ids in the key so permutations share one cache entry.
      return cached(url.origin, `svc:${[...ids].sort().join(',')}`, 180, () => fetchServiceStatuses(ids));
    }

    if (path === '/golf' && request.method === 'GET') {
      return cached(url.origin, 'golf', 300, () => fetchGolf());
    }

    if (path === '/tennis' && request.method === 'GET') {
      return cached(url.origin, 'tennis', 300, () => fetchTennis());
    }

    if (path === '/f1' && request.method === 'GET') {
      // One global digest (next race + last podium + standings) from Jolpica,
      // fanned out and merged in fetchF1. 1h TTL — F1 data changes weekly.
      return cached(url.origin, 'f1', 3600, () => fetchF1());
    }

    if (path === '/amtrak/departures' && request.method === 'GET') {
      // NYP (Moynihan) Amtrak departure board from the keyless Amtraker feed,
      // filtered to NYP and cached fleet-wide 60s. Filtering by destination is
      // client-side (each departure carries its downstream stops).
      return cached(url.origin, 'amtrak', 60, () => fetchAmtrak());
    }

    if (path === '/chart' && request.method === 'GET') {
      // Statista Chart of the Day — scraped from the listing page (see chart.js),
      // 1h TTL; new charts post weekdays. `?topic=` re-points the scrape at a
      // per-topic page — validated against the curated CHART_TOPICS allowlist so
      // an unknown slug can't blank the card. No topic → the global cache key
      // (one fleet-wide entry); a valid topic → `chart:<topic>`.
      const topic = url.searchParams.get('topic') ?? '';
      if (topic && !CHART_TOPICS.some(([, slug]) => slug === topic)) {
        return json({ error: 'bad_topic' }, 400);
      }
      const chartKey = topic ? `chart:${topic}` : 'chart';
      return cached(url.origin, chartKey, 3600, () => fetchChart(topic));
    }

    if (path === '/apod' && request.method === 'GET') {
      // Single global daily image — one cache key, 1h TTL (APOD changes once a
      // day). NASA_KEY set; DEMO_KEY is the in-code fallback inside fetchApod.
      return cached(url.origin, 'apod', 3600, () => fetchApod(env));
    }

    if (path === '/citibike/status' && request.method === 'GET') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 6);
      if (!ids.length) return json({ error: 'bad_ids' }, 400);
      // 60s matches the GBFS feed ttl; sorted ids so permutations share a key.
      return cached(url.origin, `citibike:${[...ids].sort().join(',')}`, 60, () => fetchCitibike(ids));
    }

    if (path === '/tfl/status' && request.method === 'GET') {
      // One fleet-wide digest of all 19 lines; the widget filters to the chosen
      // set. 120s matches the Subway card's 2-minute cadence.
      return cached(url.origin, 'tfl', 120, () => fetchTfl(env));
    }

    if (path === '/gdrive/album' && request.method === 'GET') {
      if (!env.GDRIVE_KEY) return json({ error: 'gdrive_not_configured' }, 503);
      const folder = url.searchParams.get('folder') ?? '';
      if (!/^[-\w]{10,80}$/.test(folder)) return json({ error: 'bad_folder' }, 400);
      // 1800 s: thumbnailLink URLs are short-lived (order of hours), so the
      // digest regenerates well before they expire — the /icloud/album pattern.
      return cached(url.origin, `gdrive:${folder}`, 1800, () => fetchGdriveAlbum(env, folder));
    }

    if (path === '/icloud/album' && request.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      if (!/^[A-Za-z0-9]{8,25}$/.test(token)) return json({ error: 'bad_token' }, 400);
      return cached(url.origin, `icloud:${token}`, 1800, () => fetchIcloudAlbum(token));
    }

    const alertsMatch = /^\/alerts\/(subway|lirr|mnr)$/.exec(path);
    if (alertsMatch && request.method === 'GET') {
      return cached(url.origin, `alerts:${alertsMatch[1]}`, 120, () => fetchMtaAlerts(alertsMatch[1]));
    }

    if (path === '/sports/team' && request.method === 'GET') {
      const lg = url.searchParams.get('lg');
      const id = (url.searchParams.get('id') ?? '').toLowerCase();
      // Object.hasOwn, not truthiness — 'constructor'/'toString' inherit from
      // the prototype and would otherwise pass the whitelist check.
      if (!Object.hasOwn(SPORTS_LEAGUES, lg ?? '') || !/^[a-z0-9]{1,8}$/.test(id)) {
        return json({ error: 'bad_team' }, 400);
      }
      return cached(url.origin, `sports:${lg}:${id}`, 120, () => fetchTeamSummary(lg, id, url.origin));
    }

    const newsMatch = /^\/news\/([a-z0-9-]{1,24})$/.exec(path);
    if (newsMatch && request.method === 'GET') {
      if (!newsFeedUrl(newsMatch[1])) return json({ error: 'unknown_feed' }, 404);
      return cached(url.origin, `news:${newsMatch[1]}`, 600, () => fetchNewsFeed(newsMatch[1]));
    }

    if (path === '/bus/stops' && request.method === 'GET') {
      if (!env.MTA_BUS_KEY) return json({ error: 'bus_not_configured' }, 503);
      const legs = parseLegs(url.searchParams.get('legs') ?? '');
      if (!legs.length) return json({ stops: [] });
      // Key on the normalized parsed legs (sorted) so aliased/reordered raw
      // query strings share one entry instead of minting duplicates.
      const busKey = `bus:${legs.map((l) => `${l.stopId}:${l.lineRef}`).sort().join(',')}`;
      return cached(url.origin, busKey, 30, () => fetchBusStops(env, legs));
    }

    // On-demand health probe (same checks the cron runs). Returns 200 when all
    // green, 503 when any check fails — so an external uptime pinger can watch
    // this one URL as a belt-and-suspenders to the self-hosted cron.
    // /health?test=alert forces a synthetic alert so an operator can confirm the
    // ALERT_WEBHOOK channel actually delivers — an unverified alert path is
    // worthless. No-ops (like any alert) when the secret is unset.
    if (path === '/health' && request.method === 'GET') {
      const report = await runHealthChecks(env, selfFetch(env));
      if (url.searchParams.get('test') === 'alert') {
        await notify(env, `🔴 Room & Board health: test (manual channel-wiring check — not a real outage) — ${report.at}`);
      }
      return json(report, report.ok ? 200 : 503);
    }

    return json({ error: 'not_found' }, 404);
  },

  // Cron Trigger (see [triggers] in wrangler.toml): probe the key endpoints and
  // alert (ALERT_WEBHOOK) if any fail. waitUntil keeps the alert POST alive past
  // the handler return. A monitor living in the api worker still runs its checks
  // even when a bad deploy breaks the routes — the scheduled handler is separate
  // from fetch — so it catches route regressions, not just upstream outages.
  async scheduled(event, env, ctx) {
    const report = await runHealthChecks(env, selfFetch(env));
    // Alert only when the failing set changes (see alertPlan), so an ongoing
    // outage doesn't page every 20 min. Persist this run's failing set for the
    // next comparison regardless.
    const plan = alertPlan(report, await readHealthFailing());
    if (plan.changed && plan.text) ctx.waitUntil(notify(env, plan.text));
    ctx.waitUntil(writeHealthFailing(plan.failing));
  },
};

export default handlers;
