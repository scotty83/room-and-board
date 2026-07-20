/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { DEMO_VMS } from '../site/demo/fixtures.js';
import * as weather from '../site/js/widgets/weather.js';
import * as subway from '../site/js/widgets/subway.js';
import * as lirr from '../site/js/widgets/lirr.js';
import * as mnr from '../site/js/widgets/mnr.js';
import * as busw from '../site/js/widgets/bus.js';
import * as sports from '../site/js/widgets/sports.js';
import * as worldcup from '../site/js/widgets/worldcup.js';
import * as news from '../site/js/widgets/news.js';
import * as substack from '../site/js/widgets/substack.js';
import * as bsky from '../site/js/widgets/bsky.js';
import * as njt from '../site/js/widgets/njt.js';
import * as pathw from '../site/js/widgets/path.js';
import * as ferry from '../site/js/widgets/ferry.js';
import * as wotd from '../site/js/widgets/wotd.js';
import * as art from '../site/js/widgets/art.js';
import * as history from '../site/js/widgets/history.js';
import * as aqi from '../site/js/widgets/aqi.js';
import * as quote from '../site/js/widgets/quote.js';
import * as markets from '../site/js/widgets/markets.js';
import * as worldclock from '../site/js/widgets/worldclock.js';
import * as photos from '../site/js/widgets/photos.js';
import * as marketsnews from '../site/js/widgets/marketsnews.js';
import * as services from '../site/js/widgets/services.js';
import * as apod from '../site/js/widgets/apod.js';
import * as chart from '../site/js/widgets/chart.js';
import * as citibike from '../site/js/widgets/citibike.js';
import * as tfl from '../site/js/widgets/tfl.js';
import * as f1 from '../site/js/widgets/f1.js';
import * as golf from '../site/js/widgets/golf.js';
import * as tennis from '../site/js/widgets/tennis.js';
import * as iptv from '../site/js/widgets/iptv.js';
import * as amtrak from '../site/js/widgets/amtrak.js';
import * as clock from '../site/js/widgets/clock.js';
import { fmtClock } from '../site/js/util.js';
import { sparkPath, sparkDividerX, normalizeSymbol } from '../site/js/widgets/markets.js';

const CFG = { name: 'Sean' };
const el = () => document.createElement('div');

describe('normalizeSymbol (ticker entry)', () => {
  it('maps a £ prefix to the LSE .L suffix (UK-user notation)', () => {
    expect(normalizeSymbol('£CBG')).toBe('CBG.L');
    expect(normalizeSymbol('£cbg')).toBe('CBG.L');
    expect(normalizeSymbol('£CBG.L')).toBe('CBG.L'); // no double suffix
  });
  it('strips a $ prefix and trims/uppercases', () => {
    expect(normalizeSymbol('$AAPL')).toBe('AAPL');
    expect(normalizeSymbol('  aapl ')).toBe('AAPL');
  });
  it('leaves indexes and suffixed symbols alone', () => {
    expect(normalizeSymbol('^GSPC')).toBe('^GSPC');
    expect(normalizeSymbol('SAP.DE')).toBe('SAP.DE');
  });
});

describe('clock (topbar) time format', () => {
  const time = (cfg) => { const d = el(); clock.render(d, null, cfg); return d.querySelector('.topbar__time').textContent; };
  it('renders 24-hour time (2-digit hour, no AM/PM) when clock24 is set', () => {
    const t = time({ clock24: true });
    expect(t).toMatch(/^\d{2}:\d{2}$/);
    expect(t).not.toMatch(/[AP]M/);
  });
  it('renders 12-hour time with AM/PM by default', () => {
    expect(time({ clock24: false })).toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/);
  });
});

describe('fmtClock ("as of"/freshness reading, honors clock24)', () => {
  const at = Math.floor(new Date('2026-01-15T15:45:00').getTime() / 1000); // local instant
  it('12-hour with AM/PM by default (matches the departures fmtTime style)', () => {
    expect(fmtClock(at)).toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/);
  });
  it('24-hour (2-digit hour, no AM/PM) when clock24 is set', () => {
    const t = fmtClock(at, true);
    expect(t).toMatch(/^\d{2}:\d{2}$/);
    expect(t).not.toMatch(/[AP]M/);
  });
});

describe('card "as of" freshness note honors clock24 (via render → fmtClock)', () => {
  const noteFor = (clock24) => {
    const c = document.createElement('article');
    c.className = 'card';
    c.innerHTML = '<div class="card__title"></div><div class="card__body"></div>';
    amtrak.render(
      c.querySelector('.card__body'),
      { updatedAt: Math.floor(new Date('2026-01-15T15:45:00').getTime() / 1000), departures: [] },
      { clock24, amtrak: {} },
    );
    return c.querySelector('.card__asof')?.textContent ?? '';
  };
  it('renders the note 24-hour when clock24 is set', () => {
    expect(noteFor(true)).toMatch(/^as of \d{2}:\d{2}$/);
  });
  it('renders the note 12-hour otherwise', () => {
    expect(noteFor(false)).toMatch(/^as of \d{1,2}:\d{2}\s?[AP]M$/);
  });
});

