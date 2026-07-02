// NYC Subway arrivals from the official MTA GTFS-Realtime feeds
// (browser-direct, keyless, CORS-open; GET only — HEAD returns 403).

import { decodeGtfsRt } from '../gtfs.js';
import { escapeHtml } from '../util.js';

export const meta = { id: 'subway', title: 'Subway', refreshMs: 60 * 1000 };

const DIR_LABEL = { N: 'Uptown', S: 'Downtown', '': '' };

export function render(el, vm, _cfg) {
  el.innerHTML = vm.groups
    .map((g) => {
      const rows = g.arrivals.length
        ? g.arrivals
            .map(
              (a) => `<div class="arrival">
                <span class="bullet bullet--${escapeHtml(a.route)}">${escapeHtml(a.route)}</span>
                <span class="arrival__min">${a.min}</span><span class="arrival__unit">min</span>
              </div>`,
            )
            .join('')
        : '<div class="empty">No arrivals</div>';
      return `<div class="stop-group">
        <div class="stop-group__head">
          <span class="stop-group__name">${escapeHtml(g.stopName)}</span>
          <span class="stop-group__dir">${DIR_LABEL[g.direction] ?? ''}</span>
        </div>
        <div class="stop-group__arrivals">${rows}</div>
      </div>`;
    })
    .join('');
}

const FEED_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';

export const FEED_FOR_ROUTE = {
  1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', S: '', GS: '',
  A: '-ace', C: '-ace', E: '-ace', H: '-ace', FS: '-ace', SF: '-ace', SR: '-ace',
  B: '-bdfm', D: '-bdfm', F: '-bdfm', M: '-bdfm',
  G: '-g',
  J: '-jz', Z: '-jz',
  N: '-nqrw', Q: '-nqrw', R: '-nqrw', W: '-nqrw',
  L: '-l',
  SI: '-si',
};

export function feedsForLines(lines) {
  const suffixes = [];
  for (const line of lines) {
    const suffix = FEED_FOR_ROUTE[line];
    if (suffix !== undefined && !suffixes.includes(suffix)) suffixes.push(suffix);
  }
  return suffixes;
}

// decodedFeeds: array of decodeGtfsRt() results. cfgSubway: {stops, lines}.
// stationNames: stopId (with N/S suffix or parent) -> display name.
export function mapSubway(decodedFeeds, cfgSubway, nowSec, stationNames = {}) {
  const groups = cfgSubway.stops.map((stopId) => ({
    stopId,
    stopName: stationNames[stopId] ?? stationNames[stopId.replace(/[NS]$/, '')] ?? stopId,
    direction: /[NS]$/.test(stopId) ? stopId.slice(-1) : '',
    arrivals: [],
  }));
  const byStop = new Map(groups.map((g) => [g.stopId, g]));
  const lineFilter = cfgSubway.lines.length ? new Set(cfgSubway.lines) : null;

  for (const feed of decodedFeeds) {
    for (const trip of feed.trips) {
      if (lineFilter && !lineFilter.has(trip.routeId)) continue;
      for (const stop of trip.stops) {
        const group = byStop.get(stop.stopId);
        if (!group) continue;
        const t = stop.departure ?? stop.arrival;
        if (!t || t <= nowSec) continue;
        group.arrivals.push({
          route: trip.routeId,
          min: Math.max(1, Math.round((t - nowSec) / 60)),
          t,
        });
      }
    }
  }
  for (const g of groups) {
    g.arrivals.sort((a, b) => a.t - b.t);
    g.arrivals = g.arrivals.slice(0, 4);
  }
  return { groups };
}

export async function fetchData(cfg, net) {
  const suffixes = feedsForLines(cfg.subway.lines);
  const feeds = suffixes.length ? suffixes : [''];
  const decoded = await Promise.all(
    feeds.map(async (s) => decodeGtfsRt(await net.fetchBuffer(FEED_BASE + s))),
  );
  const names = await stationNamesPromise(net);
  const nowSec = Math.floor(Date.now() / 1000);
  return mapSubway(decoded, cfg.subway, nowSec, names);
}

let stationNamesCache = null;
async function stationNamesPromise(net) {
  if (!stationNamesCache) {
    try {
      const list = await net.fetchJSON('data/stations-subway.json');
      stationNamesCache = Object.fromEntries(list.map((s) => [s.id, s.name]));
    } catch {
      stationNamesCache = {};
    }
  }
  return stationNamesCache;
}
