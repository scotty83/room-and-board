/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSlideshow, swipeAction } from '../site/js/imageshow.js';
import { stripData, stripHtml } from '../site/js/ambient.js';
import { ambientSource } from '../site/js/modes.js';
import { resolvePhotosManifest } from '../site/js/photos-manifest.js';

const MANIFEST = [
  { img: 'a.jpg', title: 'A', artist: 'AA', year: '1900', ar: 1.78 },
  { img: 'b.jpg', title: 'B', artist: 'BB', year: '1910', ar: 1.3 },
  { img: 'c.jpg', title: 'C', artist: 'CC', year: '1920', ar: 2.4 },
];

describe('createSlideshow', () => {
  let loadedSrcs;
  beforeEach(() => {
    vi.useFakeTimers();
    loadedSrcs = [];
    // Deterministic Image: records src, fires onload synchronously-ish.
    vi.stubGlobal(
      'Image',
      class {
        set src(v) {
          loadedSrcs.push(v);
          queueMicrotask(() => this.onload?.());
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preloads, alternates two layers and wraps with reshuffle', async () => {
    const host = document.createElement('div');
    const show = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0.4 });
    show.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(loadedSrcs).toHaveLength(1);
    expect(host.querySelectorAll('.slide').length).toBe(2); // never more than 2 layers
    expect(host.querySelectorAll('.slide[data-active]').length).toBe(1);
    const firstCaption = host.querySelector('.slide-caption').textContent;

    await vi.advanceTimersByTimeAsync(1000);
    expect(loadedSrcs).toHaveLength(2);
    expect(host.querySelector('.slide-caption').textContent).not.toBe(firstCaption);

    // Advance through the wrap point — no errors, keeps cycling.
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);
    expect(loadedSrcs.length).toBe(7);
    show.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(loadedSrcs.length).toBe(7);
  });

  it('letterboxes every image on black (matches the full-screen viewer)', async () => {
    const host = document.createElement('div');
    const show = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0 });
    show.start();
    const sizes = [];
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(i === 0 ? 0 : 1000);
      const active = host.querySelector('.slide[data-active]');
      sizes.push(`${show.current().ar}:${active.style.backgroundSize}`);
    }
    show.stop();
    // Every aspect now letterboxes (contain) — consistent with tap-in.
    expect(sizes.sort()).toEqual(['1.3:contain', '1.78:contain', '2.4:contain']);
  });

  it('does nothing with an empty manifest', async () => {
    const host = document.createElement('div');
    const show = createSlideshow([], host, { intervalMs: 1000 });
    show.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(loadedSrcs).toHaveLength(0);
  });

  it('step(1) advances immediately and resets the cadence', async () => {
    const host = document.createElement('div');
    const show = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0.4 });
    show.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(loadedSrcs).toHaveLength(1);
    const first = host.querySelector('.slide-caption').textContent;

    show.step(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(loadedSrcs).toHaveLength(2);
    expect(host.querySelector('.slide-caption').textContent).not.toBe(first);

    // cadence reset: nothing at +999ms, next auto-advance lands at +1000ms
    await vi.advanceTimersByTimeAsync(999);
    expect(loadedSrcs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(loadedSrcs).toHaveLength(3);
    show.stop();
  });

  it('step(-1) returns to the previously shown item', async () => {
    const host = document.createElement('div');
    const show = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0.4 });
    show.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = host.querySelector('.slide-caption').textContent;
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.querySelector('.slide-caption').textContent).not.toBe(first);

    show.step(-1);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.slide-caption').textContent).toBe(first);
    show.stop();
  });

  it('step after stop does nothing', async () => {
    const host = document.createElement('div');
    const show = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0.4 });
    show.start();
    await vi.advanceTimersByTimeAsync(0);
    show.stop();
    show.step(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(loadedSrcs).toHaveLength(1);
  });
});

