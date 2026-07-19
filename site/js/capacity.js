// Capacity model: how many items of a widget's primary list fit at a given
// card size. Renderers slice to this (data is removed on purpose, never
// clipped mid-row), and edit mode surfaces it so users see what a resize
// gains or loses. Counts are calibrated against the browser overflow audit.

// Usable body height in px for h grid rows on the 12x8 canvas (cell ≈ 92px
// tall after the safe-bottom reserve, minus card chrome: padding + title).
const bodyPx = (h) => h * 92 + (h - 1) * 20 - 90;

// Height tiers drive both row counts and the compact CSS variants:
// s = shallow (h<=2, old single-row), m = medium (3-4), l = tall (5+).
export const sizeTier = (h) => (h <= 2 ? 's' : h <= 4 ? 'm' : 'l');

const listCapacity = (rowPx, compactRowPx) => (w, h) =>
  Math.max(1, Math.floor(bodyPx(h) / (sizeTier(h) === 's' ? compactRowPx : rowPx)));

// Per-widget capacity of the primary list, or null when there isn't one.
const MODELS = {
  // ~67px row pitch (name+price stacked over a 28px spark, +10px row-gap) with
  // headroom for the "+N more" hint. 69 (was a too-tall 78) makes a 4x3 fit 3
  // index rows instead of 2 — verified overflow-safe with the hint at 3–8 tall.
  // Markets rows are width-sensitive: the 3-wide stacked variant trims to
  // ~61px rows + 8px gaps (data-w=3 CSS), the 4-wide classic runs the 69px
  // pitch, and shallow spark-less rows 36 (fits all 3 tickers at 3x2).
  // Browser-calibrated (6-ticker fixture, w3/w4 x h3-6): a 3x4 shows 5.
  markets: (w, h) =>
    Math.max(1, sizeTier(h) === 's'
      ? Math.floor(bodyPx(h) / 36)
      : w <= 3
        ? Math.floor((bodyPx(h) + 8) / 69)
        : Math.floor(bodyPx(h) / 69)),
  subway: listCapacity(58, 42),
  lirr: listCapacity(80, 56),
  mnr: listCapacity(80, 56),
  njt: listCapacity(80, 56),
  amtrak: listCapacity(80, 56), // two-line train rows, same pitch as the other rail boards
  path: listCapacity(58, 44), // single-line rows, subway-like density
  ferry: listCapacity(80, 56), // two-line train rows
  // Row budget shared between each stop's header (~28px) and its arrival rows
  // (~41px). It borrowed lirr/mnr's 80px two-line pitch, which ~halved what
  // fits; 50 is the measured safe average (never overflows worst-case configs
  // 3x3–4x8, hint included) — e.g. a 3x3 now packs 5 rows, not 2.
  bus: listCapacity(50, 56),
  history: listCapacity(64, 54),
  // 74px pitch (was a too-tall 94 that estimated ~row+gap far above the ~66px
  // t-m rows) makes a 3×3 fit 3 teams instead of 2 — verified worst-case
  // (all-3-line rows) overflow-safe with the t-m font compaction below.
  // Shallow rows are compact (no Last line, 32px logo) — 2 teams fit a 3×2.
  sports: listCapacity(74, 55),
  worldcup: listCapacity(60, 46),
  // Stacked rows: meta line + up to 2 title lines = 73.6px worst case (+gap);
  // shallow cards clamp titles to 1 line (47.4px + gap).
  news: listCapacity(75, 57),
  // Markets News renders the identical stacked-headline rows as news.
  marketsnews: listCapacity(75, 57),
  // Same stacked rows as news, but post texts are long by nature — nearly
  // every row wraps to the full 2 lines, and the +N hint needs headroom too.
  substack: listCapacity(90, 62),
  bsky: listCapacity(90, 62),
  // Single-line 35px rows + 10px gap (shrunk so five zones fit a 3-tall
  // card); min height is 3 rows so tier s never applies.
  worldclock: listCapacity(45, 45),
  // Calibrated to the TYPICAL all-Operational row (~44px incl gap) so the
  // edit-mode label matches what actually renders (52 budgeted worst-case
  // degraded rows — a 3×3 promised 4 but showed 5). The renderer measures
  // and trims when incident notes make rows taller, so an optimistic static
  // estimate is safe; the corner badge covers what gets trimmed.
  services: listCapacity(45, 40),
  citibike: listCapacity(44, 40),
  tfl: listCapacity(44, 40),
};

export function itemCapacity(id, w, h) {
  const model = MODELS[id];
  return model ? model(w, h) : null;
}

function ofTotal(shown, total, unit) {
  if (total == null) return `next ${shown} ${unit}`;
  return shown >= total ? `shows all ${total} ${unit}` : `shows ${shown} of ${total} ${unit}`;
}

// Human impact line for edit mode. cfg supplies totals where they're known.
export function capacityLabel(id, w, h, cfg = {}) {
  const n = itemCapacity(id, w, h);
  switch (id) {
    case 'markets':
      return ofTotal(Math.min(n, cfg.markets?.symbols?.length ?? n), cfg.markets?.symbols?.length, 'tickers');
    case 'subway':
      return ofTotal(Math.min(n, cfg.subway?.lines?.length ?? n), cfg.subway?.lines?.length, 'lines');
    case 'lirr':
    case 'mnr':
    case 'njt':
    case 'amtrak':
      return `next ${n} trains`;
    case 'bus':
      return `next ${n} buses`;
    case 'path':
      return `next ${n} trains`;
    case 'ferry':
      return `next ${n} ferries`;
    case 'history':
      return `${n} events`;
    case 'sports':
      return ofTotal(Math.min(n, cfg.sports?.teams?.length ?? n), cfg.sports?.teams?.length, 'teams');
    case 'worldcup':
      return `${n} matches`;
    case 'news':
    case 'marketsnews':
      return `${n} headlines`;
    case 'substack':
    case 'bsky':
      return `${n} posts`;
    case 'worldclock':
      return ofTotal(Math.min(n, cfg.worldclock?.cities?.length ?? n), cfg.worldclock?.cities?.length, 'cities');
    case 'services':
      return ofTotal(Math.min(n, cfg.services?.list?.length ?? n), cfg.services?.list?.length, 'services');
    case 'citibike':
      return ofTotal(Math.min(n, cfg.citibike?.stations?.length ?? n), cfg.citibike?.stations?.length, 'stations');
    case 'tfl':
      return ofTotal(Math.min(n, cfg.tfl?.lines?.length ?? n), cfg.tfl?.lines?.length, 'lines');
    case 'weather': {
      // Must match weather.js render exactly: big = w>=5||h>=5 → 8 hourly/5 days,
      // else 6 hourly/4 days. (Was hardcoded "2-day" with a mismatched threshold.)
      const big = w >= 5 || h >= 5;
      return `${big ? 8 : 6} hourly · ${big ? 5 : 4}-day forecast`;
    }
    default:
      return null;
  }
}

// Renderers read their card's size from the DOM (data-w/data-h set by the
// dashboard and by edit mode); tests render into bare divs and get defaults.
export function cardSize(el, defaults = [4, 4]) {
  const card = el.closest?.('.card');
  const w = Number(card?.dataset.w) || defaults[0];
  const h = Number(card?.dataset.h) || defaults[1];
  return [w, h];
}
