/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSlideshow } from '../site/js/widgets/art.js';
import { stripData } from '../site/js/ambient.js';

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

  it('covers near-16:9 images and letterboxes the rest', async () => {
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
    // Shuffle order varies; assert the aspect→size mapping regardless.
    expect(sizes.sort()).toEqual(['1.3:contain', '1.78:cover', '2.4:contain']);
  });

  it('does nothing with an empty manifest', async () => {
    const host = document.createElement('div');
    const show = createSlideshow([], host, { intervalMs: 1000 });
    show.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(loadedSrcs).toHaveLength(0);
  });
});

describe('stripData', () => {
  const caches = {
    weather: { now: { temp: 84 } },
    subway: { groups: [{ stopName: 'Grand Central-42 St', direction: 'N', arrivals: [{ route: '6', min: 2 }, { route: '4', min: 5 }] }] },
    lirr: { departures: [{ min: 8, dest: 'Port Washington', track: '17' }] },
  };
  it('assembles temp and next departures from enabled widgets', () => {
    const out = stripData(caches, { widgets: ['weather', 'subway', 'lirr'] });
    expect(out.temp).toBe(84);
    expect(out.transit).toHaveLength(2);
    expect(out.transit[0].label).toContain('6');
    expect(out.transit[0].min).toBe(2);
    expect(out.transit[1].label).toContain('Port Washington');
  });
  it('omits missing/disabled sources', () => {
    const out = stripData({ weather: caches.weather }, { widgets: ['weather'] });
    expect(out.temp).toBe(84);
    expect(out.transit).toEqual([]);
    expect(stripData({}, { widgets: [] }).temp).toBeNull();
  });
});
