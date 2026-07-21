// Pure grid geometry for the 12×8 dashboard layout. Everything here is
// side-effect free; edit.js and config.js consume it.

import { itemCapacity } from './capacity.js';

// 12x8: cells ~135x92 logical px. v2 layouts (6x4) migrate by doubling.
export const GRID = { cols: 12, rows: 8 };

// Minimums are the smallest size each widget still renders legibly and without
// overflow, found empirically via the browser resize audit (see README testing
// notes) — deliberately far below the old 6×4 footprints so many more widgets
// fit on the board at once. Text-heavy widgets keep a 3-column floor so the
// primary fact stays readable at 6 ft; simple ones shrink to 2×2. A few need a
// taller floor: weather stacks a current block + hourly + daily (h≥4), bus and
// worldclock need h≥3 for their rows to fit. Re-run the audit before lowering
// any of these further.
export const MIN_SIZE = {
  weather: [3, 4],
  subway: [2, 2], // rows are bullet+text; at 2-wide the ⚠ hides (amber already signals) so alert clamps stay readable
  lirr: [3, 2],
  mnr: [3, 2],
  bus: [3, 3],
  njt: [3, 2],
  amtrak: [3, 2],
  path: [3, 2],
  ferry: [3, 2],
  markets: [3, 2],
  marketsnews: [3, 2],
  history: [2, 2],
  quote: [2, 2],
  wotd: [2, 3], // canonical shape; 3x2 also legal via MIN_ALTS
  art: [2, 2],
  landscapes: [2, 2],
  photos: [2, 2],
  gdrivephotos: [2, 2],
  apod: [3, 3],
  chart: [2, 4], // contain-fit infographic; 2-wide is a slim teaser (in-image text reads best at 3+)
  citibike: [3, 2],
  tfl: [3, 2],
  aqi: [2, 2],
  worldclock: [2, 3], // shortest card that fits a useful clock list (rows slice to fit)
  sports: [3, 2],
  worldcup: [3, 3], // two section labels (LIVE/UPCOMING) don't fit the 2-tall body budget
  golf: [3, 3],
  tennis: [3, 3],
  iptv: [3, 3],
  f1: [3, 4],
  news: [3, 2],
  substack: [3, 2],
  bsky: [3, 2],
  services: [3, 2],
};

// Nine widgets in four 3-wide columns, tiling all 96 cells. Re-tiled
// 2026-07-19 for the content-aware height caps: worldclock (5 default
// cities), markets (3 default tickers) and subway (3 default lines) each
// cap at 3 tall, so weather, art and lirr absorb the freed rows. Every
// size is overflow-audited.
export const DEFAULT_LAYOUT = Object.freeze([
  { id: 'weather', x: 0, y: 0, w: 3, h: 5 },
  { id: 'worldcup', x: 3, y: 0, w: 3, h: 3 },
  { id: 'worldclock', x: 6, y: 0, w: 3, h: 3 },
  { id: 'subway', x: 9, y: 0, w: 3, h: 3 },
  { id: 'sports', x: 3, y: 3, w: 3, h: 3 },
  { id: 'markets', x: 0, y: 5, w: 3, h: 3 },
  { id: 'art', x: 6, y: 3, w: 3, h: 5 },
  { id: 'lirr', x: 9, y: 3, w: 3, h: 5 },
  { id: 'history', x: 3, y: 6, w: 3, h: 2 },
].map(Object.freeze));

// Per-widget MAXIMUM footprint [w, h]; absent = the grid bounds. markets caps
// at 4 columns: wider just stretches empty space between the price, sparkline
// and delta — it stays a compact ticker block (the 2-day spark shows at 4).
// subway + services are single-fact status rows — beyond 3 columns the text
// just floats in space.
export const MAX_SIZE = {
  markets: [4, GRID.rows],
  subway: [3, GRID.rows],
  services: [3, GRID.rows],
};

// Content-aware max heights: for widgets whose list is bounded by config, the
// cap is the SMALLEST height whose capacity already shows everything the user
// follows — taller sizes can only add dead air (the bounded elastic row gaps
// absorb the sub-row remainder). The fit search starts at the height where the
// widget's full presentation lives: markets starts at h=3 because the h≤2
// shallow tier drops sparklines, and capping there would lock the richer view
// out. Returns a {id: maxH} map for the layout functions' optional `caps`
// parameter; widgets absent from the map keep their static bounds.
// [id, count-of-followed-list, search-floor]. Floors above the widget's MIN
// height mark where a REDUCED presentation lives below: markets h<=2 drops
// sparklines, sports h<=2 drops the "Last:" line — the cap must not lock the
// richer tier out. Subway/services keep alert/incident headroom through their
// deliberately generous capacity pitches, and both renderers shed rows to the
// corner badge when expanded rows overflow anyway.
const CONTENT_CAPPED = [
  ['worldclock', (cfg) => cfg?.worldclock?.cities?.length, 3],
  ['markets', (cfg) => cfg?.markets?.symbols?.length, 3],
  ['sports', (cfg) => cfg?.sports?.teams?.length, 3],
  ['services', (cfg) => cfg?.services?.list?.length, 2],
  ['citibike', (cfg) => cfg?.citibike?.stations?.length, 2],
  ['tfl', (cfg) => cfg?.tfl?.lines?.length, 2],
  ['subway', (cfg) => cfg?.subway?.lines?.length, 2],
];

