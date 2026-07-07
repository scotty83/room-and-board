// MTA Bus arrivals for route-first legs (stop + lineRef pair), via the
// Worker's Bus Time proxy. Shows minutes when a prediction exists, otherwise
// Bus Time's distance ("approaching", "2 stops away").

import { WORKER_URL } from '../env.js';
import { escapeHtml } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'bus', title: 'Express Bus', refreshMs: 60 * 1000 };

export function mapBus(payload, nowSec, legs) {
  if (!payload || payload.error || !Array.isArray(payload.stops)) {
    return { configured: !payload || payload.error !== 'bus_not_configured', stops: [] };
  }
  const legsArr = legs ?? [];
  return {
    configured: true,
    stops: payload.stops.map((stop, i) => {
      const leg = legsArr[i];
      return {
        id: stop.id,
        route: leg?.route ?? '',
        name: leg?.stopName || stop.name,
        arrivals: (stop.arrivals ?? [])
          .filter((a) => a.time === null || a.time > nowSec)
          .slice(0, 3)
          .map((a) => ({ dest: a.dest, min: a.time ? Math.max(1, Math.round((a.time - nowSec) / 60)) : null, distance: a.distance })),
      };
    }),
  };
}

export function render(el, vm, _cfg) {
  if (!vm.configured) {
    el.innerHTML = '<div class="empty">Bus Time key not configured on the server</div>';
    return;
  }
  if (!vm.stops.length) {
    el.innerHTML = '<div class="empty">Add an express route in Settings → Express Bus</div>';
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
        <div class="stop-group__head"><span class="stop-group__name"><b class="buspill">${escapeHtml(stop.route)}</b> ${escapeHtml(stop.name || `Stop ${stop.id}`)}</span></div>
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
                      <span class="train__dest">${escapeHtml(a.dest)}</span>
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
  const legs = cfg.bus.legs ?? [];
  if (!legs.length) return { configured: true, stops: [] };
  // Each leg carries its agency-prefixed lineRef (stored at pick time).
  const param = legs.map((l) => `${encodeURIComponent(l.stopId)}:${encodeURIComponent(l.lineRef)}`).join(',');
  const payload = await net
    .fetchJSON(`${WORKER_URL}/bus/stops?legs=${param}`)
    .catch((err) => (String(err).includes('503') ? { error: 'bus_not_configured' } : Promise.reject(err)));
  return mapBus(payload, Math.floor(Date.now() / 1000), legs);
}
