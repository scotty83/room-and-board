/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { DEMO_VMS } from '../site/demo/fixtures.js';
import * as weather from '../site/js/widgets/weather.js';
import * as subway from '../site/js/widgets/subway.js';
import * as lirr from '../site/js/widgets/lirr.js';
import * as mnr from '../site/js/widgets/mnr.js';
import * as busw from '../site/js/widgets/bus.js';
import * as njt from '../site/js/widgets/njt.js';
import * as art from '../site/js/widgets/art.js';
import * as history from '../site/js/widgets/history.js';
import * as aqi from '../site/js/widgets/aqi.js';
import * as quote from '../site/js/widgets/quote.js';
import * as markets from '../site/js/widgets/markets.js';
import * as worldclock from '../site/js/widgets/worldclock.js';
import { sparkPath } from '../site/js/widgets/markets.js';

const CFG = { name: 'Sean' };
const el = () => document.createElement('div');

const CASES = [
  ['weather', weather, ['84', 'Mostly clear', 'Extreme Heat Watch', '9 AM']],
  ['subway', subway, ['Good Service', 'rerouted', 'delays']],
  ['lirr', lirr, ['Port Washington', '8', 'Track 17']],
  ['mnr', mnr, ['Southeast', 'Harlem', 'Poughkeepsie']],
  ['bus', busw, ['M34-SBS', 'Javits Center', 'approaching']],
  ['njt', njt, ['Trenton', 'Northeast Corridor', '12']],
  ['art', art, ['Wheat Fields', 'Jacob van Ruisdael']],
  ['history', history, ['1776', 'Continental Congress']],
  ['aqi', aqi, ['66', 'Moderate', 'Waning Gibbous']],
  ['quote', quote, ['predict the future', 'Alan Kay']],
  ['markets', markets, ['Dow Jones', 'S&P 500', '0.45']],
  ['worldclock', worldclock, ['Hyderabad', '5:43 PM', 'Hong Kong', '+1d']],
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

  it('subway renders route bullets and flags alerting lines', () => {
    const host = el();
    subway.render(host, DEMO_VMS.subway, CFG);
    expect(host.querySelector('.bullet--1')).not.toBeNull();
    expect(host.querySelectorAll('.linestatus--alert').length).toBe(2);
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

  it('train widgets show the scheduled departure time next to the line', () => {
    for (const [mod, vm] of [[lirr, DEMO_VMS.lirr], [mnr, DEMO_VMS.mnr], [njt, DEMO_VMS.njt]]) {
      const host = el();
      mod.render(host, vm, CFG);
      expect(host.querySelector('.train__line').textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    }
  });

  it('empty transit states render a friendly message', () => {
    const host = el();
    subway.render(host, { lines: [] }, CFG);
    expect(host.textContent).toMatch(/Pick your lines/i);
    const host2 = el();
    lirr.render(host2, { departures: [] }, CFG);
    expect(host2.textContent).toMatch(/No departures/i);
  });
});

describe('art full-screen viewer', () => {
  it('opens on card tap and closes on viewer tap', () => {
    const host = el();
    art.render(host, DEMO_VMS.art, CFG);
    host.querySelector('.artwork').click();
    const viewer = document.querySelector('#art-viewer');
    expect(viewer).not.toBeNull();
    expect(viewer.hidden).toBe(false);
    expect(viewer.querySelector('.art-viewer__img').getAttribute('src')).toBe(DEMO_VMS.art.img);
    expect(viewer.textContent).toContain('Wheat Fields');
    viewer.click();
    expect(viewer.hidden).toBe(true);
  });
});

describe('markets freshness note', () => {
  it('writes an as-of time into the card header', () => {
    const card = document.createElement('article');
    card.className = 'card card--markets';
    card.innerHTML = '<h2 class="card__title">Markets</h2><div class="card__body"></div>';
    document.body.appendChild(card);
    markets.render(card.querySelector('.card__body'), DEMO_VMS.markets, CFG);
    const asof = card.querySelector('.card__title .card__asof');
    expect(asof).not.toBeNull();
    expect(asof.textContent).toMatch(/^as of \d{1,2}:\d{2}\s?(AM|PM)$/);
    card.remove();
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
