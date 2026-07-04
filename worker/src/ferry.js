// NYC Ferry GTFS-Realtime trip updates -> JSON digest. The feed is tiny
// (~2.4 KB) but ships as protobuf without CORS, so the Worker decodes it
// with the same minimal decoder the boards use for LIRR/MNR and serves
// plain JSON like every other route. Trip descriptors carry no route_id;
// boards join tripId -> route/headsign from the bundled static data.

import { decodeGtfsRt } from '../../site/js/gtfs.js';

const FEED = 'https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate';

export function mapFerryFeed(decoded, nowSec) {
  const trips = [];
  for (const trip of decoded.trips) {
    const stops = trip.stops
      .map((s) => ({ stopId: s.stopId, t: s.departure ?? s.arrival }))
      .filter((s) => s.stopId && s.t);
    if (stops.length) trips.push({ tripId: trip.tripId, stops });
  }
  return { updatedAt: decoded.timestamp ?? nowSec, stale: false, trips };
}

export async function fetchFerryDepartures() {
  const res = await fetch(FEED);
  if (!res.ok) throw new Error(`nycferry ${res.status}`);
  const decoded = decodeGtfsRt(await res.arrayBuffer());
  return mapFerryFeed(decoded, Math.floor(Date.now() / 1000));
}
