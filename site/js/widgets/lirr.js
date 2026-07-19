// LIRR departure board from the official MTA GTFS-Realtime feed
// (browser-direct), optionally enriched with track assignments from the
// unofficial TrainTime backend (enhancement-only: failures leave track null).
// cfg.lirr.origin picks the terminal — Penn Station, Grand Central Madison, or
// both (rows carry an origin tag when both). cfg.lirr.dest is REQUIRED: the
// card prompts for a station until one is picked (no all-trains mode).

import { decodeGtfsRt } from '../gtfs.js';
import { escapeHtml, fmtTime, setCardNote } from '../util.js';
import { WORKER_URL } from '../env.js';
import { renderAlertRows } from '../transit-alerts.js';
import { itemCapacity, cardSize } from '../capacity.js';

// Title is just "LIRR" — terminal context lives in settings copy and the
// short title leaves the corner note room to breathe.
export const meta = { id: 'lirr', title: 'LIRR', refreshMs: 60 * 1000 };

// Terminals: LIRR static GTFS stop id + TrainTime station code + row tag.
export const ORIGINS = Object.freeze({
  penn: Object.freeze({ stopId: '237', tt: 'NYK', label: 'Penn' }),
  gct: Object.freeze({ stopId: '349', tt: 'GCT', label: 'GCT' }),
});
export const PENN_STOP_ID = ORIGINS.penn.stopId;
export const activeOrigins = (origin) => (origin === 'both' ? ['penn', 'gct'] : [origin === 'gct' ? 'gct' : 'penn']);

export function render(el, vm, cfg) {
  if (vm.needsStation) {
    setCardNote(el, null);
    el.classList.remove('has-alerts');
    el.innerHTML = '<div class="empty">Pick a station in Settings → LIRR</div>';
    return;
  }
  setCardNote(el, vm.destName ? `stops at ${vm.destName}` : null);
  el.classList.toggle('has-alerts', Boolean(vm.alerts?.length));
  const [w, h] = cardSize(el, [4, 4]);
  // Each alert banner costs roughly one train row of space.
  const cap = Math.max(1, itemCapacity('lirr', w, h) - (vm.alerts?.length ?? 0));
  const shown = vm.departures.slice(0, cap);
  // Rows disambiguate their terminal only when both are on the board.
  const tagged = cfg?.lirr?.origin === 'both';
  el.innerHTML = renderAlertRows(vm.alerts?.map((a) => ({ ...a, routes: [] })) ?? []) + '<div class="trains">' + (shown.length
    ? shown
        .map(
          (d) => `<div class="train">
            <div class="train__min"><span>${d.min}</span><small>min</small></div>
            <div class="train__info">
              <span class="train__dest">${escapeHtml(d.dest)}</span>
              <span class="train__line">${tagged && d.origin ? `${escapeHtml(ORIGINS[d.origin]?.label ?? '')} · ` : ''}${escapeHtml(d.branch)} · ${fmtTime(d.t)}</span>
            </div>
            ${d.track ? `<span class="train__track">Track ${escapeHtml(d.track)}</span>` : ''}
          </div>`,
        )
        .join('')
    : '<div class="empty">No departures</div>') + '</div>';
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
      // v3 arrivals carry `track` (actual, once assigned) over `sched_track`;
      // act_track was the pre-v3 name, kept as a fallback.
      const track = arr?.track ?? arr?.act_track ?? arr?.sched_track;
      if (num && track) tracks.set(String(num), String(track));
    }
  }
  const origins = activeOrigins(cfgLirr.origin);
  const departures = [];
  for (const trip of decoded.trips) {
    // A trip departs from at most one terminal (no LIRR run serves both Penn
    // and Grand Central), so the first active origin found wins.
    let origin = null;
    let idx = -1;
    for (const key of origins) {
      idx = trip.stops.findIndex((s) => s.stopId === ORIGINS[key].stopId);
      if (idx !== -1) { origin = key; break; }
    }
    if (idx === -1) continue; // departs from a terminal we're not showing
    const t = trip.stops[idx].departure ?? trip.stops[idx].arrival;
    if (!t || t <= nowSec) continue;
    const onward = trip.stops.slice(idx + 1);
    if (onward.length === 0) continue; // terminating here, not departing
    // Destination filter: any train that STOPS at the chosen station counts,
    // whatever branch it runs on — lines stay dynamic per departure row.
    if (cfgLirr.dest && !onward.some((s) => s.stopId === cfgLirr.dest)) continue;
    const destId = onward[onward.length - 1].stopId;
    const trainNum = trainNumFromTripId(trip.tripId);
    departures.push({
      t,
      min: Math.max(1, Math.round((t - nowSec) / 60)),
      dest: stationNames[destId] ?? destId,
      destId,
      origin,
      branch: ROUTE_NAMES[trip.routeId] ?? '',
      trainNum,
      track: (trainNum && tracks.get(trainNum)) || null,
    });
  }
  departures.sort((a, b) => a.t - b.t);
  return { departures: departures.slice(0, 12) };
}

export async function fetchData(cfg, net) {
  // No station picked yet: skip every fetch and let the card prompt.
  if (!cfg.lirr.dest) return { departures: [], needsStation: true };
  const decoded = decodeGtfsRt(await net.fetchBuffer(FEED_URL));
  // Track assignments come per-terminal from TrainTime; fetch one list per
  // active origin and merge (the maps key on train_num, which is unique).
  const trackLists = await Promise.all(
    activeOrigins(cfg.lirr.origin).map((key) =>
      net.fetchJSON(TRAINTIME_BASE + ORIGINS[key].tt, { headers: { 'Accept-Version': '3.0' } }).catch(() => null),
    ),
  );
  // v3 wraps the list ({arrivals: [...]}); older shapes were a bare array.
  // (The shipped array-only check meant tracks silently never enriched.)
  const trackJson = trackLists.flatMap((r) => (Array.isArray(r) ? r : Array.isArray(r?.arrivals) ? r.arrivals : []));
  const names = await stationNames(net);
  const nowSec = Math.floor(Date.now() / 1000);
  const vm = mapLirr(decoded, trackJson.length ? trackJson : null, cfg.lirr, nowSec, names);
  vm.destName = (cfg.lirr.dest && names[cfg.lirr.dest]) || null;
  // A 200 response can still carry a wedged feed (2026-07-18: the LIRR origin
  // served a 19h-old snapshot all day — every departure in the past, board
  // blank but looking fresh). Surface it through the standard stale idiom.
  if (decoded.timestamp && nowSec - decoded.timestamp > 15 * 60) {
    vm.stale = true;
    vm.updatedAt = decoded.timestamp;
  }
  if (cfg.lirr.alerts) {
    try {
      const digest = await net.fetchJSON(`${WORKER_URL}/alerts/lirr`);
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
      stationsCache = await net.fetchJSON('data/stations-lirr.json');
    } catch {
      return {}; // leave the cache unset so the next 60 s refresh retries
    }
  }
  return Object.fromEntries(stationsCache.map((s) => [s.id, s.name]));
}
