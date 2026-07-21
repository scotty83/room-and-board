import { describe, it, expect } from 'vitest';
import { fetchCuratedManifest } from '../site/js/curated.js';
import { CURATED_SOURCES, SCREENSAVER_SOURCES } from '../site/js/config.js';

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