describe('stripData', () => {
  const caches = {
    weather: { now: { temp: 84 } },
    lirr: { departures: [{ min: 8, dest: 'Port Washington', track: '17' }] },
  };
  it('assembles temp and next departures from enabled widgets', () => {
    const out = stripData(caches, { widgets: ['weather', 'lirr'] });
    expect(out.temp).toBe(84);
    expect(out.transit).toHaveLength(1);
    expect(out.transit[0].label).toContain('Port Washington');
    expect(out.transit[0].min).toBe(8);
  });
  it('omits missing/disabled sources', () => {
    const out = stripData({ weather: caches.weather }, { widgets: ['weather'] });
    expect(out.temp).toBe(84);
    expect(out.transit).toEqual([]);
    expect(stripData({}, { widgets: [] }).temp).toBeNull();
  });
});

describe('stripHtml', () => {
  const now = new Date('2026-07-03T21:30:00');
  it('always renders the clock, and temp/transit only when present', () => {
    const bare = stripHtml({ temp: null, cond: null, transit: [] }, now);
    expect(bare).toContain('strip__time');
    expect(bare).toContain('9:30 PM');
    expect(bare).not.toContain('strip__wx');
    const full = stripHtml({ temp: 84, cond: 'Clear', transit: [{ label: 'LIRR · Mineola', min: 8 }] }, now);
    expect(full).toContain('84°');
    expect(full).toContain('Clear'); // conditions, not just temp
    expect(full).toContain('LIRR · Mineola');
    expect(full).toContain('<b>8 min</b>');
  });
  it('omits the time under a clock-face screensaver (no duplication)', () => {
    const noTime = stripHtml({ temp: 72, cond: 'Clear', transit: [] }, now, { showTime: false });
    expect(noTime).not.toContain('strip__time');
    expect(noTime).toContain('72°'); // weather still shows
    expect(noTime).toContain('Clear');
  });
  it('escapes upstream label text', () => {
    const out = stripHtml({ temp: null, cond: null, transit: [{ label: 'NJT · <img src=x onerror=1>', min: 3 }] }, now);
    expect(out).not.toContain('<img');
    expect(out).toContain('&#60;img');
  });
});

describe('swipeAction', () => {
  it('classifies swipes, taps and ambiguous drags', () => {
    expect(swipeAction(-80, 10)).toBe('next');
    expect(swipeAction(120, -20)).toBe('prev');
    expect(swipeAction(-59, 0)).toBe(null);   // under distance threshold
    expect(swipeAction(-80, 50)).toBe(null);  // too diagonal (|dx| < 2|dy|)
    expect(swipeAction(4, -6)).toBe('tap');
    expect(swipeAction(30, 4)).toBe(null);    // drag, neither tap nor swipe
  });
});

