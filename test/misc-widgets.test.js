import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mapNjt } from '../site/js/widgets/njt.js';
import { mapHistory } from '../site/js/widgets/history.js';
import { quoteOfDay } from '../site/js/widgets/quote.js';
import { mapMarkets } from '../site/js/widgets/markets.js';
import { mapBus } from '../site/js/widgets/bus.js';
import { mapSiriStop } from '../worker/src/bus.js';
import { mapYahooChart } from '../worker/src/markets.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('mapNjt', () => {
  const payload = {
    station: 'NY',
    updatedAt: 1000,
    stale: false,
    trains: [
      { time: 900, dest: 'Trenton', line: 'Northeast Corridor', track: '3', status: 'BOARDING' },
      { time: 1120, dest: 'Dover', line: 'Morris & Essex', track: null, status: '' },
      { time: 1500, dest: 'Bay Head', line: 'North Jersey Coast', track: '5', status: '' },
    ],
  };
  it('computes minutes, drops past trains, keeps order', () => {
    const vm = mapNjt(payload, 1000);
    expect(vm.trains).toHaveLength(2);
    expect(vm.trains[0]).toMatchObject({ dest: 'Dover', min: 2 });
    expect(vm.trains[1]).toMatchObject({ dest: 'Bay Head', min: 8, track: '5' });
    expect(vm.stale).toBe(false);
  });
  it('caps at twelve (renderers slice further by card capacity) and passes stale through', () => {
    const many = {
      ...payload,
      stale: true,
      trains: Array.from({ length: 15 }, (_, i) => ({ time: 2000 + i * 60, dest: `D${i}`, line: 'L', track: null, status: '' })),
    };
    const vm = mapNjt(many, 1000);
    expect(vm.trains).toHaveLength(12);
    expect(vm.stale).toBe(true);
  });
  it('handles unconfigured/error payloads as empty', () => {
    expect(mapNjt({ error: 'njt_not_configured' }, 0).trains).toEqual([]);
    expect(mapNjt(null, 0).trains).toEqual([]);
  });
});

describe('mapHistory', () => {
  it('picks spread events from the fixture (9 for capacity, 5 on request)', async () => {
    expect(mapHistory(await fixture('wikimedia-onthisday.json'), 5).events).toHaveLength(5);
    const vm = mapHistory(await fixture('wikimedia-onthisday.json'));
    expect(vm.events).toHaveLength(9);
    const years = vm.events.map((e) => e.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years); // ascending
    expect(new Set(years).size).toBe(9); // distinct
    for (const e of vm.events) expect(e.text.length).toBeGreaterThan(10);
  });
  it('handles few events gracefully', () => {
    const vm = mapHistory({ events: [{ year: 1900, text: 'Something happened here.' }] });
    expect(vm.events).toHaveLength(1);
  });
});

describe('quoteOfDay', () => {
  const quotes = Array.from({ length: 100 }, (_, i) => ({ text: `Q${i}`, author: `A${i}` }));
  it('is deterministic per calendar day', () => {
    const d = new Date('2026-07-02T09:00:00');
    expect(quoteOfDay(quotes, d)).toEqual(quoteOfDay(quotes, new Date('2026-07-02T21:00:00')));
  });
  it('changes across days and wraps the list', () => {
    const a = quoteOfDay(quotes, new Date('2026-07-02'));
    const b = quoteOfDay(quotes, new Date('2026-07-03'));
    expect(a).not.toEqual(b);
  });
  it('ships a valid bundled quotes file', async () => {
    const bundled = await fixture('../../site/data/quotes.json');
    expect(bundled.length).toBeGreaterThanOrEqual(100);
    for (const q of bundled) {
      expect(typeof q.text).toBe('string');
      expect(q.text.length).toBeGreaterThan(0);
      expect(typeof q.author).toBe('string');
    }
  });
});

