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
// Explicit local zone pins world-face output regardless of the machine/CI TZ.
const NY = 'America/New_York';

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

  it('worldclocks: one dial per city, chronological, night dimming, day marker', () => {
    const html = clockFaceHtml('worldclocks', cfg, T, NY);
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(3);
    expect(html).toContain('New York');
    expect(html).toContain('12:09 PM'); // NY
    expect(html).toContain('5:09 PM'); // London
    expect(html).toContain('12:09 AM'); // Hong Kong, past midnight
    expect(html).toContain('cf-dial--night'); // HK dial dimmed
    expect(html).toContain('+1d'); // HK is tomorrow relative to local
    // West → east: NY before London before Hong Kong.
    expect(html.indexOf('New York')).toBeLessThan(html.indexOf('London'));
    expect(html.indexOf('London')).toBeLessThan(html.indexOf('Hong Kong'));
    // Local zone matches a listed city: it becomes home, no extra Local dial.
    expect(html).toContain('cf-dial--home');
    expect(html).not.toContain('>Local<');
  });

  it('worldclocks: injects a Local dial when no listed city is the local zone', () => {
    const away = { ...cfg, worldclock: { cities: cfg.worldclock.cities.slice(1) } }; // London + HK only
    const html = clockFaceHtml('worldclocks', away, T, NY);
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(3); // Local + 2 cities
    expect(html).toContain('>Local<');
    expect(html.indexOf('>Local<')).toBeLessThan(html.indexOf('London')); // sorted west of London
  });

  it('clockrow: hero + city row, local-zone city excluded, honors 24h clock', () => {
    const html = clockFaceHtml('clockrow', { ...cfg, clock24: true }, T, NY);
    expect(html).toContain('cf-cities');
    expect(html).toContain('17:09'); // London, 24h
    expect(html).not.toContain('PM');
    // The hero IS local time — New York must not repeat in the row.
    const row = html.slice(html.indexOf('cf-cities'));
    expect(row).not.toContain('New York');
    expect(row.indexOf('London')).toBeLessThan(row.indexOf('Hong Kong')); // west → east
  });

  it('worldclocks: shows all of a 10-city list, scaling the dials down', () => {
    const zones = ['Pacific/Honolulu', 'America/Los_Angeles', 'America/Chicago', 'America/New_York',
      'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Africa/Nairobi', 'Asia/Kolkata', 'Asia/Tokyo'];
    const many = { worldclock: { cities: zones.map((z, i) => ({ label: `C${i}`, zone: z })) } };
    const html = clockFaceHtml('worldclocks', many, T, NY); // NY listed -> home, no injected Local
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(10); // all ten, not capped at five
    expect(html).toContain('--dial:245px'); // scaled to fit five per row
    expect(html).toContain('cf-dial--home');
    expect((html.match(/cf-drow/g) || []).length).toBe(2); // two symmetric rows of five
  });

  it('worldclocks: balances into symmetric rows with the extra on top', () => {
    // 9 dials -> 5 on top, 4 below. NY is listed so no Local injection.
    const zones = ['Pacific/Honolulu', 'America/Los_Angeles', 'America/Denver', 'America/New_York',
      'America/Sao_Paulo', 'Europe/London', 'Africa/Nairobi', 'Asia/Kolkata', 'Asia/Tokyo'];
    const nine = { worldclock: { cities: zones.map((z, i) => ({ label: `C${i}`, zone: z })) } };
    const html = clockFaceHtml('worldclocks', nine, T, NY);
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(9);
    const rows = html.split('cf-drow').slice(1);
    expect(rows.length).toBe(2);
    expect((rows[0].match(/cf-dial__svg/g) || []).length).toBe(5); // top: 5
    expect((rows[1].match(/cf-dial__svg/g) || []).length).toBe(4); // bottom: 4
  });

  it('worldclocks: caps at ten dials, dropping the farthest city when Local is injected', () => {
    const many = { worldclock: { cities: Array.from({ length: 10 }, (_, i) => ({ label: `C${i}`, zone: 'Europe/London' })) } };
    const html = clockFaceHtml('worldclocks', many, T, NY); // no listed city is NY-local -> inject Local
    expect((html.match(/cf-dial__svg/g) || []).length).toBe(10); // Local + 9, 10th dropped
    expect(html).toContain('>Local<');
  });

  it('dialSvg: two opaque polygon hands, no second hand, dims at night', () => {
    const day = dialSvg(10, 9);
    expect((day.match(/<polygon /g) || []).length).toBe(2); // hour + minute, no second hand
    expect(day).not.toContain('<line'); // opaque tapered polygons, not stroked lines
    expect(day).toContain('#ececec'); // 2a day hand colour
    const night = dialSvg(23, 30, { night: true });
    expect(night).toContain('#8c8c8c'); // night hands dimmed, but a LIMITED dim (still legible)
    expect(night).not.toContain('#ececec'); // and clearly dimmer than the day hand
  });

  it('dialSvg: showMarkers toggles the twelve dot markers (2a) vs markerless (2b)', () => {
    const dots = dialSvg(10, 9, { showMarkers: true });
    expect((dots.match(/#4c4c4c/g) || []).length).toBe(12); // twelve hour dots (2a)
    expect(dots).toContain('#ececec'); // 2a hand colour
    const bare = dialSvg(10, 9, { showMarkers: false });
    expect(bare).not.toContain('#4c4c4c'); // no markers (2b)
    expect(bare).toContain('#f2f2f2'); // 2b hand colour
  });

  it('worldclocks: threads the markers config to the dials', () => {
    const on = clockFaceHtml('worldclocks', { ...cfg, screensaver: { source: 'worldclocks', markers: true } }, T, NY);
    expect(on).toContain('#4c4c4c'); // markers present
    const off = clockFaceHtml('worldclocks', { ...cfg, screensaver: { source: 'worldclocks', markers: false } }, T, NY);
    expect(off).not.toContain('#4c4c4c'); // markerless
  });

  it('CLOCK_SOURCES matches the shipped faces', () => {
    expect([...CLOCK_SOURCES].sort()).toEqual(['clock', 'clockrow', 'worldclocks']);
  });
});
