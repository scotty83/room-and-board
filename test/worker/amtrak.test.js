import { describe, it, expect } from 'vitest';
import { mapAmtrak } from '../../worker/src/amtrak.js';
import trains from './fixtures/amtrak-trains.json';

// Fixed instant for the captured fixture: 2026-07-14 11:05 ET. At this moment
// trains 233 (11:20), 2154 (11:27) and 171 (12:24) still depart NYP; 172 (11:00)
// and 43 (10:52) have passed, 2151 is status "Departed", and 802 terminates at NYP.
const NOW = Date.parse('2026-07-14T11:05:00-04:00');
const NOW_SEC = Math.floor(NOW / 1000);

describe('mapAmtrak', () => {
  const vm = mapAmtrak(trains, NOW);

  it('keeps only future NYP departures, sorted, station NYP', () => {
    expect(vm.station).toBe('NYP');
    expect(vm.departures.map((d) => d.num)).toEqual(['233', '2154', '171']);
    const ts = vm.departures.map((d) => d.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(vm.departures.every((d) => d.t >= NOW_SEC)).toBe(true);
  });

  it('excludes already-departed (2151) and NYP-terminating (802) trains', () => {
    const nums = vm.departures.map((d) => d.num);
    expect(nums).not.toContain('2151'); // status "Departed"
    expect(nums).not.toContain('802'); // terminates at NYP (no onward stops)
    expect(nums).not.toContain('172'); // dep 11:00 < NOW
  });

  it('maps terminus, route and train number', () => {
    const first = vm.departures[0];
    expect(first.dest).toContain('Albany');
    expect(first.route).toBe('Empire Service');
    expect(first.num).toBe('233');
  });

  it('carries downstream stops with arrival epochs, NYP excluded', () => {
    const d = vm.departures.find((x) => x.num === '171'); // Roanoke, long route
    expect(Array.isArray(d.stops)).toBe(true);
    expect(d.stops.length).toBeGreaterThan(3);
    expect(d.stops.every(([c, a]) => typeof c === 'string' && Number.isFinite(a))).toBe(true);
    expect(d.stops.some(([c]) => c === 'NYP')).toBe(false);
    expect(d.stops.some(([c]) => c === 'PHL')).toBe(true); // 171 serves Philadelphia downstream
  });

  it('dedupes per-train alert messages into {header}', () => {
    const msg = 'Northeast Regional trains are operating with reduced frequency this weekend.';
    const feed = {
      A: [{ routeName: 'Northeast Regional', trainNum: 190, destName: 'Boston', destCode: 'BOS',
            alerts: [{ message: msg }],
            stations: [
              { code: 'NYP', schDep: '2026-07-14T12:00:00-04:00', dep: '2026-07-14T12:00:00-04:00', status: 'Station' },
              { code: 'BOS', schArr: '2026-07-14T16:00:00-04:00', arr: '2026-07-14T16:00:00-04:00' },
            ] }],
      B: [{ routeName: 'Northeast Regional', trainNum: 88, destName: 'Boston', destCode: 'BOS',
            alerts: [{ message: msg }], // same text — must dedupe to one row
            stations: [
              { code: 'NYP', schDep: '2026-07-14T12:30:00-04:00', dep: '2026-07-14T12:30:00-04:00', status: 'Station' },
              { code: 'BOS', schArr: '2026-07-14T16:30:00-04:00', arr: '2026-07-14T16:30:00-04:00' },
            ] }],
    };
    const vm2 = mapAmtrak(feed, NOW);
    expect(vm2.alerts).toEqual([{ header: msg }]);
  });

  it('tolerates an empty or malformed feed', () => {
    expect(mapAmtrak({}, NOW).departures).toEqual([]);
    expect(mapAmtrak(null, NOW).departures).toEqual([]);
  });
});