export function contentMaxH(cfg) {
  const caps = {};
  const fit = (id, n, fromH) => {
    for (let h = fromH; h <= GRID.rows; h++) {
      if ((itemCapacity(id, MIN_SIZE[id][0], h) ?? Infinity) >= n) return h;
    }
    return GRID.rows;
  };
  for (const [id, countOf, fromH] of CONTENT_CAPPED) {
    const n = countOf(cfg);
    if (n) caps[id] = fit(id, n, Math.max(fromH, MIN_SIZE[id][1]));
  }
  return caps;
}

// Orientation-alternative minimums: some widgets don't fit their smallest
// square but work in EITHER portrait or landscape (wotd text never fits 2x2;
// 2x3 or 3x2 both do). First alternative is the canonical shape — MIN_SIZE
// carries it so single-min consumers stay simple; meetsMin/firstFitAny and
// clampRect understand the full set.
export const MIN_ALTS = {
  wotd: [[2, 3], [3, 2]],
};
export const minAlternatives = (id) => MIN_ALTS[id] ?? [MIN_SIZE[id] ?? [1, 1]];
export const meetsMin = (id, w, h) => minAlternatives(id).some(([mw, mh]) => w >= mw && h >= mh);

const maxOf = (id, caps) => {
  const [Mw, Mh] = MAX_SIZE[id] ?? [GRID.cols, GRID.rows];
  const dyn = caps?.[id];
  return [Mw, dyn ? Math.min(Mh, dyn) : Mh];
};

const int = (v, fallback = 0) => (Number.isInteger(v) ? v : fallback);

export function clampRect(rect, caps) {
  const [fw, fh] = minAlternatives(rect.id)[0];
  const [Mw, Mh] = maxOf(rect.id, caps);
  // Grow an undersized rect toward whichever minimum alternative costs the
  // least added area (ties go to the canonical first entry).
  const rw = int(rect.w, fw);
  const rh = int(rect.h, fh);
  let best = null;
  for (const [mw, mh] of minAlternatives(rect.id)) {
    const nw = Math.max(rw, mw);
    const nh = Math.max(rh, mh);
    const growth = nw * nh - rw * rh;
    if (!best || growth < best.growth) best = { nw, nh, growth };
  }
  let w = Math.min(best.nw, Mw, GRID.cols);
  let h = Math.min(best.nh, Mh, GRID.rows);
  let x = Math.min(Math.max(int(rect.x), 0), GRID.cols - w);
  let y = Math.min(Math.max(int(rect.y), 0), GRID.rows - h);
  return { id: rect.id, x, y, w, h };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function canPlace(layout, rect, caps) {
  const [Mw, Mh] = maxOf(rect.id, caps);
  if (!meetsMin(rect.id, rect.w, rect.h) || rect.w > Mw || rect.h > Mh) return false;
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > GRID.cols || rect.y + rect.h > GRID.rows) {
    return false;
  }
  return !layout.some((r) => r.id !== rect.id && rectsOverlap(r, rect));
}

export function firstFit(layout, id, [w, h], caps) {
  for (let y = 0; y <= GRID.rows - h; y++) {
    for (let x = 0; x <= GRID.cols - w; x++) {
      const rect = { id, x, y, w, h };
      if (canPlace(layout, rect, caps)) return rect;
    }
  }
  return null;
}

// firstFit trying each minimum alternative in order (canonical first).
export function firstFitAny(layout, id, caps) {
  for (const alt of minAlternatives(id)) {
    const rect = firstFit(layout, id, alt, caps);
    if (rect) return rect;
  }
  return null;
}

export function normalizeLayout(raw, caps) {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_LAYOUT];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || !(entry.id in MIN_SIZE) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const rect = clampRect(entry, caps);
    if (canPlace(out, rect, caps)) {
      out.push(rect);
    } else {
      const placed = firstFit(out, rect.id, [rect.w, rect.h], caps) ?? firstFitAny(out, rect.id, caps);
      if (placed) out.push(placed);
    }
  }
  return out.length ? out : [...DEFAULT_LAYOUT];
}

// Place rect, displacing colliders to make room ("push"). Each collider is
// shifted along the drag direction until clear; if that runs off the grid,
// it relocates first-fit. Cascades through chains. Returns a fresh layout,
// or null when the arrangement is unsolvable. Never mutates the input.
export function placeWithPush(layout, rect, dir = { dx: 0, dy: 0 }, caps) {
  const [Mw, Mh] = maxOf(rect.id, caps);
  if (!meetsMin(rect.id, rect.w, rect.h) || rect.w > Mw || rect.h > Mh) return null;
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
