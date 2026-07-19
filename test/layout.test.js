import { describe, it, expect } from 'vitest';
import {
  GRID,
  MIN_SIZE,
  DEFAULT_LAYOUT,
  clampRect,
  rectsOverlap,
  canPlace,
  firstFit,
  normalizeLayout,
  migrateWidgetsToLayout,
  placeWithPush,
  contentMaxH,
  meetsMin,
  firstFitAny,
} from '../site/js/layout.js';

const area = (r) => r.w * r.h;

describe('DEFAULT_LAYOUT', () => {
  it('tiles the full 12x8 grid with no overlaps', () => {
    expect(DEFAULT_LAYOUT.reduce((s, r) => s + area(r), 0)).toBe(GRID.cols * GRID.rows);
    for (let i = 0; i < DEFAULT_LAYOUT.length; i++)
      for (let j = i + 1; j < DEFAULT_LAYOUT.length; j++)
        expect(rectsOverlap(DEFAULT_LAYOUT[i], DEFAULT_LAYOUT[j])).toBe(false);
  });
  it('respects every minimum size', () => {
    for (const r of DEFAULT_LAYOUT) {
      const [mw, mh] = MIN_SIZE[r.id];
      expect(r.w).toBeGreaterThanOrEqual(mw);
      expect(r.h).toBeGreaterThanOrEqual(mh);
    }
  });
});

describe('clampRect', () => {
  it('grows undersized rects to their minimum', () => {
    expect(clampRect({ id: 'weather', x: 0, y: 0, w: 1, h: 1 })).toEqual({ id: 'weather', x: 0, y: 0, w: 3, h: 4 });
  });
  it('pulls out-of-bounds rects back inside', () => {
    expect(clampRect({ id: 'aqi', x: 13, y: 17, w: 2, h: 2 })).toEqual({ id: 'aqi', x: 10, y: 6, w: 2, h: 2 });
    expect(clampRect({ id: 'quote', x: 10, y: 7, w: 3, h: 2 })).toEqual({ id: 'quote', x: 9, y: 6, w: 3, h: 2 });
  });
  it('shrinks rects larger than the grid', () => {
    expect(clampRect({ id: 'art', x: 0, y: 0, w: 99, h: 99 })).toEqual({ id: 'art', x: 0, y: 0, w: 12, h: 8 });
  });
  it('caps widgets with a MAX_SIZE — saved wider layouts shrink on load', () => {
    expect(clampRect({ id: 'markets', x: 0, y: 0, w: 6, h: 3 })).toEqual({ id: 'markets', x: 0, y: 0, w: 4, h: 3 });
    expect(canPlace([], { id: 'markets', x: 0, y: 0, w: 5, h: 3 })).toBe(false); // resize past max = invalid
    expect(canPlace([], { id: 'markets', x: 0, y: 0, w: 4, h: 3 })).toBe(true);
    // status-row widgets cap at 3 wide
    expect(clampRect({ id: 'subway', x: 0, y: 0, w: 6, h: 4 })).toEqual({ id: 'subway', x: 0, y: 0, w: 3, h: 4 });
    expect(clampRect({ id: 'services', x: 0, y: 0, w: 5, h: 3 })).toEqual({ id: 'services', x: 0, y: 0, w: 3, h: 3 });
    expect(canPlace([], { id: 'subway', x: 0, y: 0, w: 4, h: 4 })).toBe(false);
    expect(canPlace([], { id: 'services', x: 0, y: 0, w: 3, h: 3 })).toBe(true);
  });
});