describe('mapYahooChart (worker side)', () => {
  it('maps the recorded fixture to a compact index summary', async () => {
    const out = mapYahooChart(await fixture('yahoo-gspc.json'), 'S&P 500');
    expect(out.symbol).toBe('^GSPC');
    expect(out.name).toBe('S&P 500');
    expect(out.price).toBeCloseTo(7483.23);
    expect(out.change).toBeCloseTo(7483.23 - 7499.36, 1);
    expect(out.changePct).toBeCloseTo(((7483.23 - 7499.36) / 7499.36) * 100, 2);
    expect(out.spark.length).toBeGreaterThan(10);
    expect(out.spark.every((n) => typeof n === 'number')).toBe(true);
  });
  it('throws on malformed payloads', () => {
    expect(() => mapYahooChart({}, 'x')).toThrow();
  });
});

describe('mapMarkets (page side)', () => {
  it('validates and passes through the worker payload', () => {
    const payload = {
      updatedAt: 123,
      stale: false,
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', price: 7483.23, change: -16.13, changePct: -0.22, spark: [1, 2, 3] },
        { symbol: 'BAD', name: 'x', price: 'NaN', change: 0, changePct: 0, spark: [] },
      ],
    };
    const vm = mapMarkets(payload);
    expect(vm.indices).toHaveLength(1); // invalid row dropped
    expect(vm.indices[0].name).toBe('S&P 500');
  });
  it('returns empty for error payloads', () => {
    expect(mapMarkets(null).indices).toEqual([]);
    expect(mapMarkets({ error: 'boom' }).indices).toEqual([]);
  });
});

describe('mapSiriStop (worker side)', () => {
  const siri = {
    Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [
      { MonitoredVehicleJourney: {
        PublishedLineName: 'M34-SBS', DestinationName: 'JAVITS CENTER',
        MonitoredCall: { StopPointName: 'W 34 ST/7 AV', ExpectedArrivalTime: '2026-07-02T12:03:00.000-04:00',
          Extensions: { Distances: { PresentableDistance: '0.4 miles away' } } },
      }},
      { MonitoredVehicleJourney: {
        PublishedLineName: 'M4', DestinationName: 'THE CLOISTERS',
        MonitoredCall: { StopPointName: 'W 34 ST/7 AV',
          Extensions: { Distances: { PresentableDistance: 'approaching' } } },
      }},
    ]}]}},
  };
  it('maps visits to compact arrivals', () => {
    const out = mapSiriStop(siri, '550685');
    expect(out.name).toBe('W 34 ST/7 AV');
    expect(out.arrivals).toHaveLength(2);
    expect(out.arrivals[0]).toMatchObject({ route: 'M34-SBS', dest: 'JAVITS CENTER' });
    expect(out.arrivals[0].time).toBe(Math.floor(Date.parse('2026-07-02T12:03:00.000-04:00') / 1000));
    expect(out.arrivals[1]).toMatchObject({ route: 'M4', time: null, distance: 'approaching' });
  });
  it('tolerates empty deliveries', () => {
    expect(mapSiriStop({}, '1').arrivals).toEqual([]);
  });
});

describe('mapBus (page side)', () => {
  it('computes minutes and keeps distance-only rows', () => {
    const vm = mapBus({ stops: [{ id: '1', name: 'X', arrivals: [
      { route: 'M4', dest: 'A', time: 1120, distance: '' },
      { route: 'M4', dest: 'B', time: null, distance: '2 stops away' },
      { route: 'M4', dest: 'C', time: 900, distance: '' }, // past -> dropped
    ]}]}, 1000);
    expect(vm.configured).toBe(true);
    expect(vm.stops[0].arrivals).toHaveLength(2);
    expect(vm.stops[0].arrivals[0]).toMatchObject({ min: 2 });
    expect(vm.stops[0].arrivals[1]).toMatchObject({ min: null, distance: '2 stops away' });
  });
  it('flags the unconfigured state', () => {
    expect(mapBus({ error: 'bus_not_configured' }, 0).configured).toBe(false);
  });
});
