import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { decodeGtfsRt } from '../site/js/gtfs.js';
import { mapSubway, feedsForLines, linesForStops, FEED_FOR_ROUTE } from '../site/js/widgets/subway.js';
import { mapLirr, trainNumFromTripId, ROUTE_NAMES, PENN_STOP_ID } from '../site/js/widgets/lirr.js';

async function decodedFixture(name) {
  return decodeGtfsRt(new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url))));
}
const jsonFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('feedsForLines', () => {
  it('maps routes to distinct feed suffixes', () => {
    expect(feedsForLines(['4', '5', '6'])).toEqual(['']);
    expect(feedsForLines(['A', 'C', 'L'])).toEqual(['-ace', '-l']);
    expect(feedsForLines(['N', 'Q', 'B'])).toEqual(['-nqrw', '-bdfm']);
    expect(feedsForLines(['X'])).toEqual([]); // unknown route dropped
  });
  it('covers every route in the map', () => {
    expect(FEED_FOR_ROUTE['1']).toBe('');
    expect(FEED_FOR_ROUTE['J']).toBe('-jz');
    expect(FEED_FOR_ROUTE['SI']).toBe('-si');
  });
});

describe('mapSubway', () => {
  it('extracts sorted future arrivals for configured stops from the fixture', async () => {
    const decoded = await decodedFixture('subway.pb');
    // Discover a stop that exists in the fixture so the test survives refreshes.
    const now = decoded.timestamp;
    const counts = new Map();
    for (const t of decoded.trips)
      for (const s of t.stops)
        if ((s.departure ?? s.arrival) > now + 120)
          counts.set(s.stopId, (counts.get(s.stopId) ?? 0) + 1);
    const [stopId, expected] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    const vm = mapSubway([decoded], { stops: [stopId], lines: [] }, now, { [stopId]: 'Test St' });
    expect(vm.groups).toHaveLength(1);
    const g = vm.groups[0];
    expect(g.stopId).toBe(stopId);
    expect(g.stopName).toBe('Test St');
    expect(g.direction).toMatch(/^[NS]$/);
    expect(g.arrivals.length).toBe(Math.min(expected, 4));
    const mins = g.arrivals.map((a) => a.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(mins.every((m) => m >= 1)).toBe(true);
    expect(g.arrivals.every((a) => typeof a.route === 'string' && a.route.length > 0)).toBe(true);
  });

  it('excludes past arrivals and returns empty groups for unknown stops', async () => {
    const decoded = await decodedFixture('subway.pb');
    const vm = mapSubway([decoded], { stops: ['ZZZN'], lines: [] }, decoded.timestamp, {});
    expect(vm.groups).toHaveLength(1);
    expect(vm.groups[0].arrivals).toEqual([]);
  });
});

describe('trainNumFromTripId', () => {
  it('extracts the train number component', () => {
    expect(trainNumFromTripId('GO201_26_704')).toBe('704');
    expect(trainNumFromTripId('GO201_26_400_2931_METS')).toBe('400');
    expect(trainNumFromTripId('junk')).toBe(null);
  });
});

describe('mapLirr (Penn Station departure board)', () => {
  const now = 1000;
  const synthetic = {
    timestamp: now,
    trips: [
      // Penn departure, Port Washington branch
      {
        tripId: 'GO201_26_100',
        routeId: '9',
        stops: [
          { stopId: PENN_STOP_ID, arrival: null, departure: now + 300 },
          { stopId: '171', arrival: now + 2000, departure: now + 2000 },
        ],
      },
      // Grand Central train on the same branch — must never appear
      {
        tripId: 'GO201_26_200',
        routeId: '9',
        stops: [
          { stopId: '349', arrival: null, departure: now + 300 },
          { stopId: '171', arrival: now + 2000, departure: now + 2000 },
        ],
      },
      // Penn departure, Babylon branch
      {
        tripId: 'GO201_26_300',
        routeId: '1',
        stops: [
          { stopId: PENN_STOP_ID, arrival: null, departure: now + 600 },
          { stopId: '27', arrival: now + 3000, departure: now + 3000 },
        ],
      },
    ],
  };

  it('shows only trains departing Penn Station', () => {
    const vm = mapLirr(synthetic, null, { dest: '' }, now, { 171: 'Port Washington', 27: 'Babylon' });
    expect(vm.departures.map((d) => d.trainNum)).toEqual(['100', '300']);
    expect(vm.departures[0].dest).toBe('Port Washington');
    expect(vm.departures[0].branch).toBe('Port Washington');
  });

  it('filters to trains stopping at the chosen destination, any branch', () => {
    const vm = mapLirr(synthetic, null, { dest: '171' }, now, {});
    expect(vm.departures.map((d) => d.trainNum)).toEqual(['100']);
    expect(mapLirr(synthetic, null, { dest: '27' }, now, {}).departures.map((d) => d.trainNum)).toEqual(['300']);
    expect(mapLirr(synthetic, null, { dest: '999' }, now, {}).departures).toHaveLength(0);
  });

  it('merges TrainTime track assignments by train number', () => {
    const trackJson = [{ train_num: '100', sched_track: '19', status: { held: false, canceled: false } }];
    const vm = mapLirr(synthetic, trackJson, { dest: '' }, now, {});
    expect(vm.departures.find((d) => d.trainNum === '100').track).toBe('19');
    expect(vm.departures.find((d) => d.trainNum === '300').track).toBeNull();
  });

  it('never lists a fixture trip that skips Penn', async () => {
    const decoded = await decodedFixture('lirr.pb');
    const vm = mapLirr(decoded, null, { dest: '' }, decoded.timestamp, {});
    const byNum = new Map(decoded.trips.map((t) => [trainNumFromTripId(t.tripId), t]));
    for (const d of vm.departures) {
      const trip = byNum.get(d.trainNum);
      expect(trip.stops.some((s) => s.stopId === PENN_STOP_ID)).toBe(true);
    }
    const mins = vm.departures.map((d) => d.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it('names known branches', () => {
    expect(ROUTE_NAMES['9']).toBe('Port Washington');
    expect(ROUTE_NAMES['1']).toBe('Babylon');
  });
});

describe('linesForStops', () => {
  const stations = [
    { id: '631', name: 'Grand Central-42 St', borough: 'Manhattan', lines: ['4', '5', '6'] },
    { id: 'R16', name: 'Times Sq-42 St', borough: 'Manhattan', lines: ['N', 'Q', 'R', 'W'] },
  ];
  it('unions the lines of the chosen stops (direction suffix stripped)', () => {
    expect(linesForStops(stations, ['631N', 'R16S'])).toEqual(['4', '5', '6', 'N', 'Q', 'R', 'W']);
    expect(linesForStops(stations, ['631S'])).toEqual(['4', '5', '6']);
    expect(linesForStops(stations, ['ZZZN'])).toEqual([]);
  });
});
