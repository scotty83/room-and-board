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
import { sparkPath } from '../site/js/widgets/markets.js';

const CFG = { name: 'Sean' };
const el = () => document.createElement('div');

const CASES = [
  ['weather', weather, ['84', 'Mostly clear', 'Extreme Heat Watch', '9 AM']],
  ['subway', subway, ['Good Service', 'rerouted', 'delays']],
  ['lirr', lirr, ['Port Washington', '8', 'Track 17']],
  ['mnr', mnr, ['Southeast', 'Harlem', 'Poughkeepsie']],
  ['bus', busw, ['M34-SBS', 'Javits Center', 'approaching']],
  ['sports', sports, ['Mets', 'Bot 7th', 'W 24-17', 'Last:']],
  ['worldcup', worldcup, ['USA', 'FRA vs NGA', 'penalties', 'Live', 'Upcoming']],
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

  it('worldcup escapes upstream score text', () => {
    const host = el();
    worldcup.render(host, { nowMs: 1783000000000, live: [{ state: 'in', detail: "12'", home: 'USA', away: 'CRC', hs: '<img src=x>', as: '0', hf: '', af: '', note: '' }], upcoming: [], results: [] }, CFG);
    expect(host.innerHTML).not.toContain('<img src=x>');
  });

  it('news and history show a +N more hint when items overflow the card', () => {
    const mkCard = (id) => {
      const c = document.createElement('article');
      c.className = `card card--${id} t-s t-narrow`;
      c.dataset.w = '3'; c.dataset.h = '2';
      c.innerHTML = '<div class="card__body"></div>';
      document.body.appendChild(c);
      return c;
    };
    const nc = mkCard('news');
    news.render(nc.querySelector('.card__body'), { nowMs: Date.now(), items: Array.from({ length: 20 }, (_, i) => ({ title: `Story ${i}`, t: Date.now() - i * 1000, source: 'X' })) }, CFG);
    expect(nc.querySelector('.more-hint')).not.toBeNull();
    nc.remove();
    const hc = mkCard('history');
    history.render(hc.querySelector('.card__body'), { events: Array.from({ length: 20 }, (_, i) => ({ year: 1900 + i, text: `Event ${i}` })) }, CFG);
    expect(hc.querySelector('.more-hint')).not.toBeNull();
    hc.remove();
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

describe('imageshow module', () => {
  it('imageshow exposes the shared viewer + slideshow', async () => {
    const m = await import('../site/js/imageshow.js');
    expect(typeof m.createSlideshow).toBe('function');
    expect(typeof m.openImageViewer).toBe('function');
    expect(typeof m.swipeAction).toBe('function');
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
