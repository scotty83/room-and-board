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
  markets: listCapacity(78, 40),
  subway: listCapacity(58, 42),
  lirr: listCapacity(80, 56),
  mnr: listCapacity(80, 56),
  njt: listCapacity(80, 56),
  path: listCapacity(58, 44), // single-line rows, subway-like density
  ferry: listCapacity(80, 56), // two-line train rows
  bus: listCapacity(80, 56),
  history: listCapacity(64, 54),
  sports: listCapacity(94, 70),
  worldcup: listCapacity(60, 46),
  // Stacked rows: meta line + up to 2 title lines = 73.6px worst case (+gap);
  // shallow cards clamp titles to 1 line (47.4px + gap).
  news: listCapacity(75, 57),
  // Same stacked rows as news, but post texts are long by nature — nearly
  // every row wraps to the full 2 lines, and the +N hint needs headroom too.
  posts: listCapacity(90, 62),
  // Single-line 35px rows + 10px gap (shrunk so five zones fit a 3-tall
  // card); min height is 3 rows so tier s never applies.
  worldclock: listCapacity(45, 45),
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
      return `${n} headlines`;
    case 'posts':
      return `${n} posts`;
    case 'worldclock':
      return ofTotal(Math.min(n, cfg.worldclock?.cities?.length ?? n), cfg.worldclock?.cities?.length, 'cities');
    case 'weather':
      return h >= 5 ? '8 hourly · 5-day forecast' : `${w <= 4 ? 6 : 8} hourly · 2-day forecast`;
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
