// Health monitor. Probes the key endpoints and validates the RESPONSE CONTENT —
// not just up/down — so it catches the real failure mode: an upstream that
// returns HTTP 200 with reshaped garbage (e.g. Yahoo changing its JSON), or a
// worker route quietly serving hours-old cache (e.g. NJT after its daily token
// cap is hit). Runs from the worker's scheduled() cron and on-demand via GET
// /health, and posts to ALERT_WEBHOOK on failure.
//
// Checks with `path` are the worker's OWN routes: they run in-process via
// selfFetch (a Worker fetching its own custom domain over the network loops →
// Cloudflare 522). Checks with `url` are external and use plain fetch.
// `maxStaleSec` (own-route checks only): when the worker serves last-good cache
// (`stale: true`) because the upstream refresh keeps failing, tolerate a brief
// blip but FAIL once the data is older than this, that sustained-stale window is
// exactly how the NJT token cap and similar silent degradations show up.
// Self-hosters: change the hosts/paths (or delete the [triggers] block in
// wrangler.toml to turn the cron off).

const STALE_MAX = 3600; // 1h: past this, stale cache means the upstream is really down

export const CHECKS = [
  {
    name: 'site',
    url: 'https://roomboard.app/version.json',
    ok: (j) => typeof j.version === 'string' && j.version.length > 3,
  },
  {
    name: 'markets', // Yahoo (unofficial) — the flakiest dependency
    path: '/markets',
    maxStaleSec: STALE_MAX,
    ok: (j) => Array.isArray(j.indices) && j.indices.length > 0 && Number.isFinite(j.indices[0].price),
  },
  {
    name: 'weather', // Open-Meteo, browser-direct (not proxied) — core dependency
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.75&longitude=-73.99&hourly=temperature_2m&forecast_days=1',
    ok: (j) => Array.isArray(j.hourly?.temperature_2m) && j.hourly.temperature_2m.length > 0,
  },
  {
    name: 'gdrive', // curated photos + backdrops; also proves GDRIVE_KEY works
    path: '/gdrive/album?folder=1RHow60mcBwzMturimQSbziK3hqCvP2lz',
    maxStaleSec: STALE_MAX,
    ok: (j) => Array.isArray(j.photos) && j.photos.length > 0,
  },
  {
    name: 'amtrak', // Amtraker (unofficial) transit proxy
    path: '/amtrak/departures',
    maxStaleSec: STALE_MAX,
    ok: (j) => typeof j.station === 'string' && Array.isArray(j.departures),
  },
  {
    name: 'njt', // NJTransit — getStationSchedule is a STATIC daily timetable, so
    // "old" is not "wrong": healthy = the schedule still has a future departure.
    // A prior-day timetable (every train already in the past) is the real
    // failure. No maxStaleSec — staleness is meaningless for static daily data,
    // and NJT's own endpoint is chronically flaky (recovers only at its midnight
    // reset), so paging on age would just be nightly noise. See the redesign
    // plan in docs/superpowers/plans for fetch-once-per-day.
    path: '/njt/departures',
    ok: (j) => typeof j.station === 'string' && Array.isArray(j.trains) && j.trains.some((t) => Number(t?.time) > Date.now() / 1000),
  },
];

// Age of a payload in seconds. All worker routes stamp updatedAt as epoch
// seconds (Math.floor(Date.now()/1000)). null when absent/unparseable.
function ageSeconds(updatedAt) {
  const n = Number(updatedAt);
  if (!Number.isFinite(n)) return null;
  return Math.floor(Date.now() / 1000) - n;
}