const CASES = [
  ['weather', weather, ['84', 'Mostly clear', 'Extreme Heat Watch', '9 AM']],
  ['subway', subway, ['Good Service', 'rerouted', 'delays']],
  ['lirr', lirr, ['Port Washington', '8', 'Track 17']],
  ['mnr', mnr, ['Southeast', 'Harlem', 'Poughkeepsie']],
  ['bus', busw, ['QM24', 'Madison Av / E 34 St', 'Wall St', '8']],
  ['sports', sports, ['Mets', 'Bot 7th', 'W 24-17', 'Last:', 'Next: vs MIA']],
  ['news', news, ['Council reaches deal', 'Gothamist', 'Federal Reserve']],
  ['substack', substack, ['AI Superforecasters', 'Astral Codex Ten', 'Hidden Cost of Meetings']],
  ['bsky', bsky, ['ferry pier opens', 'NYT', 'Jane Dev']],
  ['njt', njt, ['Trenton', 'Northeast Corridor', '12']],
  ['path', pathw, ['Journal Square', 'Hoboken', 'min']],
  ['ferry', ferry, ['Wall St./Pier 11', 'East River', 'min']],
  ['wotd', wotd, ['petrichor', 'PET-rih-kor', 'noun', 'earthy smell']],
  ['art', art, ['Wheat Fields', 'Jacob van Ruisdael']],
  ['history', history, ['1776', 'Continental Congress']],
  ['aqi', aqi, ['66', 'Moderate', 'UV index', 'High', 'Waning Gibbous']],
  ['quote', quote, ['predict the future', 'Alan Kay']],
  ['markets', markets, ['Dow Jones', 'S&P 500', '0.45']],
  ['worldclock', worldclock, ['Hyderabad', '5:43 PM', 'Hong Kong', '+1d']],
  ['photos', photos, ['Beach']],
  ['marketsnews', marketsnews, ['Fed holds rates']],
  ['services', services, ['Zoom', 'Operational', 'Cloudflare', 'Minor', 'Minor Service Outage']],
  ['apod', apod, ['Messier 24', 'Chuck Ayoub']],
];

// Worldcup renders time-dependently (RETIRED_AFTER sunsets the card after
// Jul 27 2026), so its render tests pin the clock on each side of the cutoff
// instead of riding the CASES loop.
describe('worldcup render (pre-conclusion, pinned clock)', () => {
  beforeAll(() => vi.useFakeTimers({ now: Date.UTC(2026, 6, 10) }));
  afterAll(() => vi.useRealTimers());

  it('renders its demo fixture', () => {
    const host = el();
    worldcup.render(host, DEMO_VMS.worldcup, CFG);
    for (const t of ['USA', 'FRA vs NGA', 'penalties', 'Live', 'Upcoming']) expect(host.textContent).toContain(t);
  });

  it('escapes upstream score text', () => {
    const host = el();
    worldcup.render(host, { nowMs: 1783000000000, live: [{ state: 'in', detail: "12'", home: 'USA', away: 'CRC', hs: '<img src=x>', as: '0', hf: '', af: '', note: '' }], upcoming: [], results: [] }, CFG);
    expect(host.innerHTML).not.toContain('<img src=x>');
  });
});

describe('worldcup retirement (post Jul 20 2026, pinned clock)', () => {
  beforeAll(() => vi.useFakeTimers({ now: Date.UTC(2026, 7, 1) }));
  afterAll(() => vi.useRealTimers());

  it('renders the tap-to-swap prompt with the Spain flag + pencil glyph', () => {
    const host = el();
    worldcup.render(host, DEMO_VMS.worldcup, CFG);
    const prompt = host.querySelector('[data-edit]');
    expect(prompt).toBeTruthy();
    expect(host.textContent).toContain('The World Cup has concluded');
    expect(host.textContent).toContain('Congratulations Spain!');
    expect(host.textContent).toContain('replace this card');
    expect(prompt.querySelector('.flag-inline')).toBeTruthy(); // inline Spain flag
    expect(prompt.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2); // flag + pencil
  });

  it('fetchData goes quiet instead of hitting ESPN', async () => {
    const vm = await worldcup.fetchData(CFG, { fetchJSON: () => { throw new Error('must not fetch'); } });
    expect(vm).toEqual({ live: [], upcoming: [], results: [] });
  });
});

