// Clock-face screensavers: pure builders, zone math via Intl. City assertions
// pin their zones explicitly so they hold under any machine/CI timezone; the
// local hero asserts structure only.

import { describe, it, expect } from 'vitest';
import { clockFaceHtml, dialSvg, CLOCK_SOURCES } from '../site/js/clockfaces.js';

const cfg = {
  clock24: false,
  worldclock: { cities: [
    { label: 'New York', zone: 'America/New_York' },
    { label: 'London', zone: 'Europe/London' },
    { label: 'Hong Kong', zone: 'Asia/Hong_Kong' },
  ] },
};
// 16:09 UTC on Jul 19 2026 = 12:09 PM New York, 5:09 PM London, 12:09 AM Jul 20 Hong Kong.
const T = new Date(Date.UTC(2026, 6, 19, 16, 9));

describe('clockFaceHtml', () => {
  it('clock: hero time + date structure', () => {
    const html = clockFaceHtml('clock', cfg, T);
    expect(html).toContain('cf-time');
    expect(html).toContain('cf-date');
    expect(html).toContain('cf-ampm'); // 12h mode shows the meridiem
  });

  it('hides the meridiem in 24h mode', () => {
    expect(clockFaceHtml('clock', { ...cfg, clock24: true }, T)).not.toContain('cf-ampm');
  });

  it('worldclocks: one dial per city, night dimming, day marker', () => {
    const html = clockFaceHtml('worldclocks', cfg, T);
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(3);
    expect(html).toContain('New York');
    expect(html).toContain('12:09 PM'); // NY
    expect(html).toContain('5:09 PM'); // London
    expect(html).toContain('12:09 AM'); // Hong Kong, past midnight
    expect(html).toContain('cf-dial--night'); // HK dial dimmed
    expect(html).toContain('+1d'); // HK is tomorrow relative to local
  });

  it('clockrow: hero + city row, honors 24h clock', () => {
    const html = clockFaceHtml('clockrow', { ...cfg, clock24: true }, T);
    expect(html).toContain('cf-cities');
    expect(html).toContain('17:09'); // London, 24h
    expect(html).not.toContain('PM');
  });

  it('caps the world grid at five cities', () => {
    const many = { worldclock: { cities: Array.from({ length: 8 }, (_, i) => ({ label: `C${i}`, zone: 'Europe/London' })) } };
    expect((clockFaceHtml('worldclocks', many, T).match(/cf-dial__svg/g) || []).length).toBe(5);
  });

  it('dialSvg has no second hand and dims at night', () => {
    const day = dialSvg(10, 9);
    expect((day.match(/<line /g) || []).length).toBe(2); // hour + minute only
    expect(dialSvg(23, 30, { night: true })).toContain('0.38'); // night ink
  });

  it('CLOCK_SOURCES matches the shipped faces', () => {
    expect([...CLOCK_SOURCES].sort()).toEqual(['clock', 'clockrow', 'worldclocks']);
  });
});
