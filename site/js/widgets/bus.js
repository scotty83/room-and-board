// MTA Bus arrivals for up to two stop codes (the 6-digit numbers on bus stop
// signs), via the Worker's Bus Time proxy. Shows minutes when a prediction
// exists, otherwise Bus Time's distance ("approaching", "2 stops away").

import { WORKER_URL } from '../env.js';
import { escapeHtml } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'bus', title: 'MTA Bus', refreshMs: 60 * 1000 };

export function mapBus(payload, nowSec) {
  if (!payload || payload.error || !Array.isArray(payload.stops)) {
    return { configured: !payload || payload.error !== 'bus_not_configured', stops: [] };
  }
  return {
    configured: true,
    stops: payload.stops.map((stop) => ({
      id: stop.id,
      name: stop.name,
      arrivals: (stop.arrivals ?? [])
        .filter((a) => a.route && (a.time === null || a.time > nowSec))
        .slice(0, 3)
        .map((a) => ({
          route: a.route,
          dest: a.dest,
          min: a.time ? Math.max(1, Math.round((a.time - nowSec) / 60)) : null,
          distance: a.distance,
        })),
    })),
  };
}

export function render(el, vm, _cfg) {
  if (!vm.configured) {
    el.innerHTML = '<div class="empty">Bus Time key not configured on the server</div>';
    return;
  }
  if (!vm.stops.length) {
    el.innerHTML = '<div class="empty">Add a bus stop code in Settings → MTA Bus</div>';
    return;
  }
  // Slice to the card, don't clip: each stop costs one header row plus its
  // arrival rows. Fit as many stops as have room for a header + one arrival,
  // sharing the remaining budget across their arrivals.
  const [w, h] = cardSize(el, [4, 4]);
  let left = itemCapacity('bus', w, h) ?? 4;
  const groups = [];
  for (const stop of vm.stops) {
    if (left < 2) break; // no room for a header + at least one row
    const shown = stop.arrivals.slice(0, Math.max(1, Math.min(stop.arrivals.length || 1, left - 1)));
    left -= 1 + shown.length;
    groups.push({ ...stop, arrivals: shown });
  }
  const hiddenStops = vm.stops.length - groups.length;
  el.innerHTML = groups
    .map(
      (stop) => `<div class="stop-group">
        <div class="stop-group__head"><span class="stop-group__name">${escapeHtml(stop.name || `Stop ${stop.id}`)}</span></div>
        <div class="trains">${
          stop.arrivals.length
            ? stop.arrivals
                .map(
                  (a) => `<div class="train">
                    <div class="train__min">${
                      a.min !== null
                        ? `<span>${a.min}</span><small>min</small>`
                        : `<small class="train__dist">${escapeHtml(a.distance || 'due')}</small>`
                    }</div>
                    <div class="train__info">
                      <span class="train__dest"><b class="buspill">${escapeHtml(a.route)}</b> ${escapeHtml(a.dest)}</span>
                    </div>
                  </div>`,
                )
                .join('')
            : '<div class="empty">No buses en route</div>'
        }</div>
      </div>`,
    )
    .join('') + (hiddenStops > 0 ? `<div class="more-hint">+${hiddenStops} more stop — enlarge the card</div>` : '');
}

export async function fetchData(cfg, net) {
  if (!cfg.bus.stops.length) return { configured: true, stops: [] };
  const payload = await net
    .fetchJSON(`${WORKER_URL}/bus/stops?ids=${cfg.bus.stops.join(',')}`)
    .catch((err) => (String(err).includes('503') ? { error: 'bus_not_configured' } : Promise.reject(err)));
  return mapBus(payload, Math.floor(Date.now() / 1000));
}