describe('createSlideshow stop() safety', () => {
  it('a stop() during a pending preload never resurrects the advance loop', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', class { set src(_v) { this._fire = () => this.onload?.(); Slideshow._pending.push(this); } });
    const host = document.createElement('div');
    const s = createSlideshow(MANIFEST, host, { intervalMs: 1000, random: () => 0 });
    s.start(); // advance → preload → onload pending (not fired)
    s.stop(); // stopped while the preload is in flight
    Slideshow._pending.forEach((img) => img._fire()); // resolve the pending onload
    vi.advanceTimersByTime(10000);
    expect(host.querySelector('.slide-caption').innerHTML.trim()).toBe(''); // never showed
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
const Slideshow = { _pending: [] };

describe('photos screensaver cold-boot — manifest resolution', () => {
  // Regression for the cold-start race in startSlideshow (photos source).
  // Before the fix, photoManifest() returned [] on cold boot (widget fetches
  // async), so createSlideshow([]) assigned a non-null `slideshow`. Every
  // subsequent applyMode() retry hit `if (slideshow) return` and the
  // screensaver stayed blank until the nightly page reload.

  it('calls fetchData() inline when photoManifest() is empty on cold boot', async () => {
    const photo = { img: 'https://example.com/1.jpg', ar: 1.78, title: 'Sunset' };
    const fetchDataMock = vi.fn().mockResolvedValue({ photos: [photo] });
    const photosMod = {
      photoManifest: () => [], // cold boot: render() hasn't run yet
      fetchData: fetchDataMock,
    };
    const cfg = { photos: { source: 'icloud', album: 'B1m5fk75vLWwX' } };
    const net = { fetchJSON: vi.fn() };

    const manifest = await resolvePhotosManifest(cfg, net, photosMod);

    expect(fetchDataMock).toHaveBeenCalledWith(cfg, net);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].img).toBe(photo.img);
  });

  it('skips fetchData() when photoManifest() is already populated (warm cache)', async () => {
    const photo = { img: 'https://example.com/cached.jpg', ar: 1.5, title: 'Cached' };
    const fetchDataMock = vi.fn();
    const photosMod = {
      photoManifest: () => [photo], // warm: render() ran earlier
      fetchData: fetchDataMock,
    };
    const cfg = { photos: { source: 'icloud', album: 'B1m5fk75vLWwX' } };
    const net = { fetchJSON: vi.fn() };

    const manifest = await resolvePhotosManifest(cfg, net, photosMod);

    expect(fetchDataMock).not.toHaveBeenCalled();
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toBe(photo);
  });

  it('returns [] when both photoManifest() and fetchData() are empty — allows retry without locking', async () => {
    const fetchDataMock = vi.fn().mockResolvedValue({ photos: [] });
    const photosMod = {
      photoManifest: () => [],
      fetchData: fetchDataMock,
    };
    const cfg = { photos: { source: 'icloud', album: 'B1m5fk75vLWwX' } };
    const net = { fetchJSON: vi.fn() };

    const manifest = await resolvePhotosManifest(cfg, net, photosMod);

    // Returns [] — startSlideshow then hits `if (!manifest.length) return`
    // so slideshow stays null and the next applyMode() retry can recover.
    expect(manifest).toHaveLength(0);
    expect(fetchDataMock).toHaveBeenCalled(); // tried, but album was empty
  });
});

describe('ambientSource', () => {
  const ss = (source) => ({ source, strip: true });

  it('follows the dedicated screensaver picker', () => {
    expect(ambientSource({ widgets: ['art'], screensaver: ss('art') })).toBe('art');
    expect(ambientSource({ widgets: ['photos'], photos: { album: 'B1m5fk75vLWwX' }, screensaver: ss('photos') })).toBe('photos');
    expect(ambientSource({ widgets: [], screensaver: ss('off') })).toBe(null); // defensive guard (picker no longer offers Off)
    expect(ambientSource({ widgets: [], screensaver: ss('clock') })).toBe('clock');
    expect(ambientSource({ widgets: [], screensaver: ss('worldclocks') })).toBe('worldclocks');
    expect(ambientSource({ widgets: [], screensaver: ss('clockrow') })).toBe('clockrow');
  });

  it('no source requires its widget on the dashboard', () => {
    // art fetches its manifest directly; photo sources need only their album.
    expect(ambientSource({ widgets: [], screensaver: ss('art') })).toBe('art');
    expect(ambientSource({ widgets: [], photos: { album: 'B1m5fk75vLWwX' }, screensaver: ss('photos') })).toBe('photos');
  });

  it('degrades a broken photo source to the art slideshow', () => {
    expect(ambientSource({ widgets: [], photos: { album: '' }, screensaver: ss('photos') })).toBe('art');
    expect(ambientSource({ widgets: [], gdrivephotos: { album: '' }, screensaver: ss('gdrivephotos') })).toBe('art');
  });
});

describe('stripData temperature units', () => {
  it('carries the weather condition alongside the temp', () => {
    const caches = { weather: { now: { temp: 84, label: 'Mostly clear' } } };
    expect(stripData(caches, { widgets: ['weather'] }).cond).toBe('Mostly clear');
    expect(stripData({}, { widgets: [] }).cond).toBeNull(); // no weather -> no cond
  });

  it('converts the strip temp to the configured unit', () => {
    const caches = { weather: { now: { temp: 84 } } };
    expect(stripData(caches, { widgets: ['weather'], loc: { units: 'C' } }).temp).toBe(29);
    expect(stripData(caches, { widgets: ['weather'], loc: { units: 'F' } }).temp).toBe(84);
    expect(stripData(caches, { widgets: ['weather'] }).temp).toBe(84); // no loc → F default
  });
});
