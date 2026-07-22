// Health monitor. Probes the key public endpoints and validates the RESPONSE
// CONTENT — not just up/down — so it catches the real failure mode: an upstream
// that returns HTTP 200 with reshaped garbage (e.g. Yahoo changing its JSON).
// Runs from the worker's scheduled() cron and on-demand via GET /health, and
// posts to ALERT_WEBHOOK on failure. Self-hosters: change the URLs below (or
// delete the [triggers] block in wrangler.toml to turn the monitor off).

export const CHECKS = [
  {
    name: 'site',
    url: 'https://roomboard.app/version.json',
    ok: (j) => typeof j.version === 'string' && j.version.length > 3,
  },
  {
    name: 'markets', // Yahoo (unofficial) — the flakiest dependency
    url: 'https://api.roomboard.app/markets',
    ok: (j) => Array.isArray(j.indices) && j.indices.length > 0 && Number.isFinite(j.indices[0].price),
  },
  {
    name: 'weather', // Open-Meteo, browser-direct (not proxied) — core dependency
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.75&longitude=-73.99&hourly=temperature_2m&forecast_days=1',
    ok: (j) => Array.isArray(j.hourly?.temperature_2m) && j.hourly.temperature_2m.length > 0,
  },
  {
    name: 'gdrive', // curated photos + backdrops; also proves GDRIVE_KEY works
    url: 'https://api.roomboard.app/gdrive/album?folder=1RHow60mcBwzMturimQSbziK3hqCvP2lz',
    ok: (j) => Array.isArray(j.photos) && j.photos.length > 0,
  },
  {
    name: 'amtrak', // one transit example; departures may be empty at night, so shape-only
    url: 'https://api.roomboard.app/amtrak/departures',
    ok: (j) => typeof j.station === 'string' && Array.isArray(j.departures),
  },
];

async function probe(check, fetchImpl) {
  try {
    const res = await fetchImpl(check.url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'cache-control': 'no-cache' }, // want live state, not a stale edge hit
    });
    if (!res.ok) return { name: check.name, ok: false, detail: `HTTP ${res.status}` };
    const body = await res.text();
    let json;
    try { json = JSON.parse(body); } catch { return { name: check.name, ok: false, detail: 'unparseable response' }; }
    if (!check.ok(json)) return { name: check.name, ok: false, detail: 'unexpected shape/content' };
    // stale=true means the worker served old cache because the upstream refresh
    // failed — a soft early-warning, surfaced but not treated as a hard failure.
    return { name: check.name, ok: true, detail: json.stale === true ? 'ok (stale cache)' : 'ok', stale: json.stale === true };
  } catch (err) {
    const detail = err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? err).slice(0, 80);
    return { name: check.name, ok: false, detail };
  }
}

// Runs every check concurrently. fetchImpl is injectable for tests.
export async function runHealthChecks(fetchImpl = fetch) {
  const results = await Promise.all(CHECKS.map((c) => probe(c, fetchImpl)));
  return { ok: results.every((r) => r.ok), at: new Date().toISOString(), results };
}

// Posts a failure summary to ALERT_WEBHOOK. Understands Slack incoming webhooks
// (JSON {text}) and ntfy.sh (plain body) by URL; no-ops with a log if the secret
// isn't set, so the monitor can deploy before the alert channel is wired. v1
// alerts on every failing run — if that gets noisy during a long outage, add a
// transition guard later.
export async function notify(env, report, fetchImpl = fetch) {
  const failed = report.results.filter((r) => !r.ok);
  const msg = `Room & Board health check FAILED: ${failed.map((r) => `${r.name} (${r.detail})`).join(', ')} — ${report.at}`;
  const url = env?.ALERT_WEBHOOK;
  if (!url) { console.error('[health]', msg, '(ALERT_WEBHOOK not set)'); return; }
  const ntfy = url.includes('ntfy.sh');
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: ntfy ? { Title: 'Room & Board health', Priority: 'high', Tags: 'red_circle' } : { 'content-type': 'application/json' },
      body: ntfy ? msg : JSON.stringify({ text: `🔴 ${msg}` }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[health] alert POST failed', err);
  }
}