describe('contentMaxH (content-aware height caps)', () => {
  const cfgWith = (cities, symbols) => ({
    worldclock: { cities: Array.from({ length: cities }, (_, i) => ({ label: `C${i}`, zone: 'Asia/Tokyo' })) },
    markets: { symbols: Array.from({ length: symbols }, (_, i) => `T${i}`) },
  });
  it('caps at the smallest height whose capacity fits the followed list', () => {
    expect(contentMaxH(cfgWith(5, 3))).toEqual({ worldclock: 3, markets: 3 });
    expect(contentMaxH(cfgWith(6, 5))).toEqual({ worldclock: 4, markets: 4 });
    expect(contentMaxH(cfgWith(10, 7))).toEqual({ worldclock: 5, markets: 6 });
  });
  it('caps the second-pass widgets from their followed lists', () => {
    const caps = contentMaxH({
      subway: { lines: ['1', '2', '3'] },
      tfl: { lines: Array.from({ length: 11 }, (_, i) => `l${i}`) },
      services: { list: ['webex', 'slack', 'm365'] },
      citibike: { stations: [{}, {}, {}] },
      sports: { teams: [{}, {}, {}, {}, {}, {}] },
    });
    expect(caps.subway).toBe(3);
    expect(caps.services).toBe(3);
    expect(caps.citibike).toBe(3);
    expect(caps.sports).toBe(5); // 6 teams; the h<=2 tier (no Last line) never caps it
    expect(caps.tfl).toBeGreaterThanOrEqual(5); // 11 lines need a tall card
    expect(contentMaxH({ sports: { teams: [{}] } }).sports).toBe(3); // floor: richer tier stays reachable
  });
  it('markets never caps below h=3 — the shallow tier drops sparklines', () => {
    expect(contentMaxH(cfgWith(5, 1)).markets).toBe(3);
  });
  it('empty cfg yields no caps (static bounds apply)', () => {
    expect(contentMaxH({})).toEqual({});
    expect(contentMaxH(undefined)).toEqual({});
  });
  it('clampRect/canPlace honor the caps; omitting them keeps the old bounds', () => {
    const caps = contentMaxH(cfgWith(5, 3));
    expect(clampRect({ id: 'worldclock', x: 0, y: 0, w: 3, h: 5 }, caps).h).toBe(3);
    expect(clampRect({ id: 'worldclock', x: 0, y: 0, w: 3, h: 5 }).h).toBe(5);
    expect(canPlace([], { id: 'markets', x: 0, y: 0, w: 3, h: 4 }, caps)).toBe(false);
    expect(canPlace([], { id: 'markets', x: 0, y: 0, w: 3, h: 3 }, caps)).toBe(true);
    expect(canPlace([], { id: 'markets', x: 0, y: 0, w: 3, h: 4 })).toBe(true);
  });
});

describe('rectsOverlap / canPlace', () => {
  const layout = [
    { id: 'weather', x: 0, y: 0, w: 6, h: 4 },
    { id: 'aqi', x: 6, y: 0, w: 2, h: 2 },
  ];
  it('detects overlap', () => {
    expect(rectsOverlap(layout[0], { x: 4, y: 2, w: 4, h: 4 })).toBe(true);
    expect(rectsOverlap(layout[0], { x: 6, y: 0, w: 2, h: 2 })).toBe(false);
  });
  it('canPlace rejects overlap and out-of-grid, ignoring the moving widget itself', () => {
    expect(canPlace(layout, { id: 'art', x: 8, y: 0, w: 4, h: 4 })).toBe(true);
    expect(canPlace(layout, { id: 'art', x: 4, y: 0, w: 4, h: 4 })).toBe(false); // hits weather
    expect(canPlace(layout, { id: 'weather', x: 2, y: 0, w: 6, h: 4 })).toBe(false); // hits aqi
    expect(canPlace(layout, { id: 'weather', x: 0, y: 2, w: 6, h: 4 })).toBe(true); // self ignored
    expect(canPlace(layout, { id: 'art', x: 11, y: 7, w: 3, h: 2 })).toBe(false); // off grid
    expect(canPlace(layout, { id: 'weather', x: 8, y: 0, w: 2, h: 2 })).toBe(false); // below min
  });
});

describe('firstFit', () => {
  it('scans row-major from the top-left', () => {
    const layout = [{ id: 'weather', x: 0, y: 0, w: 6, h: 4 }];
    expect(firstFit(layout, 'aqi', [2, 2])).toEqual({ id: 'aqi', x: 6, y: 0, w: 2, h: 2 });
    expect(firstFit(layout, 'markets', [3, 2])).toEqual({ id: 'markets', x: 6, y: 0, w: 3, h: 2 });
  });
  it('returns null when nothing fits', () => {
    const full = [{ id: 'art', x: 0, y: 0, w: 12, h: 8 }];
    expect(firstFit(full, 'aqi', [2, 2])).toBeNull();
  });
});

