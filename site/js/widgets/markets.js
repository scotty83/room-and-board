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

// Sparkline SVG. Wide cards (twoDay) draw both sessions when the payload
// carries them (ix.split > 0): yesterday's segment DIMMED, today vivid — the
// boundary reads as faded-history|live-today — plus a soft rule at the day
// gap. Otherwise the compact last-session shape.
function sparkSvg(ix, up) {
  const two =
    ix.twoDay &&
    Array.isArray(ix.spark2) &&
    ix.spark2.length > 2 &&
    ix.split > 0 &&
    ix.split < ix.spark2.length;
  const series = two ? ix.spark2 : ix.spark;
  let paths;
  if (two) {
    const pts = sparkPts(series, 90, 28);
    const dx = sparkDividerX(series.length, ix.split).toFixed(1);
    // Both segments include the split point, so the line stays continuous;
    // the overnight jump (split-1 → split) belongs to the dimmed history.
    paths = `<path class="spark__prev" d="${toPath(pts.slice(0, ix.split + 1))}" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <path d="${toPath(pts.slice(ix.split))}" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <line class="spark__div" x1="${dx}" y1="-5" x2="${dx}" y2="33" vector-effect="non-scaling-stroke"/>`;
  } else {
    paths = `<path d="${sparkPath(series, 90, 28)}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  }
  return `<svg class="spark ${up ? 'spark--up' : 'spark--down'}" viewBox="0 0 90 28" preserveAspectRatio="none">
              ${paths}
            </svg>`;
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
            ${sparkSvg({ ...ix, twoDay }, up)}
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
