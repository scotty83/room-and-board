// Metro-North Grand Central departure board from the official MTA GTFS-RT
// feed (browser-direct, keyless). Mirrors the LIRR Penn board: origin pinned
// to Grand Central, optional destination filter, branch shown per train.

import { decodeGtfsRt } from '../gtfs.js';
import { escapeHtml, fmtTime } from '../util.js';
import { WORKER_URL } from '../env.js';
import { renderAlertRows } from '../transit-alerts.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'mnr', title: 'Metro-North · Grand Central', refreshMs: 60 * 1000 };

export const GCT_STOP_ID = '1'; // MNR static GTFS stop id for Grand Central

// MNR static GTFS route_id -> line name.
export const ROUTE_NAMES = {
  1: 'Hudson',
  2: 'Harlem',
  3: 'New Haven',
  4: 'New Canaan',
  5: 'Danbury',
  6: 'Waterbury',
  7: 'Port Jervis',
  8: 'Pascack Valley',
};

export function mapMnr(decoded, cfgMnr, nowSec, stationNames = {}) {
  const departures = [];
  for (const trip of decoded.trips) {
    const idx = trip.stops.findIndex((s) => s.stopId === GCT_STOP_ID);
    if (idx === -1) continue;
    const t = trip.stops[idx].departure ?? trip.stops[idx].arrival;
    if (!t || t <= nowSec) continue;
    const onward = trip.stops.slice(idx + 1);
    if (onward.length === 0) continue; // terminating at GCT, not departing
    if (cfgMnr.dest && !onward.some((s) => s.stopId === cfgMnr.dest)) continue;
    const destId = onward[onward.length - 1].stopId;
    departures.push({
      t,
      min: Math.max(1, Math.round((t - nowSec) / 60)),
      dest: stationNames[destId] ?? destId,
      destId,
      branch: ROUTE_NAMES[trip.routeId] ?? '',
      track: null, // MNR GTFS-RT carries no track assignments we decode
    });
  }
  departures.sort((a, b) => a.t - b.t);
  return { departures: departures.slice(0, 12) };
}

export function render(el, vm, _cfg) {
  el.classList.toggle('has-alerts', Boolean(vm.alerts?.length));
  const [w, h] = cardSize(el, [4, 4]);
  // Each alert banner costs roughly one train row of space.
  const cap = Math.max(1, itemCapacity('mnr', w, h) - (vm.alerts?.length ?? 0));
  const shown = vm.departures.slice(0, cap);
  el.innerHTML =
    renderAlertRows(vm.alerts?.map((a) => ({ ...a, routes: [] })) ?? []) +
    '<div class="trains">' +
    (shown.length
      ? vm.departures
          .map(
            (d) => `<div class="train">
              <div class="train__min"><span>${d.min}</span><small>min</small></div>
              <div class="train__info">
                <span class="train__dest">${escapeHtml(d.dest)}</span>
                <span class="train__line">${escapeHtml(d.branch)} · ${fmtTime(d.t)}</span>
              </div>
            </div>`,
          )
          .join('')
      : '<div class="empty">No departures</div>') +
    '</div>';
}

const FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr';

export async function fetchData(cfg, net) {
  const decoded = decodeGtfsRt(await net.fetchBuffer(FEED_URL));
  const names = await stationNames(net);
  const vm = mapMnr(decoded, cfg.mnr, Math.floor(Date.now() / 1000), names);
  if (cfg.mnr.alerts) {
    try {
      const digest = await net.fetchJSON(`${WORKER_URL}/alerts/mnr`);
      vm.alerts = (digest.alerts ?? []).slice(0, 2);
    } catch {
      vm.alerts = [];
    }
  }
  return vm;
}

let stationsCache = null;
async function stationNames(net) {
  if (!stationsCache) {
    try {
      stationsCache = await net.fetchJSON('data/stations-mnr.json');
    } catch {
      stationsCache = [];
    }
  }
  return Object.fromEntries(stationsCache.map((s) => [s.id, s.name]));
}