describe('normalizeLayout', () => {
  it('drops unknown ids and duplicates', () => {
    const out = normalizeLayout([
      { id: 'aqi', x: 0, y: 0, w: 2, h: 2 },
      { id: 'nope', x: 2, y: 0, w: 2, h: 2 },
      { id: 'aqi', x: 4, y: 0, w: 2, h: 2 },
    ]);
    expect(out).toEqual([{ id: 'aqi', x: 0, y: 0, w: 2, h: 2 }]);
  });
  it('re-places overlapping rects first-fit', () => {
    const out = normalizeLayout([
      { id: 'weather', x: 0, y: 0, w: 6, h: 4 },
      { id: 'markets', x: 2, y: 2, w: 4, h: 2 }, // overlaps weather
    ]);
    expect(out[0]).toEqual({ id: 'weather', x: 0, y: 0, w: 6, h: 4 });
    expect(canPlace([out[0]], out[1])).toBe(true);
    expect(out[1].id).toBe('markets');
  });
  it('returns DEFAULT_LAYOUT for empty/garbage input', () => {
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout([])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout('junk')).toEqual(DEFAULT_LAYOUT);
  });
});

describe('migrateWidgetsToLayout', () => {
  it('maps known ids onto template slots and first-fits the rest', () => {
    const out = migrateWidgetsToLayout(['weather', 'subway', 'art', 'history', 'aqi', 'quote']);
    for (const rect of out) {
      const slot = DEFAULT_LAYOUT.find((d) => d.id === rect.id);
      if (slot) expect(rect).toEqual(slot); // weather/subway/art keep template spots
    }
    // history/aqi/quote have no template slot anymore -> placed first-fit
    expect(out.map((r) => r.id)).toEqual(expect.arrayContaining(['history', 'aqi', 'quote']));
    expect(out.map((r) => r.id)).not.toContain('worldclock');
  });
  it('keeps template slots for known ids and first-fits extras', () => {
    const out = migrateWidgetsToLayout(['weather', 'lirr', 'markets']);
    expect(out.find((r) => r.id === 'weather')).toEqual(DEFAULT_LAYOUT.find((d) => d.id === 'weather'));
    const lirr = out.find((r) => r.id === 'lirr');
    expect(lirr.w).toBeGreaterThanOrEqual(2);
    expect(lirr.h).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(rectsOverlap(out[i], out[j])).toBe(false);
  });
  it('packs many widgets within the grid without overlap', () => {
    const out = migrateWidgetsToLayout(['weather', 'subway', 'lirr', 'njt', 'markets', 'history', 'quote', 'art', 'aqi']);
    const total = out.reduce((s, r) => s + area(r), 0);
    expect(total).toBeLessThanOrEqual(96);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(rectsOverlap(out[i], out[j])).toBe(false);
  });
});

describe('placeWithPush', () => {
  const L = (...rects) => rects.map(([id, x, y, w, h]) => ({ id, x, y, w, h }));

  it('places freely when nothing collides', () => {
    const layout = L(['aqi', 0, 0, 2, 2]);
    const out = placeWithPush(layout, { id: 'art', x: 4, y: 0, w: 2, h: 2 });
    expect(out.find((r) => r.id === 'art')).toMatchObject({ x: 4, y: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 0, y: 0 });
  });

  it('shifts a collider along the drag direction', () => {
    const layout = L(['art', 0, 0, 2, 2], ['aqi', 2, 0, 2, 2]);
    const out = placeWithPush(layout, { id: 'art', x: 2, y: 0, w: 2, h: 2 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'art')).toMatchObject({ x: 2, y: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 4, y: 0 });
  });

  it('cascades pushes through a chain', () => {
    const layout = L(['art', 0, 0, 2, 2], ['aqi', 2, 0, 2, 2], ['worldclock', 4, 0, 2, 4]);
    const out = placeWithPush(layout, { id: 'art', x: 2, y: 0, w: 2, h: 2 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 4, y: 0 });
    const wc = out.find((r) => r.id === 'worldclock');
    expect(wc.x).toBeGreaterThanOrEqual(6); // pushed onward
  });

  it('falls back to first-fit when the direction is blocked', () => {
    const layout = L(['history', 0, 0, 4, 2], ['aqi', 10, 0, 2, 2]);
    const out = placeWithPush(layout, { id: 'history', x: 8, y: 0, w: 4, h: 2 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'history')).toMatchObject({ x: 8, y: 0 });
    const aqi = out.find((r) => r.id === 'aqi');
    expect(canPlace(out.filter((r) => r.id !== 'aqi'), aqi)).toBe(true);
  });

  it('returns null when displaced widgets cannot fit anywhere', () => {
    const layout = L(['weather', 0, 0, 6, 4], ['subway', 6, 0, 6, 4], ['art', 0, 4, 6, 4], ['history', 6, 4, 6, 2], ['quote', 6, 6, 6, 2]);
    const out = placeWithPush(layout, { id: 'weather', x: 2, y: 0, w: 6, h: 4 }, { dx: 1, dy: 0 });
    expect(out).toBeNull();
  });

  it('rejects rects that violate their own minimum or the grid', () => {
    expect(placeWithPush(L(['aqi', 0, 0, 2, 2]), { id: 'weather', x: 0, y: 4, w: 2, h: 2 })).toBeNull();
    expect(placeWithPush([], { id: 'aqi', x: 12, y: 0, w: 2, h: 2 })).toBeNull();
  });

  it('never mutates the input layout', () => {
    const layout = L(['art', 0, 0, 2, 2], ['aqi', 2, 0, 2, 2]);
    const snapshot = JSON.stringify(layout);
    placeWithPush(layout, { id: 'art', x: 2, y: 0, w: 2, h: 2 }, { dx: 1, dy: 0 });
    expect(JSON.stringify(layout)).toBe(snapshot);
  });
});

