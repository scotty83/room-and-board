// MTA Bus Time proxy (SIRI StopMonitoring). Requires a free developer key
// from https://bustime.mta.info/wiki/Developers/Index — set it with:
//   npx wrangler secret put MTA_BUS_KEY
// Bus stop codes are the 6-digit numbers printed on bus stop signs.

const BASE = 'https://bustime.mta.info/api/siri/stop-monitoring.json';

export function mapSiriStop(json, stopId) {
  const delivery = json?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
  const visits = delivery?.MonitoredStopVisit ?? [];
  const arrivals = [];
  let stopName = '';
  for (const visit of visits.slice(0, 4)) {
    const journey = visit?.MonitoredVehicleJourney;
    const call = journey?.MonitoredCall;
    if (!journey || !call) continue;
    stopName ||= String(call.StopPointName ?? '');
    const expected = call.ExpectedArrivalTime ?? call.ExpectedDepartureTime;
    arrivals.push({
      route: String(journey.PublishedLineName ?? '').trim(),
      dest: String(journey.DestinationName ?? '').trim(),
      time: expected ? Math.floor(Date.parse(expected) / 1000) : null,
      distance: String(call.Extensions?.Distances?.PresentableDistance ?? ''),
    });
  }
  return { id: stopId, name: stopName, arrivals };
}

export function parseLegs(param) {
  return (param || '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return { stopId: decodeURIComponent(pair.slice(0, i)), lineRef: decodeURIComponent(pair.slice(i + 1)) };
    })
    .filter((l) => l.stopId && l.lineRef)
    .slice(0, 2);
}

export function siriUrl(key, leg) {
  return `${BASE}?key=${encodeURIComponent(key)}&OperatorRef=MTA` +
    `&MonitoringRef=${encodeURIComponent(leg.stopId)}` +
    `&LineRef=${encodeURIComponent(leg.lineRef)}&MaximumStopVisits=4`;
}

export async function fetchBusStops(env, legs) {
  const stops = await Promise.all(
    legs.map(async (leg) => {
      const res = await fetch(siriUrl(env.MTA_BUS_KEY, leg));
      if (!res.ok) throw new Error(`bustime ${res.status}`);
      return mapSiriStop(await res.json(), leg.stopId);
    }),
  );
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, stops };
}
