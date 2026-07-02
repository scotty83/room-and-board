import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { decodeGtfsRt } from '../site/js/gtfs.js';
import { mapSubway, feedsForLines, FEED_FOR_ROUTE } from '../site/js/widgets/subway.js';
import { mapLirr, trainNumFromTripId, ROUTE_NAMES } from '../site/js/widgets/lirr.js';

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

describe('mapLirr', () => {
  it('lists upcoming departures from the configured origin', async () => {
    const decoded = await decodedFixture('lirr.pb');
    const now = decoded.timestamp;
    // Find an origin stop present in the fixture with future departures.
    const counts = new Map();
    for (const t of decoded.trips)
      for (const s of t.stops)
        if (s.departure > now + 120) counts.set(s.stopId, (counts.get(s.stopId) ?? 0) + 1);
    const [orig] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

    const vm = mapLirr(decoded, null, { orig, dest: '' }, now, { [orig]: 'Origin' });
    expect(vm.departures.length).toBeGreaterThan(0);
    expect(vm.departures.length).toBeLessThanOrEqual(6);
    for (const d of vm.departures) {
      expect(d.min).toBeGreaterThanOrEqual(1);
      expect(typeof d.branch).toBe('string');
      expect(d.track).toBeNull(); // no enrichment provided
    }
    const mins = vm.departures.map((d) => d.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it('merges TrainTime track assignments by train number', async () => {
    const decoded = await decodedFixture('lirr.pb');
    const now = decoded.timestamp;
    const trip = decoded.trips.find(
      (t) => trainNumFromTripId(t.tripId) && t.stops.some((s) => s.departure > now + 300),
    );
    const stop = trip.stops.find((s) => s.departure > now + 300);
    const num = trainNumFromTripId(trip.tripId);
    const trackJson = [{ train_num: num, sched_track: '19', status: { held: false, canceled: false } }];

    const vm = mapLirr(decoded, trackJson, { orig: stop.stopId, dest: '' }, now, {});
    const dep = vm.departures.find((d) => d.trainNum === num);
    expect(dep.track).toBe('19');
  });

  it('applies destination filter when set', async () => {
    const decoded = await decodedFixture('lirr.pb');
    const now = decoded.timestamp;
    const trip = decoded.trips.find((t) => t.stops.filter((s) => s.departure > now + 300).length >= 2);
    const [origStop, ...rest] = trip.stops.filter((s) => s.departure > now + 300);
    const destStop = rest[rest.length - 1];
    const vm = mapLirr(decoded, null, { orig: origStop.stopId, dest: destStop.stopId }, now, {});
    expect(vm.departures.length).toBeGreaterThan(0);
    expect(vm.departures.every((d) => d.stopsAt.includes(destStop.stopId))).toBe(true);
  });

  it('names known branches', () => {
    expect(ROUTE_NAMES['9']).toBe('Port Washington');
    expect(ROUTE_NAMES['1']).toBe('Babylon');
  });
});