describe('widget renderers', () => {
  for (const [id, mod, expectedTexts] of CASES) {
    it(`${id} renders its demo fixture`, () => {
      const host = el();
      mod.render(host, DEMO_VMS[id], CFG);
      const text = host.textContent;
      for (const t of expectedTexts) expect(text).toContain(t);
    });
  }

  it('chart renders the infographic image only — no caption (title/branding are in the image)', () => {
    const host = el();
    chart.render(host, DEMO_VMS.chart, CFG);
    const img = host.querySelector('.artwork__img');
    expect(img.getAttribute('src')).toContain('cdn.statcdn.com/Infographic/images/normal/28744.jpeg');
    expect(img.getAttribute('alt')).toContain('Population Growth');
    expect(host.querySelector('.artwork--contain')).toBeTruthy(); // data images never crop
    expect(host.querySelector('.artwork__caption')).toBeNull();
    expect(host.textContent.trim()).toBe('');
  });

  it('citibike joins config station names with live counts, dims closed stations', () => {
    const host = el();
    // Names come from cfg; counts from the digest — ids must line up (they do
    // here, mirroring the default config the demo digest was recorded against).
    const cfg = { citibike: { stations: [
      { id: '66dc7c31-0aca-11e7-82f6-3863bb44ef7c', name: 'W 29 St & 9 Ave' },
      { id: '66dc51e9-0aca-11e7-82f6-3863bb44ef7c', name: '10 Ave & W 28 St' },
      { id: '1869743938848725856', name: '9 Ave & W 33 St' },
    ] } };
    citibike.render(host, DEMO_VMS.citibike, cfg);
    const text = host.textContent;
    expect(text).toContain('W 29 St & 9 Ave');
    expect(text).toContain('bikes');
    expect(text).toContain('not renting'); // the ok:false demo station
  });

  it('tfl shows line status, dims + makes tappable a disrupted line', () => {
    const host = el();
    const cfg = { tfl: { lines: ['central', 'district', 'northern'] } }; // northern absent from digest
    tfl.render(host, DEMO_VMS.tfl, cfg);
    const text = host.textContent;
    expect(text).toContain('Central');
    expect(text).toContain('Good Service');
    expect(text).toContain('Part Closure');
    expect(host.querySelector('.tfl--tap')).not.toBeNull();
  });

  it('subway renders route bullets and flags alerting lines', () => {
    const host = el();
    subway.render(host, DEMO_VMS.subway, CFG);
    expect(host.querySelector('.bullet--1')).not.toBeNull();
    expect(host.querySelectorAll('.linestatus--alert').length).toBe(2);
  });



  it('news and history surface overflow as a title badge, not an in-flow row', () => {
    const mkCard = (id) => {
      const c = document.createElement('article');
      c.className = `card card--${id} t-s t-narrow`;
      c.dataset.w = '3'; c.dataset.h = '2';
      c.innerHTML = '<h2 class="card__title">T</h2><div class="card__body"></div>';
      document.body.appendChild(c);
      return c;
    };
    const nc = mkCard('news');
    news.render(nc.querySelector('.card__body'), { nowMs: Date.now(), items: Array.from({ length: 20 }, (_, i) => ({ title: `Story ${i}`, t: Date.now() - i * 1000, source: 'X' })) }, CFG);
    expect(nc.querySelector('.card__more')?.textContent).toBe('+18'); // cap 2 at 3x2
    expect(nc.classList.contains('has-more')).toBe(true);
    expect(nc.querySelector('.more-hint')).toBeNull();
    nc.remove();
    const hc = mkCard('history');
    history.render(hc.querySelector('.card__body'), { events: Array.from({ length: 20 }, (_, i) => ({ year: 1900 + i, text: `Event ${i}` })) }, CFG);
    expect(hc.querySelector('.card__more')?.textContent).toBe('+18');
    expect(hc.classList.contains('has-more')).toBe(true);
    hc.remove();
  });
  it('setMoreBadge removes the badge and fade class when nothing is hidden', () => {
    const c = document.createElement('article');
    c.className = 'card card--news';
    c.dataset.w = '4'; c.dataset.h = '8';
    c.innerHTML = '<h2 class="card__title">T</h2><div class="card__body"></div>';
    document.body.appendChild(c);
    const body = c.querySelector('.card__body');
    const items = (n) => ({ nowMs: Date.now(), items: Array.from({ length: n }, (_, i) => ({ title: `S${i}`, t: 0, source: 'X' })) });
    news.render(body, items(20), CFG); // overflows → badge on
    expect(c.querySelector('.card__more')).not.toBeNull();
    news.render(body, items(2), CFG); // all fit → badge off
    expect(c.querySelector('.card__more')).toBeNull();
    expect(c.classList.contains('has-more')).toBe(false);
    c.remove();
  });

  it('markets colors gains and losses differently', () => {
    const host = el();
    markets.render(host, DEMO_VMS.markets, CFG);
    expect(host.querySelector('.delta--up')).not.toBeNull();
    expect(host.querySelector('.delta--down')).not.toBeNull();
    expect(host.querySelectorAll('svg.spark').length).toBe(3);
  });

  it('markets rows live in one shared grid so spark/delta columns align', () => {
    const host = el();
    markets.render(host, DEMO_VMS.markets, CFG);
    const wrap = host.querySelector('.indexes');
    expect(wrap).not.toBeNull();
    expect(wrap.querySelectorAll('.index')).toHaveLength(3);
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

  it('sports shows the Next line only after finals/postponed/offseason', () => {
    const rowBase = { lg: 'mlb', abbr: 'X', name: 'X', record: '', logo: null, lastLine: null, nextLine: 'vs LAD · 7/20 - 7:10 PM' };
    const host1 = el();
    sports.render(host1, { rows: [{ ...rowBase, state: 'pre', line: 'vs LAD · 7/20 - 7:10 PM' }] }, CFG);
    expect(host1.textContent).not.toContain('Next:'); // upcoming line IS the next game already
    const host2 = el();
    sports.render(host2, { rows: [{ ...rowBase, state: 'pre', line: 'T 0-0 vs LAD · Postponed' }] }, CFG);
    expect(host2.textContent).toContain('Next:'); // postponed: look past the stuck pointer
    const host3 = el();
    sports.render(host3, { rows: [{ ...rowBase, state: 'none', line: 'No scheduled games' }] }, CFG);
    expect(host3.textContent).toContain('Next:');
  });

  it('rail cards prompt for a station when fetchData flags needsStation', () => {
    for (const [mod, msg] of [
      [lirr, '→ LIRR'],
      [mnr, '→ Metro-North'],
      [amtrak, '→ Amtrak'],
    ]) {
      const host = el();
      mod.render(host, { departures: [], needsStation: true }, CFG);
      expect(host.querySelector('.empty').textContent).toContain(msg);
      expect(host.querySelector('.train')).toBeNull();
    }
  });

  it('lirr rows tag their terminal only when both origins are shown', () => {
    const vm = { departures: [{ t: 1783000000, min: 5, dest: 'Mineola', origin: 'gct', branch: 'Hempstead', track: null }] };
    const both = el();
    lirr.render(both, vm, { ...CFG, lirr: { dest: '102', origin: 'both' } });
    expect(both.querySelector('.train__line').textContent).toContain('GCT · ');
    const single = el();
    lirr.render(single, vm, { ...CFG, lirr: { dest: '102', origin: 'gct' } });
    expect(single.querySelector('.train__line').textContent).not.toContain('GCT · ');
  });

  it('lirr/mnr title-note the destination filter, and clear it when unset', () => {
    const card = document.createElement('article');
    card.className = 'card card--lirr';
    card.innerHTML = '<h2 class="card__title">LIRR</h2><div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    lirr.render(body, { ...DEMO_VMS.lirr, destName: 'Mineola' }, CFG);
    expect(card.querySelector('.card__asof').textContent).toBe('stops at Mineola');
    lirr.render(body, { ...DEMO_VMS.lirr, destName: null }, CFG);
    expect(card.querySelector('.card__asof')).toBeNull();
    mnr.render(body, { ...DEMO_VMS.mnr, destName: 'Rye' }, CFG);
    expect(card.querySelector('.card__asof').textContent).toBe('stops at Rye');
    card.remove();
  });

  it('path and ferry title-note their station/landing', () => {
    const card = document.createElement('article');
    card.className = 'card card--path';
    card.innerHTML = '<h2 class="card__title">PATH</h2><div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    pathw.render(body, DEMO_VMS.path, CFG);
    expect(card.querySelector('.card__asof').textContent).toBe('33rd Street');
    ferry.render(body, DEMO_VMS.ferry, CFG);
    expect(card.querySelector('.card__asof').textContent).toBe('East 34th Street');
    ferry.render(body, { ...DEMO_VMS.ferry, landingName: '' }, CFG);
    expect(card.querySelector('.card__asof')).toBeNull();
    card.remove();
  });

  it('mnr slices departures to card capacity like lirr (regression)', () => {
    const card = document.createElement('article');
    card.className = 'card card--mnr';
    card.dataset.w = '3';
    card.dataset.h = '2';
    card.innerHTML = '<div class="card__body"></div>';
    document.body.appendChild(card);
    const many = { departures: Array.from({ length: 12 }, (_, i) => ({ min: i + 2, t: 1783000000 + i * 300, dest: `D${i}`, branch: 'Harlem', track: null })) };
    mnr.render(card.querySelector('.card__body'), many, CFG);
    expect(card.querySelectorAll('.train').length).toBe(2); // itemCapacity('mnr', 3, 2)
    card.remove();
  });

  it('path flattens both directions into a timed list in shallow cards', () => {
    const card = document.createElement('article');
    card.className = 'card card--path';
    card.dataset.w = '6';
    card.dataset.h = '2';
    card.innerHTML = '<div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    const vmBoth = { station: '33S', sections: [
      { dir: 'ToNY', label: 'To New York', rows: [{ min: 4, t: 1783000240, dest: '33rd Street', colors: [] }] },
      { dir: 'ToNJ', label: 'To New Jersey', rows: [{ min: 3, t: 1783000180, dest: 'Journal Square', colors: [] }] },
    ] };
    pathw.render(body, vmBoth, {});
    expect(body.querySelector('.path-section__label')).toBeNull();
    expect(body.textContent).toContain('To NJ ·');
    // Sorted by time across directions: the sooner NJ-bound train leads.
    expect(body.querySelector('.train__dest').textContent).toContain('Journal Square');
    card.dataset.h = '4';
    pathw.render(body, vmBoth, {});
    expect(body.querySelectorAll('.path-section__label')).toHaveLength(2);
    card.remove();
  });

  it('wotd hides the example sentence in 2-wide portrait cards', () => {
    const card = document.createElement('article');
    card.className = 'card card--wotd';
    card.dataset.w = '2';
    card.dataset.h = '3';
    card.innerHTML = '<div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    wotd.render(body, DEMO_VMS.wotd, CFG);
    expect(body.querySelector('.wotd__ex')).toBeNull();
    expect(body.textContent).toContain('petrichor');
    card.remove();
  });

  it('wotd hides the example sentence in shallow cards', () => {
    const card = document.createElement('article');
    card.className = 'card card--wotd';
    card.dataset.w = '3';
    card.dataset.h = '2';
    card.innerHTML = '<div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    wotd.render(body, DEMO_VMS.wotd, CFG);
    expect(body.textContent).not.toContain('first storm');
    card.dataset.h = '4';
    wotd.render(body, DEMO_VMS.wotd, CFG);
    expect(body.textContent).toContain('first storm');
    card.remove();
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

describe('art viewer strip + swipes', () => {
  it('viewer shows the ambient strip with a clock', () => {
    const host = el();
    art.render(host, DEMO_VMS.art, CFG);
    host.querySelector('.artwork').click();
    const viewer = document.querySelector('#art-viewer');
    const strip = viewer.querySelector('.strip');
    expect(strip).not.toBeNull();
    expect(strip.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    viewer.click();
    expect(viewer.hidden).toBe(true);
  });

  it('viewer swipes to the next and previous artwork', async () => {
    const list = [
      DEMO_VMS.art,
      { img: 'https://x.test/two.jpg', title: 'Second Work', artist: 'B', year: '1901', ar: 1.5 },
    ];
    vi.stubGlobal('Image', class { set src(v) { queueMicrotask(() => this.onload?.()); } });
    // Pre-populate artList so the viewer receives the full manifest for swiping.
    await art.fetchData({ art: {} }, { fetchJSON: async () => list });
    const host = el();
    art.render(host, DEMO_VMS.art, CFG);
    host.querySelector('.artwork').click();
    const viewer = document.querySelector('#art-viewer');
    // No async manifest load — list is seeded synchronously from artList.
    const swipe = (fromX, toX) => {
      viewer.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: 100 }));
      viewer.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, clientY: 104 }));
      return new Promise((r) => setTimeout(r, 0)); // preload microtask
    };
    await swipe(600, 400); // left: next
    expect(viewer.querySelector('.art-viewer__img').getAttribute('src')).toBe('https://x.test/two.jpg');
    expect(viewer.textContent).toContain('Second Work');
    await swipe(400, 600); // right: back to the first
    expect(viewer.querySelector('.art-viewer__img').getAttribute('src')).toBe(DEMO_VMS.art.img);
    expect(viewer.hidden).toBe(false); // swipes never close
    vi.unstubAllGlobals();
    // A genuine tap (down/up/click at the same spot) still closes.
    viewer.dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 300 }));
    viewer.dispatchEvent(new MouseEvent('pointerup', { clientX: 502, clientY: 301 }));
    viewer.dispatchEvent(new MouseEvent('click', { clientX: 502, clientY: 301 }));
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

