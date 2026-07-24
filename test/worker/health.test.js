import { describe, it, expect, vi } from 'vitest';
import { CHECKS, runHealthChecks, notify, alertPlan } from '../../worker/src/health.js';

// Valid response bodies keyed by a unique substring of each check's URL, so a
// mock fetch can answer every probe with a shape its validator accepts.
const OK_BODIES = {
  'version.json': { version: '2026.07.22-abc1234' },
  '/markets': { indices: [{ symbol: '^DJI', price: 52376.73 }] },
  'open-meteo': { hourly: { temperature_2m: [70, 71, 69] } },
  'gdrive': { photos: [{ id: 'a' }, { id: 'b' }] },
  'amtrak': { station: 'New York Penn', departures: [] }, // empty at night is still healthy
  '/njt': { station: 'NY', trains: [{ time: 9999999999, dest: 'Trenton' }] }, // far-future = an upcoming departure exists
};
const bodyFor = (url) => OK_BODIES[Object.keys(OK_BODIES).find((k) => url.includes(k))];

// Mock fetch. overrides maps a URL-substring to {status} or {body:'raw'} to
// force a specific failure for one check while the rest stay green.
function mockFetch(overrides = {}) {
  return vi.fn((url) => {
    const key = Object.keys(overrides).find((k) => url.includes(k));
    const o = overrides[key];
    if (o?.throw) return Promise.reject(Object.assign(new Error('boom'), { name: o.throw }));
    const status = o?.status ?? 200;
    const body = o && 'body' in o ? o.body : JSON.stringify(bodyFor(url));
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
  });
}

describe('health CHECKS validators', () => {
  const byName = Object.fromEntries(CHECKS.map((c) => [c.name, c.ok]));

  it('site: needs a version string', () => {
    expect(byName.site({ version: '2026.07.22-abc' })).toBe(true);
    expect(byName.site({})).toBe(false);
    expect(byName.site({ version: '' })).toBe(false);
  });
  it('markets: needs indices with a finite price', () => {
    expect(byName.markets({ indices: [{ price: 100 }] })).toBe(true);
    expect(byName.markets({ indices: [] })).toBe(false);
    expect(byName.markets({ indices: [{ price: 'x' }] })).toBe(false);
    expect(byName.markets({})).toBe(false);
  });
  it('weather: needs an hourly temperature series', () => {
    expect(byName.weather({ hourly: { temperature_2m: [1, 2] } })).toBe(true);
    expect(byName.weather({ hourly: { temperature_2m: [] } })).toBe(false);
    expect(byName.weather({ hourly: {} })).toBe(false);
  });
  it('gdrive: needs a non-empty photos array', () => {
    expect(byName.gdrive({ photos: [{}] })).toBe(true);
    expect(byName.gdrive({ photos: [] })).toBe(false);
  });
  it('amtrak: shape-only (departures may be empty)', () => {
    expect(byName.amtrak({ station: 'NYP', departures: [] })).toBe(true);
    expect(byName.amtrak({ station: 'NYP' })).toBe(false);
    expect(byName.amtrak({ departures: [] })).toBe(false);
  });
  it('njt: healthy only with an upcoming departure (static daily schedule)', () => {
    const now = Date.now() / 1000;
    expect(byName.njt({ station: 'NY', trains: [{ time: now + 600 }] })).toBe(true);
    expect(byName.njt({ station: 'NY', trains: [{ time: now - 600 }] })).toBe(false); // all past = prior day
    expect(byName.njt({ station: 'NY', trains: [] })).toBe(false);
    expect(byName.njt({ trains: [{ time: now + 600 }] })).toBe(false); // no station
  });
});

describe('runHealthChecks', () => {
  // One mock serves both the in-process self checks (called with a path) and the
  // external checks (called with a URL) — it matches by URL/path substring.
  const run = (overrides = {}) => {
    const m = mockFetch(overrides);
    return runHealthChecks({}, m, m);
  };

  it('reports ok when every endpoint is healthy', async () => {
    const report = await run();
    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(CHECKS.length);
    expect(report.results.every((r) => r.ok)).toBe(true);
  });
  it('flags a non-200 with its status', async () => {
    const report = await run({ '/markets': { status: 503 } });
    expect(report.ok).toBe(false);
    const markets = report.results.find((r) => r.name === 'markets');
    expect(markets).toMatchObject({ ok: false, detail: 'HTTP 503' });
  });
  it('flags an unparseable body', async () => {
    const report = await run({ 'open-meteo': { body: '<html>down</html>' } });
    expect(report.results.find((r) => r.name === 'weather')).toMatchObject({ ok: false, detail: 'unparseable response' });
  });
  it('flags a 200 with the wrong shape (the reshaped-JSON case)', async () => {
    const report = await run({ '/markets': { body: JSON.stringify({ indices: [] }) } });
    expect(report.results.find((r) => r.name === 'markets')).toMatchObject({ ok: false, detail: 'unexpected shape/content' });
  });
  it('flags a timeout by name', async () => {
    const report = await run({ gdrive: { throw: 'TimeoutError' } });
    expect(report.results.find((r) => r.name === 'gdrive')).toMatchObject({ ok: false, detail: 'timeout' });
  });
});

