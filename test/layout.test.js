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
} from '../site/js/layout.js';

const area = (r) => r.w * r.h;

describe('DEFAULT_LAYOUT', () => {
  it('tiles the full 6x4 grid with no overlaps', () => {
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
    expect(clampRect({ id: 'weather', x: 0, y: 0, w: 1, h: 1 })).toEqual({ id: 'weather', x: 0, y: 0, w: 2, h: 2 });
  });
  it('pulls out-of-bounds rects back inside', () => {
    expect(clampRect({ id: 'aqi', x: 7, y: 9, w: 1, h: 1 })).toEqual({ id: 'aqi', x: 5, y: 3, w: 1, h: 1 });
    expect(clampRect({ id: 'quote', x: 5, y: 3, w: 2, h: 1 })).toEqual({ id: 'quote', x: 4, y: 3, w: 2, h: 1 });
  });
  it('shrinks rects larger than the grid', () => {
    expect(clampRect({ id: 'art', x: 0, y: 0, w: 99, h: 99 })).toEqual({ id: 'art', x: 0, y: 0, w: 6, h: 4 });
  });
});

describe('rectsOverlap / canPlace', () => {
  const layout = [
    { id: 'weather', x: 0, y: 0, w: 3, h: 2 },
    { id: 'aqi', x: 3, y: 0, w: 1, h: 1 },
  ];
  it('detects overlap', () => {
    expect(rectsOverlap(layout[0], { x: 2, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectsOverlap(layout[0], { x: 3, y: 0, w: 1, h: 1 })).toBe(false);
  });
  it('canPlace rejects overlap and out-of-grid, ignoring the moving widget itself', () => {
    expect(canPlace(layout, { id: 'art', x: 4, y: 0, w: 2, h: 2 })).toBe(true);
    expect(canPlace(layout, { id: 'art', x: 2, y: 0, w: 2, h: 2 })).toBe(false); // hits weather
    expect(canPlace(layout, { id: 'weather', x: 1, y: 0, w: 3, h: 2 })).toBe(false); // hits aqi
    expect(canPlace(layout, { id: 'weather', x: 0, y: 1, w: 3, h: 2 })).toBe(true); // self ignored
    expect(canPlace(layout, { id: 'art', x: 5, y: 3, w: 2, h: 1 })).toBe(false); // off grid
    expect(canPlace(layout, { id: 'weather', x: 4, y: 0, w: 1, h: 1 })).toBe(false); // below min
  });
});

describe('firstFit', () => {
  it('scans row-major from the top-left', () => {
    const layout = [{ id: 'weather', x: 0, y: 0, w: 3, h: 2 }];
    expect(firstFit(layout, 'aqi', [1, 1])).toEqual({ id: 'aqi', x: 3, y: 0, w: 1, h: 1 });
    expect(firstFit(layout, 'markets', [2, 1])).toEqual({ id: 'markets', x: 3, y: 0, w: 2, h: 1 });
  });
  it('returns null when nothing fits', () => {
    const full = [{ id: 'art', x: 0, y: 0, w: 6, h: 4 }];
    expect(firstFit(full, 'aqi', [1, 1])).toBeNull();
  });
});

describe('normalizeLayout', () => {
  it('drops unknown ids and duplicates', () => {
    const out = normalizeLayout([
      { id: 'aqi', x: 0, y: 0, w: 1, h: 1 },
      { id: 'nope', x: 1, y: 0, w: 1, h: 1 },
      { id: 'aqi', x: 2, y: 0, w: 1, h: 1 },
    ]);
    expect(out).toEqual([{ id: 'aqi', x: 0, y: 0, w: 1, h: 1 }]);
  });
  it('re-places overlapping rects first-fit', () => {
    const out = normalizeLayout([
      { id: 'weather', x: 0, y: 0, w: 3, h: 2 },
      { id: 'markets', x: 1, y: 1, w: 2, h: 1 }, // overlaps weather
    ]);
    expect(out[0]).toEqual({ id: 'weather', x: 0, y: 0, w: 3, h: 2 });
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
  it('maps the v1 default widget list onto template slots', () => {
    const out = migrateWidgetsToLayout(['weather', 'subway', 'art', 'history', 'aqi', 'quote']);
    for (const rect of out) {
      expect(rect).toEqual(DEFAULT_LAYOUT.find((d) => d.id === rect.id));
    }
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
  it('drops widgets that cannot fit', () => {
    // Nine widgets can't all fit their minimums in 24 cells (mins sum > 24).
    const out = migrateWidgetsToLayout(['weather', 'subway', 'lirr', 'njt', 'markets', 'history', 'quote', 'art', 'aqi']);
    const total = out.reduce((s, r) => s + area(r), 0);
    expect(total).toBeLessThanOrEqual(24);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(rectsOverlap(out[i], out[j])).toBe(false);
  });
});

describe('placeWithPush', () => {
  const L = (...rects) => rects.map(([id, x, y, w, h]) => ({ id, x, y, w, h }));

  it('places freely when nothing collides', () => {
    const layout = L(['aqi', 0, 0, 1, 1]);
    const out = placeWithPush(layout, { id: 'art', x: 2, y: 0, w: 1, h: 1 });
    expect(out.find((r) => r.id === 'art')).toMatchObject({ x: 2, y: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 0, y: 0 });
  });

  it('shifts a collider along the drag direction', () => {
    const layout = L(['art', 0, 0, 1, 1], ['aqi', 1, 0, 1, 1]);
    // drag art rightwards onto aqi -> aqi pushed further right
    const out = placeWithPush(layout, { id: 'art', x: 1, y: 0, w: 1, h: 1 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'art')).toMatchObject({ x: 1, y: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 2, y: 0 });
  });

  it('cascades pushes through a chain', () => {
    const layout = L(['art', 0, 0, 1, 1], ['aqi', 1, 0, 1, 1], ['worldclock', 2, 0, 1, 2]);
    const out = placeWithPush(layout, { id: 'art', x: 1, y: 0, w: 1, h: 1 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'aqi')).toMatchObject({ x: 2, y: 0 });
    const wc = out.find((r) => r.id === 'worldclock');
    expect(wc.x).toBeGreaterThanOrEqual(3); // pushed onward
  });

  it('falls back to first-fit when the direction is blocked', () => {
    // aqi pinned against the right edge; pushing right impossible -> relocate
    const layout = L(['history', 0, 0, 2, 1], ['aqi', 5, 0, 1, 1]);
    const out = placeWithPush(layout, { id: 'history', x: 4, y: 0, w: 2, h: 1 }, { dx: 1, dy: 0 });
    expect(out.find((r) => r.id === 'history')).toMatchObject({ x: 4, y: 0 });
    const aqi = out.find((r) => r.id === 'aqi');
    expect(canPlace(out.filter((r) => r.id !== 'aqi'), aqi)).toBe(true);
  });

  it('returns null when displaced widgets cannot fit anywhere', () => {
    // grid completely full: pushing is unsolvable
    const layout = L(['weather', 0, 0, 3, 2], ['subway', 3, 0, 3, 2], ['art', 0, 2, 3, 2], ['history', 3, 2, 3, 1], ['quote', 3, 3, 3, 1]);
    const out = placeWithPush(layout, { id: 'weather', x: 1, y: 0, w: 3, h: 2 }, { dx: 1, dy: 0 });
    expect(out).toBeNull();
  });

  it('rejects rects that violate their own minimum or the grid', () => {
    expect(placeWithPush(L(['aqi', 0, 0, 1, 1]), { id: 'weather', x: 0, y: 2, w: 1, h: 1 })).toBeNull();
    expect(placeWithPush([], { id: 'aqi', x: 6, y: 0, w: 1, h: 1 })).toBeNull();
  });

  it('never mutates the input layout', () => {
    const layout = L(['art', 0, 0, 1, 1], ['aqi', 1, 0, 1, 1]);
    const snapshot = JSON.stringify(layout);
    placeWithPush(layout, { id: 'art', x: 1, y: 0, w: 1, h: 1 }, { dx: 1, dy: 0 });
    expect(JSON.stringify(layout)).toBe(snapshot);
  });
});