describe('setCardNote', () => {
  it('creates, updates and removes the title note', async () => {
    const { setCardNote } = await import('../site/js/util.js');
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = '<h2 class="card__title">X</h2><div class="card__body"></div>';
    document.body.appendChild(card);
    const body = card.querySelector('.card__body');
    setCardNote(body, 'stops at Mineola');
    expect(card.querySelector('.card__title .card__asof').textContent).toBe('stops at Mineola');
    setCardNote(body, 'stops at Rye');
    expect(card.querySelectorAll('.card__asof')).toHaveLength(1);
    expect(card.querySelector('.card__asof').textContent).toBe('stops at Rye');
    setCardNote(body, null);
    expect(card.querySelector('.card__asof')).toBeNull();
    setCardNote(document.createElement('div'), 'orphan'); // no card ancestor: no throw
    card.remove();
  });
});

describe('symbolKnown', () => {
  const ok = (body) => ({ ok: true, json: async () => body });
  it('accepts a symbol the quote source returns', async () => {
    const fetchFn = async (url) => {
      expect(url).toContain('/markets?symbols=AAPL');
      return ok({ indices: [{ symbol: 'AAPL', name: 'Apple Inc.' }] });
    };
    expect(await markets.symbolKnown('AAPL', fetchFn)).toBe(true);
  });
  it('rejects unknown symbols, upstream failures and network errors', async () => {
    expect(await markets.symbolKnown('FLKJSDF', async () => ({ ok: false }))).toBe(false); // worker 502
    expect(await markets.symbolKnown('FLKJSDF', async () => ok({ indices: [] }))).toBe(false);
    expect(await markets.symbolKnown('AAPL', async () => { throw new Error('offline'); })).toBe(false);
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

describe('markets 2-day sparkline', () => {
  it('sparkDividerX is the midpoint of the split gap in sparkPath coords', () => {
    // 10-point series split at 5: step = (90-4)/9; divider at index 4.5.
    const step = 86 / 9;
    expect(sparkDividerX(10, 5)).toBeCloseTo(2 + 4.5 * step, 5);
  });
  it('draws the divider only on wide cards that carry two sessions', () => {
    const mk = (w) => {
      const card = document.createElement('article');
      card.className = 'card card--markets';
      card.dataset.w = String(w); card.dataset.h = '3';
      card.innerHTML = '<h2 class="card__title">Markets</h2><div class="card__body"></div>';
      document.body.appendChild(card);
      markets.render(card.querySelector('.card__body'), DEMO_VMS.markets, CFG);
      return card;
    };
    const wide = mk(4); // markets' max width — fixture carries spark2/split
    expect(wide.querySelectorAll('.spark__div').length).toBe(3); // one per index
    expect(wide.querySelectorAll('.spark__prev').length).toBe(3); // dimmed yesterday segment
    wide.remove();
    const narrow = mk(3); // the 3-wide min → compact 1-day spark, no divider
    expect(narrow.querySelector('.spark__div')).toBeNull();
    expect(narrow.querySelector('.spark__prev')).toBeNull();
    narrow.remove();
  });
});

describe('imageshow module', () => {
  it('imageshow exposes the shared viewer + slideshow', async () => {
    const m = await import('../site/js/imageshow.js');
    expect(typeof m.createSlideshow).toBe('function');
    expect(typeof m.openImageViewer).toBe('function');
    expect(typeof m.swipeAction).toBe('function');
  });
});

describe('newscore module', () => {
  it('newscore exposes the shared news engine', async () => {
    const m = await import('../site/js/widgets/newscore.js');
    for (const fn of ['parseRss', 'mergeNews', 'ageLabel', 'renderHeadlines', 'fetchHeadlines']) {
      expect(typeof m[fn]).toBe('function');
    }
  });
});

describe('viewer caption meta — photos vs art', () => {
  beforeAll(() => {
    document.querySelector('#art-viewer')?.remove();
  });
  afterAll(() => {
    document.querySelector('#art-viewer')?.remove();
  });

  it('photo item (no artist) shows empty meta — not "undefined"', async () => {
    vi.resetModules();
    const { openImageViewer } = await import('../site/js/imageshow.js');
    const photo = { img: 'https://x.test/photo.jpg', title: 'Sunset', date: '2024-06-01', ar: 1.78 };
    openImageViewer(photo, CFG, { list: [photo] });
    const viewer = document.querySelector('#art-viewer');
    const meta = viewer.querySelector('.slide-caption__meta');
    expect(meta.textContent).not.toContain('undefined');
    expect(meta.textContent).toBe('');
  });

  it('art item (with artist) still renders artist · year in meta', async () => {
    vi.resetModules();
    const { openImageViewer } = await import('../site/js/imageshow.js');
    const artwork = { img: 'https://x.test/art.jpg', title: 'Wheat Fields', artist: 'Jacob van Ruisdael', year: '1670', ar: 1.5 };
    openImageViewer(artwork, CFG, { list: [artwork] });
    const viewer = document.querySelector('#art-viewer');
    const meta = viewer.querySelector('.slide-caption__meta');
    expect(meta.textContent).toBe('Jacob van Ruisdael · 1670');
  });
});

describe('art fullscreen swipes via artList', () => {
  beforeAll(() => {
    // Remove any #art-viewer left by earlier tests so the fresh module instance
    // gets its own element with event listeners bound to its own step closure.
    document.querySelector('#art-viewer')?.remove();
  });
  afterAll(() => {
    document.querySelector('#art-viewer')?.remove();
  });

  it('art fullscreen browses the whole filtered manifest after fetchData', async () => {
    // Reset modules so this test gets fresh manifestCache / artList state,
    // independent of any previous test that may have already cached a manifest.
    vi.resetModules();
    const artFresh = await import('../site/js/widgets/art.js');
    const list = [
      DEMO_VMS.art,
      { img: 'https://x.test/artlist.jpg', title: 'ArtList Work', artist: 'AL', year: '1902', ar: 1.5 },
    ];
    vi.stubGlobal('Image', class { set src(v) { queueMicrotask(() => this.onload?.()); } });
    // fetchData populates artList; render's click handler passes it to openImageViewer.
    await artFresh.fetchData({ art: {} }, { fetchJSON: async () => list });
    const host = el();
    artFresh.render(host, DEMO_VMS.art, CFG);
    host.querySelector('.artwork').click();
    const viewer = document.querySelector('#art-viewer');
    const swipe = (fromX, toX) => {
      viewer.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: 100 }));
      viewer.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, clientY: 104 }));
      return new Promise((r) => setTimeout(r, 0)); // preload microtask
    };
    await swipe(600, 400); // swipe left → next
    expect(viewer.querySelector('.art-viewer__img').getAttribute('src')).toBe('https://x.test/artlist.jpg');
    expect(viewer.textContent).toContain('ArtList Work');
    vi.unstubAllGlobals();
  });
});