describe('multi-mode minimums (MIN_ALTS)', () => {
  it('wotd accepts either orientation but never 2x2', () => {
    expect(meetsMin('wotd', 2, 2)).toBe(false);
    expect(meetsMin('wotd', 2, 3)).toBe(true);
    expect(meetsMin('wotd', 3, 2)).toBe(true);
    expect(meetsMin('wotd', 4, 2)).toBe(true); // covers the 3x2 alternative
    expect(meetsMin('weather', 3, 4)).toBe(true); // single-min widgets unaffected
  });

  it('clampRect grows an undersized wotd to the cheapest alternative', () => {
    expect(clampRect({ id: 'wotd', x: 0, y: 0, w: 2, h: 2 })).toMatchObject({ w: 2, h: 3 });
    // Wide-but-short snaps to landscape (no width shrink, +1 row only).
    expect(clampRect({ id: 'wotd', x: 0, y: 0, w: 4, h: 1 })).toMatchObject({ w: 4, h: 2 });
    // Already valid in landscape: untouched.
    expect(clampRect({ id: 'wotd', x: 0, y: 0, w: 3, h: 2 })).toMatchObject({ w: 3, h: 2 });
  });

  it('canPlace rejects 2x2 wotd and accepts both orientations', () => {
    expect(canPlace([], { id: 'wotd', x: 0, y: 0, w: 2, h: 2 })).toBe(false);
    expect(canPlace([], { id: 'wotd', x: 0, y: 0, w: 3, h: 2 })).toBe(true);
    expect(canPlace([], { id: 'wotd', x: 0, y: 0, w: 2, h: 3 })).toBe(true);
  });

  it('placeWithPush accepts both wotd orientations (the resize-gesture path)', () => {
    // Regression: placeWithPush carried its own MIN_SIZE check, so the board
    // resize gesture rejected 3x2 even though canPlace allowed it.
    expect(placeWithPush([], { id: 'wotd', x: 0, y: 0, w: 3, h: 2 })).toBeTruthy();
    expect(placeWithPush([], { id: 'wotd', x: 0, y: 0, w: 2, h: 3 })).toBeTruthy();
    expect(placeWithPush([], { id: 'wotd', x: 0, y: 0, w: 2, h: 2 })).toBeNull();
  });

  it('firstFitAny falls through to the landscape alternative', () => {
    // Fill everything except a 3x2 hole at the bottom-left: portrait 2x3
    // cannot fit, landscape 3x2 must.
    const blocker = [
      { id: 'art', x: 0, y: 0, w: 12, h: 6 },
      { id: 'weather', x: 3, y: 6, w: 9, h: 2 },
    ];
    expect(firstFitAny(blocker, 'wotd')).toMatchObject({ x: 0, y: 6, w: 3, h: 2 });
  });
});
