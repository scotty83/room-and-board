// NJ Transit rail departures from New York Penn Station via the Cloudflare
// Worker (NJT's terms require their data be served from a non-NJT server; the
// Worker holds credentials and caches upstream responses). Penn-fixed like
// LIRR/Amtrak — the user filters to specific lines client-side (cfg.njt.lines,
// [] = all lines).

import { WORKER_URL } from '../env.js';
import { escapeHtml, fmtTime } from '../util.js';
import { renderAlertRows } from '../transit-alerts.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'njt', title: 'NJ Transit — Penn Station', refreshMs: 2 * 60 * 1000 };

export function render(el, vm, _cfg) {
  el.classList.toggle('has-alerts', Boolean(vm.alerts?.length));
  const [w, h] = cardSize(el, [4, 4]);
  const cap = Math.max(1, itemCapacity('njt', w, h) - (vm.alerts?.length ?? 0));
  const shown = vm.trains.slice(0, cap);
  el.innerHTML = renderAlertRows(vm.alerts) + '<div class="trains">' + (shown.length
    ? shown
        .map(
          (t) => `<div class="train">
            <div class="train__min"><span>${t.min}</span><small>min</small></div>
            <div class="train__info">
              <span class="train__dest">${escapeHtml(t.dest)}</span>
              <span class="train__line">${escapeHtml(t.line)} · ${fmtTime(t.time)}${t.status ? ` · ${escapeHtml(t.status)}` : ''}</span>
            </div>
            ${t.track ? `<span class="train__track">Track ${escapeHtml(t.track)}</span>` : ''}
          </div>`,
        )
        .join('')
    : '<div class="empty">No departures</div>') + '</div>';
}

export function mapNjt(payload, nowSec, showAlerts = true) {
  if (!payload || payload.error || !Array.isArray(payload.trains)) {
    return { updatedAt: null, stale: true, trains: [], alerts: [] };
  }
  const trains = payload.trains
    .filter((t) => {
      if (!Number.isFinite(t.time)) return false;
      if (t.time > nowSec) return true;
      // NJT times are static schedule stamps, not live predictions — a train
      // past its scheduled minute is still boardable if it hasn't departed.
      // Keep it for a 15-min grace window when its status says so.
      const s = (t.status ?? '').toUpperCase();
      return Boolean(s) && !s.includes('DEPART') && !s.includes('CANCEL') && t.time > nowSec - 15 * 60;
    })
    .slice(0, 12)
    .map((t) => ({
      time: t.time,
      min: Math.max(0, Math.round((t.time - nowSec) / 60)),
      dest: String(t.dest ?? ''),
      line: String(t.line ?? ''),
      track: t.track ? String(t.track) : null,
      status: String(t.status ?? ''),
    }));
  const alerts = showAlerts
    ? (payload.alerts ?? []).filter((a) => typeof a?.header === 'string').slice(0, 2)
    : [];
  return { updatedAt: payload.updatedAt ?? null, stale: Boolean(payload.stale), trains, alerts };
}

export async function fetchData(cfg, net) {
  const payload = await net.fetchJSON(`${WORKER_URL}/njt/departures`);
  const vm = mapNjt(payload, Math.floor(Date.now() / 1000), cfg.njt.alerts);
  // Client-side line filter (mirrors Amtrak's dest filter): [] = all lines.
  const lines = cfg.njt.lines ?? [];
  if (lines.length) {
    const want = new Set(lines.map((l) => l.toLowerCase().trim()));
    vm.trains = vm.trains.filter((t) => want.has(t.line.toLowerCase().trim()));
  }
  return vm;
}
