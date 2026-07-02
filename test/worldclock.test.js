import { describe, it, expect } from 'vitest';
import { worldTimes, CITIES } from '../site/js/widgets/worldclock.js';

// Reference formatter mirroring the widget's Intl usage, so expectations are
// timezone-independent for the test runner.
const timeIn = (date, zone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date);

describe('worldTimes', () => {
  it('covers exactly the five fixed cities in order', () => {
    const rows = worldTimes(new Date('2026-01-15T03:30:00Z'));
    expect(rows.map((r) => r.city)).toEqual(['New York', 'Hyderabad', 'London', 'Los Angeles', 'Hong Kong']);
    expect(CITIES).toHaveLength(5);
  });

  it('formats winter times correctly (2026-01-15T03:30Z)', () => {
    const instant = new Date('2026-01-15T03:30:00Z');
    const rows = Object.fromEntries(worldTimes(instant).map((r) => [r.city, r]));
    expect(rows['New York'].time).toBe('10:30 PM');
    expect(rows['London'].time).toBe('3:30 AM');
    expect(rows['Hyderabad'].time).toBe('9:00 AM'); // UTC+5:30
    expect(rows['Los Angeles'].time).toBe('7:30 PM');
    expect(rows['Hong Kong'].time).toBe('11:30 AM');
  });

  it('handles the DST split window (US on DST, Europe not: 2026-03-20T12:00Z)', () => {
    const instant = new Date('2026-03-20T12:00:00Z');
    const rows = Object.fromEntries(worldTimes(instant).map((r) => [r.city, r]));
    expect(rows['New York'].time).toBe('8:00 AM');  // EDT, UTC-4
    expect(rows['London'].time).toBe('12:00 PM');   // still GMT
  });

  it('computes day offsets relative to the runner-local date', () => {
    const instant = new Date('2026-01-15T03:30:00Z');
    const localDay = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short' }).format(instant);
    for (const row of worldTimes(instant)) {
      const zoneDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: CITIES.find(([c]) => c === row.city)[1],
        dateStyle: 'short',
      }).format(instant);
      const expected = zoneDay === localDay ? 0 : zoneDay > localDay ? 1 : -1;
      expect(row.dayDiff).toBe(expected);
    }
  });
});
