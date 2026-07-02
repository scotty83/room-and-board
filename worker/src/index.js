// Signage API worker: setup-code exchange (/code), NJ Transit proxy (/njt/*)
// and market indices (/markets). Everything responds with permissive CORS —
// nothing served here is sensitive, and the boards fetch from a static origin.

import { mapYahooChart } from './markets.js';
import { fetchNjtDepartures, fetchNjtStations } from './njt.js';
import { fetchMtaAlerts } from './alerts.js';

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

// Fresh-or-stale KV caching shared by /njt/departures and /markets: serve the
// stored copy while it is younger than ttlS; otherwise refetch, falling back
// to the stored copy (flagged stale) when upstream fails.
async function cached(env, key, ttlS, fetcher) {
  const [cachedAt, last] = await Promise.all([
    env.CODES.get(`${key}:cachedAt`),
    env.CODES.get(`${key}:last`, 'json'),
  ]);
  const age = cachedAt ? Date.now() / 1000 - Number(cachedAt) : Infinity;
  if (last && age < ttlS) return json(last);
  try {
    const fresh = await fetcher();
    await Promise.all([
      env.CODES.put(`${key}:last`, JSON.stringify(fresh)),
      env.CODES.put(`${key}:cachedAt`, String(Math.floor(Date.now() / 1000))),
    ]);
    return json(fresh);
  } catch (err) {
    if (last) return json({ ...last, stale: true });
    return json({ error: 'upstream_failed', detail: String(err) }, 502);
  }
}

const YAHOO_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const INDICES = [
  ['^DJI', 'Dow Jones'],
  ['^IXIC', 'Nasdaq'],
  ['^GSPC', 'S&P 500'],
];

async function fetchMarkets() {
  const indices = await Promise.all(
    INDICES.map(async ([symbol, name]) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`;
      const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      return mapYahooChart(await res.json(), name);
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
      return cached(env, `njt:${st}`, 60, () => fetchNjtDepartures(env, st));
    }

    if (path === '/njt/stations' && request.method === 'GET') {
      if (!env.NJT_USER || !env.NJT_PASS) return json({ error: 'njt_not_configured' }, 503);
      return cached(env, 'njtstations', 24 * 3600, async () => ({
        stations: await fetchNjtStations(env),
      }));
    }

    if (path === '/markets' && request.method === 'GET') {
      return cached(env, 'markets', 300, fetchMarkets);
    }

    const alertsMatch = /^\/alerts\/(subway|lirr)$/.exec(path);
    if (alertsMatch && request.method === 'GET') {
      return cached(env, `alerts:${alertsMatch[1]}`, 120, () => fetchMtaAlerts(alertsMatch[1]));
    }

    return json({ error: 'not_found' }, 404);
  },
};
