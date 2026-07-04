// NYC Ferry departure board for one landing, from the Worker's GTFS-RT
// digest joined against bundled static data (data/ferry.json). The realtime
// feed has no route ids, so trip identity comes from the static trips map;
// when that map is stale (schedule change), destination falls back to the
// trip's final stop name and the route chip is omitted — labels degrade,
// correctness doesn't.

import { escapeHtml, fmtTime, setCardNote } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'ferry', title: 'NYC Ferry', refreshMs: 60 * 1000 };

export function mapFerry(digest, data, landing, nowSec) {
  const stopName = (id) => data?.stops?.find((s) => s.id === id)?.name ?? '';
  const departures = [];
  for (const trip of digest?.trips ?? []) {
    const idx = trip.stops.findIndex((s) => s.stopId === landing);
    if (idx === -1) continue;
    const t = trip.stops[idx].t;
    if (!t || t <= nowSec) continue;
    const onward = trip.stops.slice(idx + 1);
    if (!onward.length) continue; // terminating here: an arrival, not a departure
    const known = data?.trips?.[trip.tripId];
    const route = known ? data?.routes?.[known[0]] : null;
    departures.push({
      min: Math.max(1, Math.round((t - nowSec) / 60)),
      t,
      dest: known?.[1] || stopName(onward[onward.length - 1].stopId) || 'Ferry',
      route: route ? { name: route.name, color: route.color } : null,
    });
  }
  departures.sort((a, b) => a.t - b.t);
  return { landing, landingName: stopName(landing), departures: departures.slice(0, 12) };
}

export function render(el, vm, _cfg) {
  setCardNote(el, vm.landingName || null);
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('ferry', w, h) ?? 4;
  const shown = (vm.departures ?? []).slice(0, cap);
  el.innerHTML = '<div class="trains">' + (shown.length
    ? shown
        .map((d) => {
          const chip = d.route && /^[0-9A-Fa-f]{6}$/.test(d.route.color)
            ? `<i class="ferryroute" style="background:#${d.route.color}"></i>`
            : '';
          return `<div class="train">
            <div class="train__min"><span>${d.min}</span><small>min</small></div>
            <div class="train__info">
              <span class="train__dest">${chip}${escapeHtml(d.dest)}</span>
              <span class="train__line">${d.route ? `${escapeHtml(d.route.name)} · ` : ''}${fmtTime(d.t)}</span>
            </div>
          </div>`;
        })
        .join('')
    : '<div class="empty">No departures</div>') + '</div>';
}

let dataCache = null;
async function ferryData(net) {
  if (!dataCache) {
    try {
      dataCache = await net.fetchJSON('data/ferry.json');
    } catch {
      dataCache = null;
    }
  }
  return dataCache;
}

export async function fetchData(cfg, net) {
  const [digest, data] = await Promise.all([
    net.fetchJSON(`${WORKER_URL}/ferry/departures`),
    ferryData(net),
  ]);
  return mapFerry(digest, data, cfg.ferry.landing, Math.floor(Date.now() / 1000));
}
