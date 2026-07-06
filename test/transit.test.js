import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { decodeGtfsRt } from '../site/js/gtfs.js';
import { mapSubwayStatus, SUBWAY_LINES } from '../site/js/widgets/subway.js';
import { mapLirr, trainNumFromTripId, ROUTE_NAMES, PENN_STOP_ID } from '../site/js/widgets/lirr.js';
import { mapMnr, GCT_STOP_ID, ROUTE_NAMES as MNR_ROUTES } from '../site/js/widgets/mnr.js';
import { mapPath, PATH_STATIONS } from '../site/js/widgets/path.js';
import { mapFerry } from '../site/js/widgets/ferry.js';

async function decodedFixture(name) {
  return decodeGtfsRt(new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url))));
}
const jsonFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('mapSubwayStatus', () => {
  const alerts = [
    { routes: ['A', 'C'], header: 'Delays on A and C.' },
    { routes: ['4'], header: 'Signal problem at 14 St.' },
    { routes: ['4'], header: 'Second 4-train alert.' },
    { routes: ['4'], header: 'Third alert never shown.' },
  ];
  it('returns one row per selected line with ok/alert status', () => {
    const rows = mapSubwayStatus(alerts, ['1', '4', 'C']);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ line: '1', ok: true, headers: [] });
    expect(rows[1].ok).toBe(false);
    expect(rows[1].headers).toEqual(['Signal problem at 14 St.', 'Second 4-train alert.']); // capped at 2
    expect(rows[2]).toMatchObject({ line: 'C', ok: false });
  });
  it('handles empty selections and missing alerts', () => {
    expect(mapSubwayStatus(alerts, [])).toEqual([]);
    expect(mapSubwayStatus(undefined, ['7'])).toEqual([{ line: '7', ok: true, headers: [] }]);
  });
  it('exposes the pickable line list', () => {
    expect(SUBWAY_LINES).toContain('SI');
    expect(SUBWAY_LINES.length).toBeGreaterThan(20);
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

describe('mapMnr (Grand Central departure board)', () => {
  const now = 1000;
  const synthetic = {
    timestamp: now,
    trips: [
      { tripId: 'x1', routeId: '2', stops: [
        { stopId: GCT_STOP_ID, arrival: null, departure: now + 300 },
        { stopId: '54', arrival: now + 4000, departure: now + 4000 },
      ]},
      // inbound: GCT is the last stop -> not a departure
      { tripId: 'x2', routeId: '1', stops: [
        { stopId: '33', arrival: null, departure: now + 200 },
        { stopId: GCT_STOP_ID, arrival: now + 3000, departure: null },
      ]},
    ],
  };
  it('lists outbound GCT trains with line names', () => {
    const vm = mapMnr(synthetic, { dest: '' }, now, { 54: 'Southeast' });
    expect(vm.departures).toHaveLength(1);
    expect(vm.departures[0]).toMatchObject({ dest: 'Southeast', branch: 'Harlem', min: 5 });
  });
  it('applies the destination filter', () => {
    expect(mapMnr(synthetic, { dest: '54' }, now, {}).departures).toHaveLength(1);
    expect(mapMnr(synthetic, { dest: '99' }, now, {}).departures).toHaveLength(0);
  });
  it('every fixture departure really leaves Grand Central', async () => {
    const decoded = await decodedFixture('mnr.pb');
    const vm = mapMnr(decoded, { dest: '' }, decoded.timestamp, {});
    const mins = vm.departures.map((d) => d.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });
  it('names the lines', () => {
    expect(MNR_ROUTES['1']).toBe('Hudson');
    expect(MNR_ROUTES['3']).toBe('New Haven');
  });
});

describe('mapPath', () => {
  const digest = { stations: { '33S': {
    ToNY: [],
    ToNJ: [
      { t: 1045, headSign: 'Hoboken', lineColors: ['4D92FB', 'FF9900'] },
      { t: 1120, headSign: 'Journal Square', lineColors: ['FF9900'] },
      { t: 400, headSign: 'Departed', lineColors: [] }, // in the past -> dropped
    ],
  } } };
  it('filters direction, computes minutes, drops departed trains', () => {
    const vm = mapPath(digest, { station: '33S', dir: 'ToNJ' }, 1000);
    expect(vm.sections).toHaveLength(1);
    expect(vm.sections[0].label).toBe('To New Jersey');
    expect(vm.sections[0].rows).toEqual([
      { min: 1, t: 1045, dest: 'Hoboken', colors: ['4D92FB', 'FF9900'] },
      { min: 2, t: 1120, dest: 'Journal Square', colors: ['FF9900'] },
    ]);
  });
  it('renders both directions as two sections', () => {
    const vm = mapPath(digest, { station: '33S', dir: 'both' }, 1000);
    expect(vm.sections.map((s) => s.dir)).toEqual(['ToNY', 'ToNJ']);
  });
  it('handles unknown stations and missing digests as empty sections', () => {
    expect(mapPath({}, { station: 'WTC', dir: 'both' }, 0).sections.every((s) => s.rows.length === 0)).toBe(true);
    expect(Object.keys(PATH_STATIONS)).toHaveLength(13);
  });
});

describe('mapFerry', () => {
  const data = {
    stops: [{ id: '17', name: 'East 34th Street' }, { id: '4', name: 'Hunters Point South' }, { id: '87', name: 'Wall St/Pier 11' }],
    trips: { '52': ['ER', 'Wall St./Pier 11'] },
    routes: { ER: { name: 'East River', color: '00839C' } },
  };
  const digest = { trips: [
    { tripId: '52', stops: [{ stopId: '17', t: 1300 }, { stopId: '4', t: 1900 }, { stopId: '87', t: 2500 }] },
    { tripId: '999', stops: [{ stopId: '4', t: 1400 }, { stopId: '17', t: 2000 }] }, // unknown trip id
    { tripId: '53', stops: [{ stopId: '87', t: 1200 }, { stopId: '17', t: 1800 }] }, // terminates at landing
    { tripId: '54', stops: [{ stopId: '17', t: 900 }, { stopId: '87', t: 1500 }] },  // already departed
  ] };
  it('lists future departures from the landing with route info', () => {
    const vm = mapFerry(digest, data, '17', 1000);
    expect(vm.landingName).toBe('East 34th Street');
    expect(vm.departures[0]).toEqual({
      min: 5, t: 1300, dest: 'Wall St./Pier 11', route: { name: 'East River', color: '00839C' },
    });
  });
  it('falls back to the final stop name when the trips map is stale', () => {
    const vm = mapFerry(digest, data, '17', 1000);
    const unknown = vm.departures.find((d) => d.t === 2000);
    expect(unknown).toBeUndefined(); // trip 999 TERMINATES at 17 -> arrival, excluded
    const vm4 = mapFerry(digest, data, '4', 1000);
    const fallback = vm4.departures.find((d) => d.t === 1400);
    expect(fallback.dest).toBe('East 34th Street'); // last onward stop's name
    expect(fallback.route).toBeNull();
  });
  it('excludes terminating and departed trips', () => {
    const vm = mapFerry(digest, data, '17', 1000);
    expect(vm.departures.map((d) => d.t)).toEqual([1300]);
  });
  it('survives missing static data', () => {
    const vm = mapFerry(digest, null, '17', 1000);
    expect(vm.departures[0].dest).toBe('Ferry');
  });
});

describe('mapSubwayStatus aliases', () => {
  it("matches shuttle 'S' against GS/FS/H route ids", () => {
    const alerts = [{ routes: ['GS'], header: '42 St Shuttle suspended' }];
    const vm = mapSubwayStatus(alerts, ['S']);
    expect(vm[0]).toMatchObject({ line: 'S', ok: false });
    expect(vm[0].headers[0]).toContain('Shuttle');
  });
  it('matches 6 against the 6X express variant', () => {
    const vm = mapSubwayStatus([{ routes: ['6X'], header: 'Express delays' }], ['6']);
    expect(vm[0].ok).toBe(false);
  });
  it('still shows Good Service for an unaffected line', () => {
    const vm = mapSubwayStatus([{ routes: ['GS'], header: 'x' }], ['1']);
    expect(vm[0].ok).toBe(true);
  });
});