describe('fmtTemp', () => {
  it('passes Fahrenheit through and converts to Celsius (rounded)', () => {
    expect(weather.fmtTemp(84, 'F')).toBe('84°');
    expect(weather.fmtTemp(84, 'C')).toBe('29°');   // (84-32)*5/9 = 28.9 → 29
    expect(weather.fmtTemp(32, 'C')).toBe('0°');
    expect(weather.fmtTemp(212, 'C')).toBe('100°');
    expect(weather.fmtTemp(70, 'F')).toBe('70°');
  });
});

describe('weather render honors cfg.loc.units', () => {
  const vm = {
    now: { temp: 84, feels: 92, code: 0, label: 'Clear', icon: 'sun' },
    hourly: [{ h: '1 PM', temp: 80, code: 0 }],
    daily: [{ day: 'Mon', hi: 88, lo: 70, code: 0 }],
    sunrise: '2026-07-06T05:30', sunset: '2026-07-06T20:30', alert: null,
  };
  it('renders Celsius when cfg.loc.units is C', async () => {
    const el = document.createElement('div');
    weather.render(el, vm, { loc: { units: 'C' } });
    expect(el.textContent).toContain('29°');   // 84°F → 29°C
    expect(el.textContent).not.toContain('84°');
  });
});

describe('f1 render', () => {
  it('renders next race, podium, and both standings from the demo VM', () => {
    const el = document.createElement('div');
    f1.render(el, DEMO_VMS.f1, CFG);
    // Next race as heading + date/location beneath it.
    expect(el.textContent).toContain('Belgian Grand Prix');
    expect(el.textContent).toContain('Spa-Francorchamps');
    // Previous-race podium.
    expect(el.textContent).toContain('British Grand Prix');
    expect(el.textContent).toContain('Leclerc');
    expect(el.textContent).toContain('Russell');
    expect(el.textContent).toContain('Hamilton');
    // Driver + constructor standings.
    expect(el.textContent).toContain('Antonelli');
    expect(el.textContent).toContain('Mercedes');
    expect(el.textContent).toContain('Ferrari');
    // Team-color dots and a driver country flag.
    expect(el.querySelector('.f1-dot')).toBeTruthy();
    expect(el.querySelector('.f1-flag')).toBeTruthy();
  });

  it('falls back to the raw team name when the constructorId is unknown', () => {
    const el = document.createElement('div');
    const vm = {
      updatedAt: 1783000000, stale: false, next: null, lastRace: null, podium: null,
      drivers: [{ pos: 1, name: 'Doe', nat: 'British', cid: 'brand_new_team', pts: 10 }],
      teams: [{ pos: 1, cid: 'brand_new_team', name: 'Brand New Team', pts: 10 }],
    };
    f1.render(el, vm, CFG);
    expect(el.textContent).toContain('Doe');
    expect(el.textContent).toContain('Brand New Team');
  });

  it('shows a non-empty state when there is no data', () => {
    const el = document.createElement('div');
    f1.render(el, { updatedAt: 0, stale: false, next: null, lastRace: null, podium: null, drivers: [], teams: [] }, CFG);
    expect(el.textContent.length).toBeGreaterThan(0);
  });
});

