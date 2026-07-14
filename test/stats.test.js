import { describe, it, expect } from 'vitest';
import { summarize } from '../stats/summarize.js';

// SQL-API rows are newest-first. deviceA pinged twice (config changed: dropped
// 'markets'); the older row must lose. deviceC has no country.
const NOW = Date.parse('2026-07-13T18:00:00Z');
const rows = [
  { device: 'a', version: 'v2', mode: 'scheduled', tz: 'America/New_York', widgets: 'weather,subway', country: 'US', ts: '2026-07-13T17:00:00Z' },
  { device: 'b', version: 'v2', mode: 'dashboard', tz: 'Europe/London', widgets: 'weather,tfl', country: 'GB', ts: '2026-07-13T16:00:00Z' },
  { device: 'a', version: 'v1', mode: 'scheduled', tz: 'America/New_York', widgets: 'weather,subway,markets', country: 'US', ts: '2026-07-11T09:00:00Z' },
  { device: 'c', version: 'v2', mode: 'ambient', tz: 'America/New_York', widgets: 'weather', country: 'XX', ts: '2026-07-08T10:00:00Z' },
];

describe('summarize', () => {
  const s = summarize(rows, 512, { windowDays: 7, nowMs: NOW });

  it('dedupes to the newest ping per device', () => {
    expect(s.activeBoards).toBe(3); // a, b, c — not 4
    // deviceA's latest dropped 'markets', so markets is a 0-device widget (absent)
    expect(s.widgets.find((w) => w.id === 'markets')).toBeUndefined();
  });

  it('counts widget adoption across distinct devices with labels + %', () => {
    const weather = s.widgets.find((w) => w.id === 'weather');
    expect(weather).toMatchObject({ label: 'Weather', n: 3, pct: 100 });
    expect(s.widgets.find((w) => w.id === 'subway')).toMatchObject({ n: 1, pct: 33 });
    expect(s.widgets.find((w) => w.id === 'tfl').label).toBe('TfL Status');
  });

  it('tallies mode / country / version and the 24h active count', () => {
    expect(s.modes).toEqual(expect.arrayContaining([{ key: 'scheduled', n: 1 }, { key: 'dashboard', n: 1 }, { key: 'ambient', n: 1 }]));
    expect(s.countries.find((c) => c.key === 'US').n).toBe(1);
    expect(s.activeBoards24h).toBe(2); // a (17:00) + b (16:00); c is 5 days old
    expect(s.pings).toBe(512);
    expect(s.avgWidgets).toBe(1.7); // (2 + 2 + 1) / 3
  });

  it('handles an empty dataset without dividing by zero', () => {
    const empty = summarize([], 0, { nowMs: NOW });
    expect(empty).toMatchObject({ activeBoards: 0, avgWidgets: 0, widgets: [] });
  });
});
