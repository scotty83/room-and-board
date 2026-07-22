import { describe, it, expect, vi } from 'vitest';
import { CHECKS, runHealthChecks, notify } from '../../worker/src/health.js';

// Valid response bodies keyed by a unique substring of each check's URL, so a
// mock fetch can answer every probe with a shape its validator accepts.
const OK_BODIES = {
  'version.json': { version: '2026.07.22-abc1234' },
  '/markets': { indices: [{ symbol: '^DJI', price: 52376.73 }] },
  'open-meteo': { hourly: { temperature_2m: [70, 71, 69] } },
  'gdrive': { photos: [{ id: 'a' }, { id: 'b' }] },
  'amtrak': { station: 'New York Penn', departures: [] }, // empty at night is still healthy
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
});

describe('runHealthChecks', () => {
  it('reports ok when every endpoint is healthy', async () => {
    const report = await runHealthChecks(mockFetch());
    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(CHECKS.length);
    expect(report.results.every((r) => r.ok)).toBe(true);
  });
  it('flags a non-200 with its status', async () => {
    const report = await runHealthChecks(mockFetch({ '/markets': { status: 503 } }));
    expect(report.ok).toBe(false);
    const markets = report.results.find((r) => r.name === 'markets');
    expect(markets).toMatchObject({ ok: false, detail: 'HTTP 503' });
  });
  it('flags an unparseable body', async () => {
    const report = await runHealthChecks(mockFetch({ 'open-meteo': { body: '<html>down</html>' } }));
    expect(report.results.find((r) => r.name === 'weather')).toMatchObject({ ok: false, detail: 'unparseable response' });
  });
  it('flags a 200 with the wrong shape (the reshaped-JSON case)', async () => {
    const report = await runHealthChecks(mockFetch({ '/markets': { body: JSON.stringify({ indices: [] }) } }));
    expect(report.results.find((r) => r.name === 'markets')).toMatchObject({ ok: false, detail: 'unexpected shape/content' });
  });
  it('flags a timeout by name', async () => {
    const report = await runHealthChecks(mockFetch({ gdrive: { throw: 'TimeoutError' } }));
    expect(report.results.find((r) => r.name === 'gdrive')).toMatchObject({ ok: false, detail: 'timeout' });
  });
});

describe('notify', () => {
  const failReport = { at: 'T', results: [{ name: 'markets', ok: false, detail: 'HTTP 503' }, { name: 'site', ok: true, detail: 'ok' }] };

  it('no-ops (no POST) when ALERT_WEBHOOK is unset', async () => {
    const fetchImpl = vi.fn();
    await notify({}, failReport, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('posts Slack-shaped JSON naming only the failed checks', async () => {
    const fetchImpl = mockFetch();
    await notify({ ALERT_WEBHOOK: 'https://hooks.slack.com/services/x' }, failReport, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['content-type']).toBe('application/json');
    const payload = JSON.parse(init.body);
    expect(payload.text).toContain('markets (HTTP 503)');
    expect(payload.text).not.toContain('site');
  });
  it('posts a plain-text body with Title header for ntfy.sh', async () => {
    const fetchImpl = mockFetch();
    await notify({ ALERT_WEBHOOK: 'https://ntfy.sh/roomboard-alerts' }, failReport, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Title).toBe('Room & Board health');
    expect(typeof init.body).toBe('string');
    expect(init.body).toContain('markets (HTTP 503)');
  });
});