describe('golf render', () => {
  it('renders the leaderboard from the demo VM', () => {
    const el = document.createElement('div');
    golf.render(el, DEMO_VMS.golf, CFG);
    expect(el.textContent).toContain('S. Burns');
    expect(el.textContent).toContain('-10');
    expect(el.querySelector('.golf-row__score--under')).toBeTruthy();
    expect(el.querySelectorAll('.golf-row').length).toBeGreaterThan(3);
  });

  it('shows the start date when the tournament has not begun', () => {
    const el = document.createElement('div');
    golf.render(el, { name: 'Travelers Championship', state: 'pre', startsAt: Date.UTC(2026, 6, 24), round: null, players: [] }, CFG);
    expect(el.textContent).toContain('Travelers Championship');
    expect(el.textContent).toContain('Starts Jul');
  });

  it('shows a non-empty state with no tournament', () => {
    const el = document.createElement('div');
    golf.render(el, { name: null, state: 'none', startsAt: null, round: null, players: [] }, CFG);
    expect(el.textContent).toContain('No tournament');
  });
});

describe('tennis render', () => {
  it('renders live, upcoming, and finished matches from the demo VM', () => {
    const el = document.createElement('div');
    tennis.render(el, DEMO_VMS.tennis, CFG);
    expect(el.textContent).toContain('C. Alcaraz vs A. Zverev');
    expect(el.textContent).toContain('6-4, 3-2');
    expect(el.querySelector('.tennis-row--live')).toBeTruthy();
    expect(el.querySelector('img.tennis-row__flag')).toBeTruthy();
    // Finished match uses defeated notation with the winner first.
    expect(el.textContent).toContain('M. Bulgaru d. V. Strakhova');
    // Upcoming match shows its start detail, not a score.
    expect(el.textContent).toContain('3:00 PM');
  });

  it('shows a non-empty state with no matches', () => {
    const el = document.createElement('div');
    tennis.render(el, { name: null, rows: [] }, CFG);
    expect(el.textContent).toContain('No tournament');
  });
});

