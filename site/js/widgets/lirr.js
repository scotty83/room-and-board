// LIRR departures from the official MTA GTFS-Realtime feed (browser-direct),
// optionally enriched with track assignments from the unofficial TrainTime
// backend. TrainTime is enhancement-only: any failure leaves track = null.

import { decodeGtfsRt } from '../gtfs.js';
import { escapeHtml } from '../util.js';

export const meta = { id: 'lirr', title: 'LIRR', refreshMs: 60 * 1000 };

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

  const departures = [];
  for (const trip of decoded.trips) {
    const idx = trip.stops.findIndex((s) => s.stopId === cfgLirr.orig);
    if (idx === -1) continue;
    const t = trip.stops[idx].departure ?? trip.stops[idx].arrival;
    if (!t || t <= nowSec) continue;
    const onward = trip.stops.slice(idx + 1);
    if (onward.length === 0) continue; // origin is this trip's last stop
    const stopsAt = onward.map((s) => s.stopId);
    if (cfgLirr.dest && !stopsAt.includes(cfgLirr.dest)) continue;
    const destId = stopsAt[stopsAt.length - 1];
    const trainNum = trainNumFromTripId(trip.tripId);
    departures.push({
      t,
      min: Math.max(1, Math.round((t - nowSec) / 60)),
      dest: stationNames[destId] ?? destId,
      destId,
      stopsAt,
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
  const ttCode = await trainTimeCode(cfg.lirr.orig, net);
  if (ttCode) {
    try {
      trackJson = await net.fetchJSON(TRAINTIME_BASE + ttCode, {
        headers: { 'Accept-Version': '3.0' },
      });
    } catch {
      trackJson = null;
    }
  }
  const names = await stationNames(net);
  return mapLirr(decoded, trackJson, cfg.lirr, Math.floor(Date.now() / 1000), names);
}

let stationsCache = null;
async function loadStations(net) {
  if (!stationsCache) {
    try {
      stationsCache = await net.fetchJSON('data/stations-lirr.json');
    } catch {
      stationsCache = [];
    }
  }
  return stationsCache;
}

async function stationNames(net) {
  const list = await loadStations(net);
  return Object.fromEntries(list.map((s) => [s.id, s.name]));
}

// TrainTime uses 3-letter codes (stop_code in LIRR static GTFS); config
// stores GTFS stop ids, so translate when the station data provides one.
async function trainTimeCode(stopId, net) {
  const list = await loadStations(net);
  return list.find((s) => s.id === stopId)?.tt ?? null;
}