describe('stale-age (cached routes serving old data)', () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const run = (overrides = {}) => {
    const m = mockFetch(overrides);
    return runHealthChecks({}, m, m);
  };
  const byName = (report, name) => report.results.find((r) => r.name === name);

  it('FAILS when a real-time route is stale beyond the 1h threshold', async () => {
    const body = JSON.stringify({ indices: [{ price: 100 }], stale: true, updatedAt: nowSec() - 6 * 3600 });
    const report = await run({ '/markets': { body } });
    const markets = byName(report, 'markets');
    expect(markets.ok).toBe(false);
    expect(markets.detail).toMatch(/stale \d+ min old/);
    expect(report.ok).toBe(false);
  });

  it('tolerates brief staleness within the threshold', async () => {
    const body = JSON.stringify({ indices: [{ price: 100 }], stale: true, updatedAt: nowSec() - 10 * 60 });
    const report = await run({ '/markets': { body } });
    const markets = byName(report, 'markets');
    expect(markets.ok).toBe(true);
    expect(markets.detail).toMatch(/ok \(stale \d+ min\)/);
  });

  it('treats a 503 not-configured route as skipped, not failed', async () => {
    const report = await run({ '/njt': { status: 503, body: JSON.stringify({ error: 'njt_not_configured' }) } });
    expect(byName(report, 'njt')).toMatchObject({ ok: true, detail: 'not configured (skipped)' });
  });
});

describe('njt static-schedule health (age-agnostic)', () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const run = (overrides = {}) => {
    const m = mockFetch(overrides);
    return runHealthChecks({}, m, m);
  };
  const njtResult = (report) => report.results.find((r) => r.name === 'njt');

  it('a stale-but-current timetable is HEALTHY (has an upcoming train, no age penalty)', async () => {
    // 6h stale, but the static schedule still has a future departure — the widget
    // shows correct trains, so this must NOT page (that was the nightly noise).
    const body = JSON.stringify({ station: 'NY', stale: true, updatedAt: nowSec() - 6 * 3600, trains: [{ time: nowSec() + 1200 }] });
    const report = await run({ '/njt': { body } });
    expect(njtResult(report).ok).toBe(true);
    expect(report.ok).toBe(true);
  });

  it('a prior-day timetable (every train in the past) FAILS', async () => {
    const body = JSON.stringify({ station: 'NY', stale: true, updatedAt: nowSec() - 26 * 3600, trains: [{ time: nowSec() - 3600 }] });
    const report = await run({ '/njt': { body } });
    expect(njtResult(report).ok).toBe(false);
  });
});

describe('notify', () => {
  it('no-ops (no POST) when ALERT_WEBHOOK is unset', async () => {
    const fetchImpl = vi.fn();
    await notify({}, 'anything', fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('posts the message as Slack-shaped JSON', async () => {
    const fetchImpl = mockFetch();
    await notify({ ALERT_WEBHOOK: 'https://hooks.slack.com/services/x' }, '🔴 markets (HTTP 503)', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body).text).toBe('🔴 markets (HTTP 503)');
  });
  it('posts a plain-text body with Title header for ntfy.sh', async () => {
    const fetchImpl = mockFetch();
    await notify({ ALERT_WEBHOOK: 'https://ntfy.sh/roomboard-alerts' }, 'markets (HTTP 503)', fetchImpl);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Title).toBe('Room & Board health');
    expect(init.body).toBe('markets (HTTP 503)');
  });
});

describe('alertPlan (alert only on change)', () => {
  const mk = (name, ok, detail = 'ok') => ({ name, ok, detail });
  const rep = (results) => ({ at: '2026-07-22T00:00:00Z', results });

  it('stays silent when the failing set is unchanged (ongoing outage)', () => {
    const plan = alertPlan(rep([mk('njt', false, 'stale 500 min old'), mk('site', true)]), ['njt']);
    expect(plan.changed).toBe(false);
    expect(plan.text).toBeNull();
    expect(plan.failing).toEqual(['njt']);
  });
  it('stays silent when all green and nothing was failing', () => {
    expect(alertPlan(rep([mk('site', true), mk('njt', true)]), []).changed).toBe(false);
  });
  it('alerts on a newly-failing check', () => {
    const plan = alertPlan(rep([mk('njt', false, 'stale 500 min old'), mk('site', true)]), []);
    expect(plan.changed).toBe(true);
    expect(plan.text).toContain('🔴');
    expect(plan.text).toContain('njt (stale 500 min old)');
    expect(plan.failing).toEqual(['njt']);
  });
  it('sends a recovery notice when the last failure clears', () => {
    const plan = alertPlan(rep([mk('njt', true), mk('site', true)]), ['njt']);
    expect(plan.changed).toBe(true);
    expect(plan.text).toContain('✅');
    expect(plan.text).toContain('all clear');
    expect(plan.text).toContain('recovered: njt');
    expect(plan.failing).toEqual([]);
  });
  it('alerts when another check fails on top of an existing one', () => {
    const plan = alertPlan(rep([mk('njt', false, 'stale 500 min old'), mk('markets', false, 'HTTP 502')]), ['njt']);
    expect(plan.changed).toBe(true);
    expect(plan.text).toContain('markets (HTTP 502)');
    expect(plan.failing.sort()).toEqual(['markets', 'njt']);
  });
  it('notes a partial recovery while another stays down', () => {
    const plan = alertPlan(rep([mk('njt', false, 'stale 500 min old'), mk('markets', true)]), ['njt', 'markets']);
    expect(plan.changed).toBe(true);
    expect(plan.text).toContain('njt (stale 500 min old)');
    expect(plan.text).toContain('recovered: markets');
  });
});
