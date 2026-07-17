import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mapNjt } from '../site/js/widgets/njt.js';
import { mapHistory } from '../site/js/widgets/history.js';
import { quoteOfDay } from '../site/js/widgets/quote.js';
import { mapMarkets } from '../site/js/widgets/markets.js';
import { mapBus } from '../site/js/widgets/bus.js';
import { mapSiriStop } from '../worker/src/bus.js';
import { mapYahooChart } from '../worker/src/markets.js';
import { pickChart, currentTopic } from '../site/js/widgets/chart.js';

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
  it('computes minutes and keeps a still-boarding train past its scheduled time', () => {
    const vm = mapNjt(payload, 1000);
    // Trenton is 100s past schedule but BOARDING — literally at the platform,
    // so it stays (grace window), followed by the two upcoming trains.
    expect(vm.trains).toHaveLength(3);
    expect(vm.trains[0]).toMatchObject({ dest: 'Trenton', min: 0, track: '3' });
    expect(vm.trains[1]).toMatchObject({ dest: 'Dover', min: 2, time: 1120 });
    expect(vm.trains[2]).toMatchObject({ dest: 'Bay Head', min: 8, track: '5' });
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
  it('keeps a delayed train past its scheduled minute, drops departed/expired', () => {
    const vm = mapNjt({ trains: [
      { time: 700, dest: 'Trenton', line: 'NEC', track: '3', status: 'DELAYED' }, // 5 min past, still boardable
      { time: 700, dest: 'Dover', line: 'M&E', track: null, status: 'DEPARTED' }, // gone
      { time: -200, dest: 'BayHead', line: 'NJC', track: null, status: 'DELAYED' }, // >15 min past
    ] }, 1000);
    expect(vm.trains.map((t) => t.dest)).toEqual(['Trenton']);
    expect(vm.trains[0].min).toBe(0);
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
  it('takes the daily baseline from the prior session when Yahoo rolls the close (LSE evening)', () => {
    // After the LSE closes, Yahoo sets chartPreviousClose === regularMarketPrice,
    // which used to render a 0.00 daily change. With range=2d bars, the baseline
    // is the previous day's last close and the spark is the last session only.
    const day = 86400;
    const payload = { chart: { result: [{
      meta: { symbol: 'CBG.L', regularMarketPrice: 413.6, chartPreviousClose: 413.6, gmtoffset: 3600, longName: 'Close Brothers Group plc', shortName: 'CLOSE BROTHERS GROUP PLC ORD 25' },
      timestamp: [100, 200, 300, day + 100, day + 200, day + 300],
      indicators: { quote: [{ close: [400, 402, 405.2, 407.8, 410.1, 413.6] }] },
    }] } };
    const out = mapYahooChart(payload);
    expect(out.name).toBe('Close Brothers Group plc'); // longName beats the ORD-25 register entry
    expect(out.change).toBeCloseTo(413.6 - 405.2, 5); // vs prior session's LAST close
    expect(out.changePct).toBeCloseTo(((413.6 - 405.2) / 405.2) * 100, 5);
    expect(out.spark).toEqual([407.8, 410.1, 413.6]); // last session only
    // spark2 stitches both sessions with split marking the first bar of today.
    expect(out.spark2).toEqual([400, 402, 405.2, 407.8, 410.1, 413.6]);
    expect(out.split).toBe(3);
  });
  it('falls back to chartPreviousClose when only one session is present', () => {
    const payload = { chart: { result: [{
      meta: { symbol: 'AAPL', regularMarketPrice: 210, chartPreviousClose: 205, gmtoffset: -14400, shortName: 'Apple Inc.' },
      timestamp: [100, 200, 300],
      indicators: { quote: [{ close: [206, 208, 210] }] },
    }] } };
    const out = mapYahooChart(payload);
    expect(out.change).toBeCloseTo(5, 5);
    expect(out.spark).toEqual([206, 208, 210]);
    // No prior session → spark2 mirrors spark, split 0 (client draws no divider).
    expect(out.spark2).toEqual([206, 208, 210]);
    expect(out.split).toBe(0);
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
  it('throws on unusable payloads so startWidget preserves the last-good cache', () => {
    expect(() => mapMarkets(null)).toThrow();
    expect(() => mapMarkets({ error: 'boom' })).toThrow();
    expect(() => mapMarkets({ nope: true })).toThrow();
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

describe('mapBus (legs)', () => {
  const legs = [{ route: 'QM24', dir: 0, stopId: '550789', stopName: 'Madison Av / E 34 St' }];
  it('labels each stop with its leg route + configured name, filters past/other', () => {
    const now = 1000;
    const vm = mapBus({ stops: [{ id: '550789', name: 'MADISON AV', arrivals: [
      { route: 'QM24', dest: 'Wall St', time: 1600, distance: '' },
      { route: 'QM24', dest: 'Wall St', time: 500, distance: '' },   // past -> dropped
    ] }] }, now, legs);
    expect(vm.configured).toBe(true);
    expect(vm.stops[0].route).toBe('QM24');
    expect(vm.stops[0].name).toBe('Madison Av / E 34 St'); // configured name wins
    expect(vm.stops[0].arrivals).toHaveLength(1);
    expect(vm.stops[0].arrivals[0].min).toBe(10);
  });
  it('flags not-configured on the server error', () => {
    expect(mapBus({ error: 'bus_not_configured' }, 0, legs).configured).toBe(false);
  });
  it('joins stops by index so two legs sharing a stopId keep their own route', () => {
    const sharedLegs = [
      { route: 'QM1', stopId: 'x', stopName: 'Stop X' },
      { route: 'QM2', stopId: 'x', stopName: 'Stop X' },
    ];
    const payload = {
      stops: [
        { id: 'x', name: 'Stop X', arrivals: [{ route: 'QM1', dest: 'A', time: 2000, distance: '' }] },
        { id: 'x', name: 'Stop X', arrivals: [{ route: 'QM2', dest: 'B', time: 3000, distance: '' }] },
      ],
    };
    const vm = mapBus(payload, 1000, sharedLegs);
    expect(vm.stops[0].route).toBe('QM1');
    expect(vm.stops[1].route).toBe('QM2');
  });
});

describe('pickChart (chart exclude/pick logic)', () => {
  const charts = [
    { id: '1', title: 'Trump Approval Sinks', desc: 'poll of voters' },
    { id: '2', title: 'How Global Population Growth Is Slowing', desc: 'annual growth rate' },
    { id: '3', title: 'AI Chip Sales Surge', desc: 'GPU demand' },
  ];
  it('with excludePolitics on (default), skips the politics card for the next clean one', () => {
    expect(pickChart(charts, { chart: { excludePolitics: true } }).id).toBe('2');
  });
  it('treats a missing chart config as politics-on (default)', () => {
    expect(pickChart(charts, {}).id).toBe('2');
    expect(pickChart(charts, undefined).id).toBe('2');
  });
  it('with excludePolitics off, returns charts[0] unchanged', () => {
    expect(pickChart(charts, { chart: { excludePolitics: false } }).id).toBe('1');
  });
  it('matches politics terms case-insensitively across title AND desc', () => {
    const cards = [
      { id: 'x', title: 'Market Report', desc: 'The latest SENATE budget vote' }, // politics term in desc, upper-case
      { id: 'y', title: 'Coffee Trends', desc: 'consumption is up' },
    ];
    expect(pickChart(cards, { chart: { excludePolitics: true } }).id).toBe('y');
  });
  it('falls back to charts[0] when every card is excluded (never blanks)', () => {
    const allPolitics = [
      { id: 'a', title: 'Election Poll', desc: '' },
      { id: 'b', title: 'Senate Race', desc: 'ballot' },
    ];
    expect(pickChart(allPolitics, { chart: { excludePolitics: true } }).id).toBe('a');
  });
  it('returns null for an empty or missing list', () => {
    expect(pickChart([], {})).toBeNull();
    expect(pickChart(undefined, {})).toBeNull();
  });
});

describe('currentTopic (deterministic 30-min rotation slot)', () => {
  const slot = 30 * 60 * 1000;
  it("returns '' when topics is empty or not an array", () => {
    expect(currentTopic([], 0, slot)).toBe('');
    expect(currentTopic(undefined, 0, slot)).toBe('');
    expect(currentTopic('sports', 0, slot)).toBe('');
    expect(currentTopic(null, 0, slot)).toBe('');
  });
  it('is a constant for a single-element list regardless of the clock', () => {
    expect(currentTopic(['sports'], 0, slot)).toBe('sports');
    expect(currentTopic(['sports'], 12345, slot)).toBe('sports');
    expect(currentTopic(['sports'], slot * 999, slot)).toBe('sports');
  });
  it('advances to the next topic as now crosses a slot boundary', () => {
    const topics = ['technology', 'sports', 'finance'];
    expect(currentTopic(topics, 0, slot)).toBe('technology');
    expect(currentTopic(topics, slot - 1, slot)).toBe('technology'); // still slot 0
    expect(currentTopic(topics, slot, slot)).toBe('sports'); // slot 1
    expect(currentTopic(topics, 2 * slot, slot)).toBe('finance'); // slot 2
  });
  it('wraps modulo the list length', () => {
    const topics = ['technology', 'sports'];
    expect(currentTopic(topics, 2 * slot, slot)).toBe('technology'); // slot 2 % 2 = 0
    expect(currentTopic(topics, 3 * slot, slot)).toBe('sports'); // slot 3 % 2 = 1
  });
  it('defaults now/slotMs so the fleet stays consistent within a slot', () => {
    // Same wall-clock slot ⇒ same topic across boards (no explicit now).
    const topics = ['technology', 'sports'];
    expect(currentTopic(topics)).toBe(topics[Math.floor(Date.now() / slot) % topics.length]);
  });
});