// Rejects with a TimeoutError if p doesn't settle in ms; clears the timer on
// settle so it never dangles (matters for the in-process self checks, which
// have no fetch AbortSignal of their own).
function withTimeout(p, ms) {
  let t;
  const timer = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

async function probe(check, selfFetch, extFetch) {
  try {
    const res = check.path
      ? await withTimeout(selfFetch(check.path), 13000)
      : await extFetch(check.url, { signal: AbortSignal.timeout(12000), headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) {
      // An optional route the operator chose not to configure (NJT without
      // creds, bus without a key) returns 503 {error:'..._not_configured'} —
      // a choice, not an outage. Skip it rather than page forever.
      if (res.status === 503) {
        const b = await res.text().catch(() => '');
        if (/_not_configured/.test(b)) return { name: check.name, ok: true, detail: 'not configured (skipped)' };
      }
      return { name: check.name, ok: false, detail: `HTTP ${res.status}` };
    }
    const body = await res.text();
    let json;
    try { json = JSON.parse(body); } catch { return { name: check.name, ok: false, detail: 'unparseable response' }; }
    if (!check.ok(json)) return { name: check.name, ok: false, detail: 'unexpected shape/content' };
    // stale=true means the worker served last-good cache because the upstream
    // refresh failed. Tolerate a brief blip; FAIL once it's older than
    // maxStaleSec (the upstream has been down a while and the data is misleading).
    if (json.stale === true) {
      const age = ageSeconds(json.updatedAt);
      const mins = age === null ? null : Math.round(age / 60);
      if (check.maxStaleSec && age !== null && age > check.maxStaleSec) {
        return { name: check.name, ok: false, detail: `stale ${mins} min old`, stale: true, ageSec: age };
      }
      return { name: check.name, ok: true, detail: mins === null ? 'ok (stale cache)' : `ok (stale ${mins} min)`, stale: true, ageSec: age };
    }
    return { name: check.name, ok: true, detail: 'ok', stale: false };
  } catch (err) {
    const detail = err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? err).slice(0, 80);
    return { name: check.name, ok: false, detail };
  }
}

// Runs every check concurrently. selfFetch(path)→Response dispatches the worker's
// own routes in-process; extFetch defaults to global fetch (injectable for tests).
export async function runHealthChecks(env, selfFetch, extFetch = fetch) {
  const results = await Promise.all(CHECKS.map((c) => probe(c, selfFetch, extFetch)));
  return { ok: results.every((r) => r.ok), at: new Date().toISOString(), results };
}

// Decides whether to alert this run, given the set of checks that failed LAST
// run (persisted by the caller). Only a CHANGE pages: a check flipping fail↔ok.
// An ongoing outage stays silent after its first alert, so a stuck dependency
// (e.g. NJT's token cap all afternoon) doesn't page every 20 min. Returns the
// current failing-check names for the caller to persist for next time.
export function alertPlan(report, prevFailing = []) {
  const failing = report.results.filter((r) => !r.ok);
  const names = failing.map((r) => r.name);
  const sameSet = names.length === prevFailing.length && names.every((n) => prevFailing.includes(n));
  if (sameSet) return { changed: false, failing: names, text: null };
  const recovered = prevFailing.filter((n) => !names.includes(n));
  let text;
  if (failing.length) {
    text = `🔴 Room & Board health: ${failing.map((r) => `${r.name} (${r.detail})`).join(', ')}`;
    if (recovered.length) text += ` (recovered: ${recovered.join(', ')})`;
  } else {
    text = `✅ Room & Board health: all clear (recovered: ${recovered.join(', ')})`;
  }
  return { changed: true, failing: names, text: `${text} — ${report.at}` };
}

// Posts a prebuilt message to ALERT_WEBHOOK. Understands Slack incoming webhooks
// (JSON {text}) and ntfy.sh (plain body) by URL; no-ops with a log if the secret
// isn't set, so the monitor can deploy before the alert channel is wired.
export async function notify(env, text, fetchImpl = fetch) {
  const url = env?.ALERT_WEBHOOK;
  if (!url) { console.error('[health]', text, '(ALERT_WEBHOOK not set)'); return; }
  const ntfy = url.includes('ntfy.sh');
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: ntfy ? { Title: 'Room & Board health' } : { 'content-type': 'application/json' },
      body: ntfy ? text : JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[health] alert POST failed', err);
  }
}
