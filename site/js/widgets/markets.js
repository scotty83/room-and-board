// Markets widget: Dow / Nasdaq / S&P 500 via the Worker (upstream is the
// unofficial Yahoo Finance chart API — Worker-side only, cached, and this
// widget hides itself when the payload is unusable).

import { WORKER_URL } from '../env.js';
import { escapeHtml, fmtClock, setCardNote, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'markets', title: 'Markets', refreshMs: 5 * 60 * 1000 };

// Normalizes a series into [x, y] points spanning w×h (padding baked in).
function sparkPts(values, w, h) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  return values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    pad + (1 - (v - min) / span) * (h - 2 * pad),
  ]);
}
const toPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

// Normalizes a series into an SVG path spanning w×h.
export function sparkPath(values, w, h) {
  return toPath(sparkPts(values, w, h));
}

// X (in a w-wide viewBox) of the yesterday|today divider: the midpoint of the
// gap between the last prior-session point (split-1) and the first today point
// (split), matching sparkPath's index→x mapping.
export function sparkDividerX(len, split, w = 90, pad = 2) {
  const step = (w - 2 * pad) / (len - 1);
  return pad + (split - 0.5) * step;
}

// Y (in the 28-tall viewBox) of a value, using a series' own min/max — matches
// sparkPts' value→y mapping, so a value in `values` lands on its plotted point.
export function yForValue(val, values, h = 28, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return pad + (1 - (val - min) / span) * (h - 2 * pad);
}

