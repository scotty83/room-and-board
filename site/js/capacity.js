// Capacity model: how many items of a widget's primary list fit at a given
// card size. Renderers slice to this (data is removed on purpose, never
// clipped mid-row), and edit mode surfaces it so users see what a resize
// gains or loses. Counts are calibrated against the browser overflow audit.

// Usable body height in px for h grid rows (cell ≈ 216px after safe-bottom,
// minus card chrome: padding + title).
const bodyPx = (h) => h * 216 + (h - 1) * 20 - 90;

const listCapacity = (rowPx, compactRowPx) => (w, h) =>
  Math.max(1, Math.floor(bodyPx(h) / (h === 1 ? compactRowPx : rowPx)));

// Per-widget capacity of the primary list, or null when there isn't one.
const MODELS = {
  markets: listCapacity(78, 40),
  subway: listCapacity(58, 42),
  lirr: listCapacity(80, 56),
  mnr: listCapacity(80, 56),
  njt: listCapacity(80, 56),
  bus: listCapacity(80, 56),
  history: listCapacity(64, 54),
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
    case 'history':
      return `${n} events`;
    case 'weather':
      return h >= 3 ? '8 hourly · 5-day forecast' : `${w <= 2 ? 6 : 8} hourly · 2-day forecast`;
    default:
      return null;
  }
}

// Renderers read their card's size from the DOM (data-w/data-h set by the
// dashboard and by edit mode); tests render into bare divs and get defaults.
export function cardSize(el, defaults = [2, 2]) {
  const card = el.closest?.('.card');
  const w = Number(card?.dataset.w) || defaults[0];
  const h = Number(card?.dataset.h) || defaults[1];
  return [w, h];
}