describe('iptv render', () => {
  it('shows the tappable setup prompt when no stream is configured', () => {
    const el = document.createElement('div');
    iptv.render(el, { url: '', label: '' }, CFG);
    expect(el.querySelector('[data-setup="iptv"]')).toBeTruthy();
    expect(el.textContent).toContain('add a stream');
  });

  it('plays a progressive .mp4 stream directly (no hls.js), not an iframe', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      iptv.render(el, { url: 'https://go2rtc.test/api/stream.mp4?src=front_door_med', label: 'Cam' }, CFG);
      const video = el.querySelector('video.iptv__video');
      expect(video).toBeTruthy();
      expect(video.getAttribute('src')).toBe('https://go2rtc.test/api/stream.mp4?src=front_door_med'); // direct src, no hls
      expect(el.querySelector('iframe')).toBeNull();
    } finally {
      iptv.render(el, { url: '', label: '' }, CFG);
      el.remove();
    }
  });

  it('isHlsUrl only matches .m3u8 playlists', () => {
    expect(iptv.isHlsUrl('https://x.test/a.m3u8')).toBe(true);
    expect(iptv.isHlsUrl('https://x.test/a.m3u8?src=cam')).toBe(true);
    expect(iptv.isHlsUrl('https://go2rtc.test/api/stream.mp4?src=cam')).toBe(false);
    expect(iptv.isHlsUrl('https://x.test/feed.mp4')).toBe(false);
  });

  it('mounts a UniFi share link as an iframe with a working expand toggle', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      iptv.render(el, { url: 'https://monitor.ui.com/e1d0e73e-8d15-4ab0-8c25-27bdc824b8be', label: 'Cam' }, CFG);
      expect(el.querySelector('video')).toBeNull();
      const frame = el.querySelector('iframe.iptv__frame');
      expect(frame).toBeTruthy();
      expect(frame.getAttribute('allow')).toContain('autoplay');
      const btn = el.querySelector('.iptv__expand');
      btn.click();
      expect(el.querySelector('.iptv--full')).toBeTruthy(); // CSS full screen, no reparent
      expect(el.querySelector('iframe')).toBe(frame); // same iframe: no reload
      btn.click();
      expect(el.querySelector('.iptv--full')).toBeNull();
      // Swapping to an HLS url tears the frame down for the video path.
      iptv.render(el, { url: 'https://x.test/c.m3u8', label: '' }, CFG);
      expect(el.querySelector('iframe')).toBeNull();
      expect(el.querySelector('video')).toBeTruthy();
    } finally {
      iptv.render(el, { url: '', label: '' }, CFG);
      el.remove();
    }
  });

  it('isCameraShare matches only monitor.ui.com links', () => {
    expect(iptv.isCameraShare('https://monitor.ui.com/abc')).toBe(true);
    expect(iptv.isCameraShare('https://evil.test/monitor.ui.com')).toBe(false);
    expect(iptv.isCameraShare('https://x.test/a.m3u8')).toBe(false);
    expect(iptv.isCameraShare('not a url')).toBe(false);
  });

  it('tap toggles full screen with a muted-by-default mute control', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      iptv.render(el, { url: 'https://x.test/fs.m3u8', label: '' }, CFG);
      const wrap = el.querySelector('.iptv');
      const video = el.querySelector('video');
      video.src = 'https://x.test/fs.m3u8'; // stand in for a live connection
      wrap.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Full screen is CSS-only IN PLACE: the wrap stays inside the card (never
      // reparented to body), so the video node and its live src are untouched.
      expect(wrap.classList.contains('iptv--full')).toBe(true);
      expect(el.contains(video)).toBe(true); // never left the card
      expect(video.getAttribute('src')).toBe('https://x.test/fs.m3u8'); // connection intact
      const btn = wrap.querySelector('.iptv__mute');
      expect(btn).toBeTruthy();
      expect(video.muted).toBe(true); // muted by default even in full screen
      // A real tap lands on the inner glyph, not the button. The click must
      // unmute AND stay full screen (not bubble to the wrap's exit handler).
      btn.querySelector('svg').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(video.muted).toBe(false); // glyph unmutes
      expect(wrap.classList.contains('iptv--full')).toBe(true); // did NOT exit full screen
      wrap.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(wrap.classList.contains('iptv--full')).toBe(false);
      expect(el.contains(video)).toBe(true); // still the same node, still in the card
      expect(video.getAttribute('src')).toBe('https://x.test/fs.m3u8'); // still intact
      expect(video.muted).toBe(true); // sound never returns to the dashboard
    } finally {
      iptv.render(el, { url: '', label: '' }, CFG); // tear down the mount
      el.remove();
    }
  });

  it('tears the stream down in ambient mode and remounts on return', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      iptv.render(el, { url: 'https://x.test/b.m3u8', label: '' }, CFG);
      expect(el.querySelector('video')).toBeTruthy();
      document.body.classList.add('mode-ambient');
      iptv.render(el, { url: 'https://x.test/b.m3u8', label: '' }, CFG);
      expect(el.querySelector('video')).toBeNull();
      document.body.classList.remove('mode-ambient');
      iptv.render(el, { url: 'https://x.test/b.m3u8', label: '' }, CFG);
      expect(el.querySelector('video')).toBeTruthy();
    } finally {
      el.remove();
      document.body.classList.remove('mode-ambient');
    }
  });

  it('mounts a muted video shell for a configured stream and survives re-render', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      iptv.render(el, { url: 'https://x.test/a.m3u8', label: 'Cam' }, CFG);
      const video = el.querySelector('video.iptv__video');
      expect(video).toBeTruthy();
      expect(video.hasAttribute('muted')).toBe(true);
      // Same URL re-render must NOT tear down the playing stream.
      iptv.render(el, { url: 'https://x.test/a.m3u8', label: 'Cam' }, CFG);
      expect(el.querySelector('video')).toBe(video);
      // A cleared URL tears it down and returns to the prompt.
      iptv.render(el, { url: '', label: '' }, CFG);
      expect(el.querySelector('video')).toBeNull();
      expect(el.querySelector('[data-setup="iptv"]')).toBeTruthy();
    } finally {
      el.remove();
    }
  });
});

