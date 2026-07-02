// NJ Transit rail departures via the Cloudflare Worker (NJT's terms require
// their data be served from a non-NJT server; the Worker holds credentials
// and caches upstream responses).

import { WORKER_URL } from '../env.js';

export const meta = { id: 'njt', title: 'NJ Transit', refreshMs: 2 * 60 * 1000 };

export function mapNjt(payload, nowSec) {
  if (!payload || payload.error || !Array.isArray(payload.trains)) {
    return { updatedAt: null, stale: true, trains: [] };
  }
  const trains = payload.trains
    .filter((t) => Number.isFinite(t.time) && t.time > nowSec)
    .slice(0, 6)
    .map((t) => ({
      min: Math.max(1, Math.round((t.time - nowSec) / 60)),
      dest: String(t.dest ?? ''),
      line: String(t.line ?? ''),
      track: t.track ? String(t.track) : null,
      status: String(t.status ?? ''),
    }));
  return { updatedAt: payload.updatedAt ?? null, stale: Boolean(payload.stale), trains };
}

export async function fetchData(cfg, net) {
  const payload = await net.fetchJSON(
    `${WORKER_URL}/njt/departures?station=${encodeURIComponent(cfg.njt.station)}`,
  );
  return mapNjt(payload, Math.floor(Date.now() / 1000));
}
