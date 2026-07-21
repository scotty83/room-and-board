import { describe, it, expect } from 'vitest';
import { fetchCuratedManifest, fetchDailyBackdrop, fetchBackdropList, backdropDayIndex } from '../site/js/curated.js';
import { CURATED_SOURCES, SCREENSAVER_SOURCES, CLOCK_BACKDROP_FOLDER } from '../site/js/config.js';

describe('curated screensaver sources', () => {
  it('registers every curated source as a selectable screensaver source', () => {
    for (const id of Object.keys(CURATED_SOURCES)) {
      expect(SCREENSAVER_SOURCES).toContain(id);
      expect(CURATED_SOURCES[id].label).toBeTruthy();
      // folder ids match the worker's /gdrive/album validation: /^[-\w]{10,80}$/
      expect(CURATED_SOURCES[id].folder).toMatch(/^[-\w]{10,80}$/);
    }
  });

  it('ships a Landscapes source', () => {
    expect(CURATED_SOURCES.landscapes).toBeTruthy();
    expect(CURATED_SOURCES.landscapes.label).toBe('Landscapes');
  });

  it('fetchCuratedManifest hits the source folder and maps to slideshow items', async () => {
    let calledUrl = '';
    const net = { fetchJSON: async (url) => {
      calledUrl = url;
      return { photos: [
        { url: 'https://x.test/a.jpg', ar: 1.5, caption: 'Fjord', date: '2026-07-20' },
        { url: 'https://x.test/b.jpg', ar: 1.7, caption: '', date: '2026-07-19' },
      ] };
    } };
    const list = await fetchCuratedManifest('landscapes', net);
    expect(calledUrl).toContain(`folder=${CURATED_SOURCES.landscapes.folder}`);
    expect(list).toEqual([
      { img: 'https://x.test/a.jpg', ar: 1.5, title: 'Fjord', date: '2026-07-20' },
      { img: 'https://x.test/b.jpg', ar: 1.7, title: '', date: '2026-07-19' },
    ]);
  });

  it('returns [] for an unknown source without fetching', async () => {
    let called = false;
    const net = { fetchJSON: async () => { called = true; return {}; } };
    expect(await fetchCuratedManifest('nope', net)).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('clock backdrop (daily rotation)', () => {
  const net = { fetchJSON: async () => ({ photos: [
    { url: 'https://x.test/0.jpg', ar: 1.5, caption: '', date: '' },
    { url: 'https://x.test/1.jpg', ar: 1.5, caption: '', date: '' },
    { url: 'https://x.test/2.jpg', ar: 1.5, caption: '', date: '' },
  ] }) };

  it('picks one image per local day, stable within the day and advancing across days', async () => {
    const morning = await fetchDailyBackdrop(net, new Date('2026-07-21T09:00:00'));
    const evening = await fetchDailyBackdrop(net, new Date('2026-07-21T22:00:00'));
    const nextDay = await fetchDailyBackdrop(net, new Date('2026-07-22T09:00:00'));
    expect(morning).toBe(evening);        // stable through the day
    expect(morning).toMatch(/^https:\/\/x\.test\/\d\.jpg$/);
    expect(nextDay).not.toBe(morning);     // rotated to the next image
  });

  it('hits CLOCK_BACKDROP_FOLDER and returns "" for an empty/unreachable folder', async () => {
    let url = '';
    const spy = { fetchJSON: async (u) => { url = u; return { photos: [] }; } };
    expect(await fetchDailyBackdrop(spy, new Date('2026-07-21T09:00:00'))).toBe('');
    expect(url).toContain(`folder=${CLOCK_BACKDROP_FOLDER}`);
  });

  it('backdropDayIndex is deterministic within a day, wraps the list, and guards empty', () => {
    const idx = backdropDayIndex(new Date('2026-07-21T09:00:00'), 5);
    expect(idx).toBe(backdropDayIndex(new Date('2026-07-21T20:00:00'), 5)); // stable within the day
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(5);
    expect(backdropDayIndex(new Date('2026-07-21T09:00:00'), 0)).toBe(0); // empty-folder guard
  });

  it('fetchBackdropList returns the full folder (the swipe set)', async () => {
    const list = await fetchBackdropList(net);
    expect(list).toHaveLength(3);
    expect(list[0].img).toBe('https://x.test/0.jpg');
  });
});
