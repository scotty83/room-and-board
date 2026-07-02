// NJ Transit rail departures via the Cloudflare Worker (NJT's terms require
// their data be served from a non-NJT server; the Worker holds credentials
// and caches upstream responses).

import { WORKER_URL } from '../env.js';
import { escapeHtml } from '../util.js';

export const meta = { id: 'njt', title: 'NJ Transit', refreshMs: 2 * 60 * 1000 };

export function render(el, vm, _cfg) {
  el.innerHTML = vm.trains.length
    ? vm.trains
        .map(
          (t) => `<div class="train">
            <div class="train__min"><span>${t.min}</span><small>min</small></div>
            <div class="train__info">
              <span class="train__dest">${escapeHtml(t.dest)}</span>
              <span class="train__line">${escapeHtml(t.line)}${t.status ? ` · ${escapeHtml(t.status)}` : ''}</span>
            </div>
            ${t.track ? `<span class="train__track">Track ${escapeHtml(t.track)}</span>` : ''}
          </div>`,
        )
        .join('')
    : '<div class="empty">No departures</div>';
}

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