// Splits a polyline into GREEN (at/above the baseline) and RED (below) subpaths,
// cutting each segment exactly where it crosses the baseline y. Pure geometry
// with plain <path> data — deliberately NO SVG clip-paths, which the board's
// gen1 WebEngine renders unreliably (a crossing line dropped out entirely).
export function colorSplit(pts, yBase) {
  let up = '';
  let down = '';
  const push = (above, x1, y1, x2, y2) => {
    const s = `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
    if (above) up += s; else down += s;
  };
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const a1 = y1 <= yBase; // smaller y = higher price = above the baseline (green)
    const a2 = y2 <= yBase;
    if (a1 === a2) {
      push(a1, x1, y1, x2, y2);
    } else {
      const xc = x1 + ((yBase - y1) / (y2 - y1)) * (x2 - x1); // x where it crosses
      push(a1, x1, y1, xc, yBase);
      push(a2, xc, yBase, x2, y2);
    }
  }
  return { up, down };
}

// Sparkline SVG. The CURRENT session is coloured against the prior close: green
// where the price sits above it, red where below, cut cleanly at the crossing
// so an intraday move that dips through the baseline shows BOTH colours. Wide
// cards (twoDay) draw the prior session in WHITE ahead of a dashed day-boundary
// rule; compact cards draw today alone, coloured the same way.
function sparkSvg(ix) {
  const two =
    ix.twoDay &&
    Array.isArray(ix.spark2) &&
    ix.spark2.length > 2 &&
    ix.split > 0 &&
    ix.split < ix.spark2.length;
  const series = two ? ix.spark2 : ix.spark;
  const pts = sparkPts(series, 90, 28);
  if (pts.length < 2) return '<svg class="spark" viewBox="0 0 90 28" preserveAspectRatio="none"></svg>';
  // Colour baseline = the prior close. Two-day: yesterday's last bar (the split
  // point); compact: price − change. The current segment starts there, so the
  // overnight move reads as part of today.
  const baseVal = two ? series[ix.split - 1] : ix.price - ix.change;
  const yBase = yForValue(baseVal, series);
  const { up, down } = colorSplit(two ? pts.slice(ix.split - 1) : pts, yBase);
  const today =
    (up ? `<path class="spark__up" d="${up}" fill="none" stroke-width="1.5"/>` : '') +
    (down ? `<path class="spark__down" d="${down}" fill="none" stroke-width="1.5"/>` : '');
  let extras = '';
  if (two) {
    const dx = sparkDividerX(series.length, ix.split).toFixed(1);
    extras = `<path class="spark__prev" d="${toPath(pts.slice(0, ix.split))}" fill="none" stroke-width="1.5"/>` +
      `<line class="spark__div" x1="${dx}" y1="-5" x2="${dx}" y2="33" vector-effect="non-scaling-stroke"/>`;
  }
  return `<svg class="spark" viewBox="0 0 90 28" preserveAspectRatio="none">${extras}${today}</svg>`;
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function render(el, vm, cfg) {
  // Freshness note in the card header (worker fetch time, not render time) —
  // a clock reading, so it honors cfg.clock24.
  if (vm.updatedAt) setCardNote(el, `as of ${fmtClock(vm.updatedAt, cfg?.clock24)}`);
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('markets', w, h);
  const shown = vm.indices.slice(0, cap);
  const hidden = vm.indices.length - shown.length;
  // At full width (4 cols — markets caps there, see MAX_SIZE) show the
  // two-session sparkline; the 3-wide min keeps the compact last-session shape.
  const twoDay = w >= 4;
  // Rows render display:contents inside one .indexes grid so every row shares
  // the same column tracks — otherwise the auto-sized delta column would shift
  // each row's sparkline independently (594.83 vs 0.01 wide deltas).
  el.innerHTML = shown.length
    ? `<div class="indexes" style="--n:${shown.length}">` + shown
        .map((ix) => {
          const up = ix.change >= 0;
          return `<div class="index">
            <div class="index__info">
              <span class="index__name">${escapeHtml(ix.name)}</span>
              <span class="index__price">${fmt.format(ix.price)}</span>
            </div>
            ${sparkSvg({ ...ix, twoDay })}
            <span class="delta delta__chg ${up ? 'delta--up' : 'delta--down'}">${up ? '▲' : '▼'} ${fmt.format(Math.abs(ix.change))}</span>
            <span class="delta delta__pct ${up ? 'delta--up' : 'delta--down'}">(${Math.abs(ix.changePct).toFixed(2)}%)</span>
          </div>`;
        })
        .join('') + '</div>'
    : '<div class="empty">Market data unavailable</div>';
  setMoreBadge(el, shown.length ? hidden : 0);
}

export function mapMarkets(payload) {
  if (!payload || payload.error || !Array.isArray(payload.indices)) {
    // Throw rather than return an empty sentinel: startWidget's catch then
    // preserves the last-good cache + stale mark, instead of a blank payload
    // overwriting good data (and leaving a stale "as of" note in the header).
    throw new Error('markets: unusable payload');
  }
  const indices = payload.indices.filter(
    (ix) =>
      typeof ix?.symbol === 'string' &&
      typeof ix?.name === 'string' &&
      Number.isFinite(ix?.price) &&
      Number.isFinite(ix?.change) &&
      Number.isFinite(ix?.changePct) &&
      Array.isArray(ix?.spark),
  );
  return { updatedAt: payload.updatedAt ?? null, stale: Boolean(payload.stale), indices };
}

// True when the quote source recognizes the symbol. Both settings surfaces
// validate adds with this — a syntactically-valid unknown ticker otherwise
// saves fine and then silently never appears on the card.
// User notation -> Yahoo symbol. Strips a $ prefix ($AAPL); maps a £ prefix to
// the London Stock Exchange suffix (£CBG -> CBG.L — Yahoo keys LSE listings
// with .L, and UK users write their tickers with a leading £).
export function normalizeSymbol(raw) {
  let t = String(raw ?? '').trim().toUpperCase();
  if (t.startsWith('$')) t = t.slice(1);
  if (t.startsWith('£')) {
    t = t.slice(1);
    if (!t.endsWith('.L')) t += '.L';
  }
  return t;
}

export async function symbolKnown(symbol, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${WORKER_URL}/markets?symbols=${encodeURIComponent(symbol)}`);
    if (!res.ok) return false;
    const payload = await res.json();
    return Array.isArray(payload.indices) && payload.indices.some((ix) => ix.symbol === symbol);
  } catch {
    return false;
  }
}

export async function fetchData(cfg, net) {
  const symbols = cfg.markets?.symbols ?? [];
  const query = symbols.length ? `?symbols=${symbols.map(encodeURIComponent).join(',')}` : '';
  return mapMarkets(await net.fetchJSON(`${WORKER_URL}/markets${query}`));
}
