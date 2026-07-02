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

export async function fetchBusStops(env, stopIds) {
  const stops = await Promise.all(
    stopIds.map(async (stopId) => {
      const url = `${BASE}?key=${encodeURIComponent(env.MTA_BUS_KEY)}&OperatorRef=MTA&MonitoringRef=${encodeURIComponent(stopId)}&MaximumStopVisits=4`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`bustime ${res.status}`);
      return mapSiriStop(await res.json(), stopId);
    }),
  );
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, stops };
}
