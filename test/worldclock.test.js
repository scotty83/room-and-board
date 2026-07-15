import { describe, it, expect } from 'vitest';
import { worldTimes, zoneLabel, OFFICES, zonesByRegion } from '../site/js/widgets/worldclock.js';

const FIVE = [
  { label: 'New York', zone: 'America/New_York' },
  { label: 'San Francisco', zone: 'America/Los_Angeles' },
  { label: 'London', zone: 'Europe/London' },
  { label: 'Hyderabad', zone: 'Asia/Kolkata' },
  { label: 'Hong Kong', zone: 'Asia/Hong_Kong' },
];

describe('worldTimes', () => {
  it('sorts earliest to latest local time (2026-01-15T15:30Z)', () => {
    // SF 7:30 AM < NY 10:30 AM < London 3:30 PM < Hyderabad 9:00 PM < HK 11:30 PM
    const rows = worldTimes(new Date('2026-01-15T15:30:00Z'), FIVE);
    expect(rows.map((r) => r.city)).toEqual(['San Francisco', 'New York', 'London', 'Hyderabad', 'Hong Kong']);
    expect(rows.map((r) => r.time)).toEqual(['7:30 AM', '10:30 AM', '3:30 PM', '9:00 PM', '11:30 PM']);
  });

  it('sorts across a day boundary (2026-01-15T03:30Z)', () => {
    // NY is still Jan 14 evening while Asia is Jan 15 morning; day counts
    // before hour in the sort, so the US West/East rows lead.
    const rows = worldTimes(new Date('2026-01-15T03:30:00Z'), FIVE);
    const idx = (c) => rows.findIndex((r) => r.city === c);
    expect(idx('San Francisco')).toBeLessThan(idx('New York'));  // 7:30 PM < 10:30 PM (Jan 14)
    expect(idx('New York')).toBeLessThan(idx('London'));         // London is already Jan 15
    expect(idx('London')).toBeLessThan(idx('Hyderabad'));        // 3:30 AM < 9:00 AM
    expect(idx('Hyderabad')).toBeLessThan(idx('Hong Kong'));     // 9:00 AM < 11:30 AM
  });

  it('formats winter times and the DST-split window correctly', () => {
    const jan = Object.fromEntries(worldTimes(new Date('2026-01-15T03:30:00Z'), FIVE).map((r) => [r.city, r]));
    expect(jan['New York'].time).toBe('10:30 PM');
    expect(jan['Hyderabad'].time).toBe('9:00 AM'); // UTC+5:30
    const mar = Object.fromEntries(worldTimes(new Date('2026-03-20T12:00:00Z'), FIVE).map((r) => [r.city, r]));
    expect(mar['New York'].time).toBe('8:00 AM');  // EDT
    expect(mar['London'].time).toBe('12:00 PM');   // still GMT
  });

  it('computes day offsets relative to the runner-local date', () => {
    const instant = new Date('2026-01-15T03:30:00Z');
    const localDay = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short' }).format(instant);
    for (const row of worldTimes(instant, FIVE)) {
      const zone = FIVE.find((c) => c.label === row.city).zone;
      const zoneDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(instant);
      expect(row.dayDiff).toBe(zoneDay === localDay ? 0 : zoneDay > localDay ? 1 : -1);
    }
  });
});

describe('OFFICES + zoneLabel', () => {
  it('lists the 14 D.E. Shaw offices with valid zones', () => {
    expect(OFFICES).toHaveLength(14);
    for (const [label, zone] of OFFICES) {
      expect(label.length).toBeGreaterThan(0);
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
    }
    expect(OFFICES.map(([l]) => l)).toContain('Bermuda');
  });
  it('derives readable labels from zone ids', () => {
    expect(zoneLabel('America/New_York')).toBe('New York');
    expect(zoneLabel('America/Indiana/Indianapolis')).toBe('Indianapolis');
    expect(zoneLabel('UTC')).toBe('UTC');
  });
});

describe('zonesByRegion', () => {
  it('keys each zone by the segment before the first slash', () => {
    const by = zonesByRegion(['America/New_York', 'Europe/London', 'Asia/Kolkata']);
    expect(by.America).toEqual(['America/New_York']);
    expect(by.Europe).toEqual(['Europe/London']);
    expect(by.Asia).toEqual(['Asia/Kolkata']);
  });

  it('buckets slashless zones under "UTC / Other"', () => {
    const by = zonesByRegion(['UTC', 'GMT', 'America/New_York']);
    expect(by['UTC / Other']).toEqual(['UTC', 'GMT']);
    expect(by.America).toEqual(['America/New_York']);
    expect(Object.keys(by)).not.toContain('UTC');
  });

  it('groups multi-segment ids by only their first segment', () => {
    const by = zonesByRegion(['America/Argentina/Buenos_Aires', 'America/Indiana/Indianapolis', 'America/New_York']);
    expect(Object.keys(by)).toEqual(['America']);
    expect(by.America).toEqual([
      'America/Argentina/Buenos_Aires',
      'America/Indiana/Indianapolis',
      'America/New_York',
    ]);
  });

  it('preserves input order within a group (already alphabetical upstream)', () => {
    const by = zonesByRegion(['Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo']);
    expect(by.Asia).toEqual(['Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo']);
  });

  it('groups the real IANA list without dropping zones', () => {
    const zones = Intl.supportedValuesOf('timeZone');
    const by = zonesByRegion(zones);
    const flat = Object.values(by).flat();
    expect(flat).toHaveLength(zones.length);
    expect(by.America.length).toBeGreaterThan(0);
    for (const [region, zs] of Object.entries(by)) {
      for (const z of zs) {
        expect(z.includes('/') ? z.slice(0, z.indexOf('/')) : 'UTC / Other').toBe(region);
      }
    }
  });
});
