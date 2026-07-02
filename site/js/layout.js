// Pure grid geometry for the 12×8 dashboard layout. Everything here is
// side-effect free; edit.js and config.js consume it.

// 12x8: cells ~135x92 logical px. v2 layouts (6x4) migrate by doubling.
export const GRID = { cols: 12, rows: 8 };

// Minimums scale the old 6×4 footprints onto the finer grid so a widget can't
// shrink below a legible size — the extra resolution buys finer positioning
// and in-between sizes, not sub-legible cards. The list strips (markets,
// history, quote) get one column narrower than a pure double so they can pack
// tighter, which is the whole point of the finer grid. Lower any other widget
// only after the browser overflow audit clears it.
export const MIN_SIZE = {
  weather: [4, 4],
  subway: [4, 4],
  lirr: [4, 4],
  mnr: [4, 4],
  bus: [4, 4],
  njt: [4, 4],
  markets: [3, 2],
  history: [3, 2],
  quote: [3, 2],
  art: [2, 2],
  aqi: [2, 2],
  worldclock: [2, 4], // five fixed rows never fit a shallow card
  sports: [4, 4],
  worldcup: [4, 4],
  news: [4, 4],
};

export const DEFAULT_LAYOUT = Object.freeze([
  { id: 'weather', x: 0, y: 0, w: 4, h: 4 },
  { id: 'subway', x: 4, y: 0, w: 6, h: 4 },
  { id: 'worldclock', x: 10, y: 0, w: 2, h: 4 },
  { id: 'art', x: 0, y: 4, w: 4, h: 4 },
  { id: 'markets', x: 4, y: 4, w: 4, h: 4 },
  { id: 'news', x: 8, y: 4, w: 4, h: 4 },
].map(Object.freeze));

const int = (v, fallback = 0) => (Number.isInteger(v) ? v : fallback);

export function clampRect(rect) {
  const [mw, mh] = MIN_SIZE[rect.id] ?? [1, 1];
  let w = Math.min(Math.max(int(rect.w, mw), mw), GRID.cols);
  let h = Math.min(Math.max(int(rect.h, mh), mh), GRID.rows);
  let x = Math.min(Math.max(int(rect.x), 0), GRID.cols - w);
  let y = Math.min(Math.max(int(rect.y), 0), GRID.rows - h);
  return { id: rect.id, x, y, w, h };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function canPlace(layout, rect) {
  const [mw, mh] = MIN_SIZE[rect.id] ?? [1, 1];
  if (rect.w < mw || rect.h < mh) return false;
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > GRID.cols || rect.y + rect.h > GRID.rows) {
    return false;
  }
  return !layout.some((r) => r.id !== rect.id && rectsOverlap(r, rect));
}

export function firstFit(layout, id, [w, h]) {
  for (let y = 0; y <= GRID.rows - h; y++) {
    for (let x = 0; x <= GRID.cols - w; x++) {
      const rect = { id, x, y, w, h };
      if (canPlace(layout, rect)) return rect;
    }
  }
  return null;
}

export function normalizeLayout(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_LAYOUT];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || !(entry.id in MIN_SIZE) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const rect = clampRect(entry);
    if (canPlace(out, rect)) {
      out.push(rect);
    } else {
      const placed = firstFit(out, rect.id, [rect.w, rect.h]) ?? firstFit(out, rect.id, MIN_SIZE[rect.id]);
      if (placed) out.push(placed);
    }
  }
  return out.length ? out : [...DEFAULT_LAYOUT];
}

// Place rect, displacing colliders to make room ("push"). Each collider is
// shifted along the drag direction until clear; if that runs off the grid,
// it relocates first-fit. Cascades through chains. Returns a fresh layout,
// or null when the arrangement is unsolvable. Never mutates the input.
export function placeWithPush(layout, rect, dir = { dx: 0, dy: 0 }) {
  const [mw, mh] = MIN_SIZE[rect.id] ?? [1, 1];
  if (rect.w < mw || rect.h < mh) return null;
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > GRID.cols || rect.y + rect.h > GRID.rows) {
    return null;
  }
  const placed = [{ ...rect }];
  const pending = layout.filter((r) => r.id !== rect.id).map((r) => ({ ...r }));

  // Colliders shift in the dominant drag direction (default: down).
  const step = { x: Math.sign(dir.dx ?? 0), y: Math.sign(dir.dy ?? 0) };
  if (!step.x && !step.y) step.y = 1;

  let guard = 64; // cascade safety valve far above any real chain
  while (pending.length) {
    if (guard-- <= 0) return null;
    const idx = pending.findIndex((r) => placed.some((p) => rectsOverlap(p, r)));
    if (idx === -1) {
      placed.push(...pending);
      break;
    }
    const [collider] = pending.splice(idx, 1);
    // Try sliding along the push direction until clear of placed rects.
    let slid = null;
    for (
      let x = collider.x + step.x, y = collider.y + step.y;
      x >= 0 && y >= 0 && x + collider.w <= GRID.cols && y + collider.h <= GRID.rows;
      x += step.x, y += step.y
    ) {
      const candidate = { ...collider, x, y };
      if (!placed.some((p) => rectsOverlap(p, candidate))) {
        slid = candidate;
        break;
      }
    }
    // Fall back to first-fit against everything already settled.
    const settled = [...placed, ...pending];
    const spot = slid ?? firstFit(settled, collider.id, [collider.w, collider.h]);
    if (!spot) return null;
    placed.push({ ...collider, x: spot.x, y: spot.y });
  }
  // Preserve the original ordering for stable rendering.
  const byId = new Map(placed.map((r) => [r.id, r]));
  const order = layout.some((r) => r.id === rect.id) ? layout : [...layout, rect];
  return order.map((r) => byId.get(r.id)).filter(Boolean);
}

// v1 configs carried an ordered widget-id list; give known ids their template
// slot and pack the rest first-fit at minimum size.
export function migrateWidgetsToLayout(ids) {
  const out = [];
  const wanted = ids.filter((id, i) => id in MIN_SIZE && ids.indexOf(id) === i);
  for (const id of wanted) {
    const slot = DEFAULT_LAYOUT.find((d) => d.id === id);
    if (slot && canPlace(out, slot)) out.push({ ...slot });
  }
  for (const id of wanted) {
    if (out.some((r) => r.id === id)) continue;
    const placed = firstFit(out, id, MIN_SIZE[id]);
    if (placed) out.push(placed);
  }
  return out;
}