describe('amtrak render', () => {
  const now = Math.floor(Date.now() / 1000);
  const vm = {
    station: 'NYP', updatedAt: now, stale: false,
    alerts: [{ header: 'Reduced weekend service on the Northeast Regional.' }],
    departures: [
      { t: now + 720, sch: now + 720, dest: 'Washington', destCode: 'WAS', route: 'Northeast Regional', num: '171', status: 'On time', platform: null,
        stops: [['PHL', now + 4980], ['WAS', now + 9600]] },
      { t: now + 2280, sch: now + 2280, dest: 'Boston South', destCode: 'BOS', route: 'Acela', num: '2151', status: '5 min late', platform: '7',
        stops: [['NHV', now + 5000]] },
    ],
  };

  it('shows terminus, train, platform and an alert row when unfiltered', () => {
    const el = document.createElement('div');
    amtrak.render(el, vm, { amtrak: { dest: '', alerts: true } });
    expect(el.textContent).toContain('Washington');
    expect(el.textContent).toContain('Northeast Regional');
    expect(el.textContent).toContain('171');
    expect(el.textContent).toContain('Trk 7'); // platform shown when present
    expect(el.querySelector('.talert')).toBeTruthy();
    expect(el.querySelector('.train__status.is-warn')).toBeTruthy(); // "5 min late"
  });

  it('filters to trains that serve the chosen destination and drops the rest', () => {
    const el = document.createElement('div');
    amtrak.render(el, { ...vm, destName: 'Philadelphia' }, { amtrak: { dest: 'PHL', alerts: true } });
    expect(el.textContent).toContain('Northeast Regional'); // 171 serves PHL downstream
    expect(el.textContent).not.toContain('Acela'); // 2151 does not stop at PHL
    expect(el.textContent).toContain('arr'); // shows arrival time at the chosen stop
  });

  it('hides alert rows when the alerts toggle is off', () => {
    const el = document.createElement('div');
    amtrak.render(el, vm, { amtrak: { dest: '', alerts: false } });
    expect(el.querySelector('.talert')).toBeNull();
  });

  it('shows an empty state when there are no departures', () => {
    const el = document.createElement('div');
    amtrak.render(el, { station: 'NYP', updatedAt: now, stale: false, alerts: [], departures: [] }, { amtrak: { dest: '', alerts: true } });
    expect(el.textContent).toContain('No departures');
  });
});
