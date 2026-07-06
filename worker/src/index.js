// Signage API worker: setup-code exchange (/code), NJ Transit proxy (/njt/*)
// and market indices (/markets). Everything responds with permissive CORS —
// nothing served here is sensitive, and the boards fetch from a static origin.

import { mapYahooChart } from './markets.js';
import { fetchNjtDepartures, fetchNjtStations } from './njt.js';
import { fetchMtaAlerts } from './alerts.js';
import { fetchBusStops } from './bus.js';
import { fetchNewsFeed, newsFeedUrl } from './news.js';
import { fetchTeamSummary, LEAGUE_PATHS as SPORTS_LEAGUES } from './sports.js';
import { fetchPathRealtime } from './path.js';
import { fetchFerryDepartures } from './ferry.js';
import { fetchSubstackPosts } from './posts.js';

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

async function postCode(request, env) {
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    if (await env.CODES.get(`code:${code}`)) continue; // collision, retry
    await env.CODES.put(`code:${code}`, body.cfg, { expirationTtl: CODE_TTL_S });
    return json({ code, expiresInSeconds: CODE_TTL_S });
  }
  return json({ error: 'code_generation_failed' }, 500);
}

async function getCode(env, code) {
  const key = `code:${code.toUpperCase()}`;
  const cfg = await env.CODES.get(key);
  if (cfg === null) return json({ error: 'not_found' }, 404);
  // Best-effort single use: KV deletes are eventually consistent (~60 s
  // globally), so a code may be redeemable more than once briefly. Codes
  // carry non-sensitive widget prefs and expire after an hour regardless.
  await env.CODES.delete(key);
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
    await Promise.all([cache.put(freshKey, entry(ttlS)), cache.put(staleKey, entry(STALE_TTL_S))]);
    return json(fresh);
  } catch (err) {
    const stale = await cache.match(staleKey);
    if (stale) return json({ ...(await stale.json()), stale: true });
    return json({ error: 'upstream_failed', detail: String(err) }, 502);
  }
}

const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const INDEX_NAMES = { '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq', '^GSPC': 'S&P 500' };
const DEFAULT_SYMBOLS = Object.keys(INDEX_NAMES);

async function fetchMarkets(symbols) {
  const indices = await Promise.all(
    symbols.map(async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
      const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      return mapYahooChart(await res.json(), INDEX_NAMES[symbol]);
    }),
  );
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, indices };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (path === '/code' && request.method === 'POST') return postCode(request, env);

    const codeMatch = /^\/code\/([A-Za-z0-9]{6})$/.exec(path);
    if (codeMatch && request.method === 'GET') return getCode(env, codeMatch[1]);

    if (path === '/njt/departures' && request.method === 'GET') {
      if (!env.NJT_USER || !env.NJT_PASS) return json({ error: 'njt_not_configured' }, 503);
      const station = url.searchParams.get('station');
      if (!station || !/^[A-Za-z0-9]{2,4}$/.test(station)) return json({ error: 'bad_station' }, 400);
      const st = station.toUpperCase();
      return cached(url.origin, `njt:${st}`, 60, () => fetchNjtDepartures(env, st));
    }

    if (path === '/njt/stations' && request.method === 'GET') {
      if (!env.NJT_USER || !env.NJT_PASS) return json({ error: 'njt_not_configured' }, 503);
      return cached(url.origin, 'njtstations', 24 * 3600, async () => ({
        stations: await fetchNjtStations(env),
      }));
    }

    if (path === '/markets' && request.method === 'GET') {
      const requested = (url.searchParams.get('symbols') ?? '')
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter((t) => /^[\^A-Z0-9.\-]{1,10}$/.test(t))
        .slice(0, 10);
      const symbols = requested.length ? requested : DEFAULT_SYMBOLS;
      return cached(url.origin, `markets:${symbols.join(',')}`, 300, () => fetchMarkets(symbols));
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

    const alertsMatch = /^\/alerts\/(subway|lirr|mnr)$/.exec(path);
    if (alertsMatch && request.method === 'GET') {
      return cached(url.origin, `alerts:${alertsMatch[1]}`, 120, () => fetchMtaAlerts(alertsMatch[1]));
    }

    if (path === '/sports/team' && request.method === 'GET') {
      const lg = url.searchParams.get('lg');
      const id = (url.searchParams.get('id') ?? '').toLowerCase();
      if (!SPORTS_LEAGUES[lg] || !/^[a-z0-9]{1,8}$/.test(id)) return json({ error: 'bad_team' }, 400);
      return cached(url.origin, `sports:${lg}:${id}`, 120, () => fetchTeamSummary(lg, id));
    }

    const newsMatch = /^\/news\/([a-z0-9-]{1,24})$/.exec(path);
    if (newsMatch && request.method === 'GET') {
      if (!newsFeedUrl(newsMatch[1])) return json({ error: 'unknown_feed' }, 404);
      return cached(url.origin, `news:${newsMatch[1]}`, 600, () => fetchNewsFeed(newsMatch[1]));
    }

    if (path === '/bus/stops' && request.method === 'GET') {
      if (!env.MTA_BUS_KEY) return json({ error: 'bus_not_configured' }, 503);
      const ids = (url.searchParams.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{4,7}$/.test(s))
        .slice(0, 2);
      if (!ids.length) return json({ error: 'bad_stop_ids' }, 400);
      return cached(url.origin, `bus:${ids.join(',')}`, 30, () => fetchBusStops(env, ids));
    }

    return json({ error: 'not_found' }, 404);
  },
};
