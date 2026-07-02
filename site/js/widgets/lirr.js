// LIRR Penn Station departure board from the official MTA GTFS-Realtime feed
// (browser-direct), optionally enriched with track assignments from the
// unofficial TrainTime backend (enhancement-only: failures leave track null).
// The origin is pinned to Penn — Grand Central Madison trains never appear —
// and cfg.lirr.branches filters by branch (empty = all).

import { decodeGtfsRt } from '../gtfs.js';
import { escapeHtml } from '../util.js';

export const meta = { id: 'lirr', title: 'LIRR · Penn Station', refreshMs: 60 * 1000 };

export const PENN_STOP_ID = '237'; // LIRR static GTFS stop id for Penn Station
const PENN_TT_CODE = 'NYK'; // TrainTime station code for Penn

export function render(el, vm, _cfg) {
  el.innerHTML = vm.departures.length
    ? vm.departures
        .map(
          (d) => `<div class="train">
            <div class="train__min"><span>${d.min}</span><small>min</small></div>
            <div class="train__info">
              <span class="train__dest">${escapeHtml(d.dest)}</span>
              <span class="train__line">${escapeHtml(d.branch)}</span>
            </div>
            ${d.track ? `<span class="train__track">Track ${escapeHtml(d.track)}</span>` : ''}
          </div>`,
        )
        .join('')
    : '<div class="empty">No departures</div>';
}

const FEED_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr';
const TRAINTIME_BASE = 'https://backend-unified.mylirr.org/arrivals/';

// LIRR static GTFS route_id -> branch name.
export const ROUTE_NAMES = {
  1: 'Babylon',
  2: 'Hempstead',
  3: 'Oyster Bay',
  4: 'Ronkonkoma',
  5: 'Montauk',
  6: 'Long Beach',
  7: 'Far Rockaway',
  8: 'West Hempstead',
  9: 'Port Washington',
  10: 'Port Jefferson',
  11: 'Belmont Park',
  12: 'City Terminal',
};

// LIRR GTFS-RT trip ids look like "GO201_26_704" or "GO201_26_400_2931_METS";
// the third component is the train number TrainTime keys on.
export function trainNumFromTripId(tripId) {
  const parts = tripId.split('_');
  return parts.length >= 3 && parts[2] ? parts[2] : null;
}

export function mapLirr(decoded, trackJson, cfgLirr, nowSec, stationNames = {}) {
  const tracks = new Map();
  if (Array.isArray(trackJson)) {
    for (const arr of trackJson) {
      const num = arr?.train_num;
      const track = arr?.act_track ?? arr?.sched_track;
      if (num && track) tracks.set(String(num), String(track));
    }
  }
  const branchFilter = cfgLirr.branches?.length ? new Set(cfgLirr.branches) : null;

  const departures = [];
  for (const trip of decoded.trips) {
    if (branchFilter && !branchFilter.has(trip.routeId)) continue;
    const idx = trip.stops.findIndex((s) => s.stopId === PENN_STOP_ID);
    if (idx === -1) continue; // Grand Central (or non-Penn) run
    const t = trip.stops[idx].departure ?? trip.stops[idx].arrival;
    if (!t || t <= nowSec) continue;
    const onward = trip.stops.slice(idx + 1);
    if (onward.length === 0) continue; // terminating at Penn, not departing
    const destId = onward[onward.length - 1].stopId;
    const trainNum = trainNumFromTripId(trip.tripId);
    departures.push({
      t,
      min: Math.max(1, Math.round((t - nowSec) / 60)),
      dest: stationNames[destId] ?? destId,
      destId,
      branch: ROUTE_NAMES[trip.routeId] ?? '',
      trainNum,
      track: (trainNum && tracks.get(trainNum)) || null,
    });
  }
  departures.sort((a, b) => a.t - b.t);
  return { departures: departures.slice(0, 6) };
}

export async function fetchData(cfg, net) {
  const decoded = decodeGtfsRt(await net.fetchBuffer(FEED_URL));
  let trackJson = null;
  try {
    trackJson = await net.fetchJSON(TRAINTIME_BASE + PENN_TT_CODE, {
      headers: { 'Accept-Version': '3.0' },
    });
  } catch {
    trackJson = null;
  }
  const names = await stationNames(net);
  return mapLirr(decoded, trackJson, cfg.lirr, Math.floor(Date.now() / 1000), names);
}

let stationsCache = null;
async function stationNames(net) {
  if (!stationsCache) {
    try {
      stationsCache = await net.fetchJSON('data/stations-lirr.json');
    } catch {
      stationsCache = [];
    }
  }
  return Object.fromEntries(stationsCache.map((s) => [s.id, s.name]));
}
