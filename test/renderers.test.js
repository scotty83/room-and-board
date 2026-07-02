/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { DEMO_VMS } from '../site/demo/fixtures.js';
import * as weather from '../site/js/widgets/weather.js';
import * as subway from '../site/js/widgets/subway.js';
import * as lirr from '../site/js/widgets/lirr.js';
import * as njt from '../site/js/widgets/njt.js';
import * as art from '../site/js/widgets/art.js';
import * as history from '../site/js/widgets/history.js';
import * as aqi from '../site/js/widgets/aqi.js';
import * as quote from '../site/js/widgets/quote.js';
import * as markets from '../site/js/widgets/markets.js';
import { sparkPath } from '../site/js/widgets/markets.js';

const CFG = { name: 'Sean' };
const el = () => document.createElement('div');

const CASES = [
  ['weather', weather, ['84', 'Mostly clear', 'Extreme Heat Watch', '9 AM']],
  ['subway', subway, ['Grand Central-42 St', '2', '6', 'Times Sq-42 St']],
  ['lirr', lirr, ['Port Washington', '8', 'Track 17']],
  ['njt', njt, ['Trenton', 'Northeast Corridor', '12']],
  ['art', art, ['Wheat Fields', 'Jacob van Ruisdael']],
  ['history', history, ['1776', 'Continental Congress']],
  ['aqi', aqi, ['66', 'Moderate', 'Waning Gibbous']],
  ['quote', quote, ['predict the future', 'Alan Kay']],
  ['markets', markets, ['Dow Jones', 'S&P 500', '0.45']],
];

describe('widget renderers', () => {
  for (const [id, mod, expectedTexts] of CASES) {
    it(`${id} renders its demo fixture`, () => {
      const host = el();
      mod.render(host, DEMO_VMS[id], CFG);
      const text = host.textContent;
      for (const t of expectedTexts) expect(text).toContain(t);
    });
  }

  it('subway renders route bullets with line classes', () => {
    const host = el();
    subway.render(host, DEMO_VMS.subway, CFG);
    expect(host.querySelector('.bullet--6')).not.toBeNull();
    expect(host.querySelector('.bullet--N')).not.toBeNull();
  });

  it('markets colors gains and losses differently', () => {
    const host = el();
    markets.render(host, DEMO_VMS.markets, CFG);
    expect(host.querySelector('.delta--up')).not.toBeNull();
    expect(host.querySelector('.delta--down')).not.toBeNull();
    expect(host.querySelectorAll('svg.spark').length).toBe(3);
  });

  it('weather omits the alert banner when there is none', () => {
    const host = el();
    weather.render(host, { ...DEMO_VMS.weather, alert: null }, CFG);
    expect(host.querySelector('.alert')).toBeNull();
  });

  it('empty transit states render a friendly message', () => {
    const host = el();
    subway.render(host, { groups: [{ stopId: 'X', stopName: 'X St', direction: 'N', arrivals: [] }] }, CFG);
    expect(host.textContent).toMatch(/No arrivals/i);
    const host2 = el();
    lirr.render(host2, { departures: [] }, CFG);
    expect(host2.textContent).toMatch(/No departures/i);
  });
});

describe('sparkPath', () => {
  it('produces a normalized SVG path', () => {
    const d = sparkPath([0, 5, 10], 100, 30);
    expect(d.startsWith('M')).toBe(true);
    expect(d.split('L')).toHaveLength(3); // three points
    expect(d).toContain('98.0'); // spans to width minus padding
    expect(sparkPath([], 100, 30)).toBe('');
    expect(sparkPath([7], 100, 30)).toBe('');
  });
});
