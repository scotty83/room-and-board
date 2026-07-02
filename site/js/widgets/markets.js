// Markets widget: Dow / Nasdaq / S&P 500 via the Worker (upstream is the
// unofficial Yahoo Finance chart API — Worker-side only, cached, and this
// widget hides itself when the payload is unusable).

import { WORKER_URL } from '../env.js';
import { escapeHtml } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'markets', title: 'Markets', refreshMs: 5 * 60 * 1000 };

// Normalizes a series into an SVG path spanning w×h (padding baked in).
export function sparkPath(values, w, h) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    pad + (1 - (v - min) / span) * (h - 2 * pad),
  ]);
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function render(el, vm, _cfg) {
  const [w, h] = cardSize(el, [2, 1]);
  const cap = itemCapacity('markets', w, h);
  const shown = vm.indices.slice(0, cap);
  const hidden = vm.indices.length - shown.length;
  el.innerHTML = shown.length
    ? shown
        .map((ix) => {
          const up = ix.change >= 0;
          return `<div class="index">
            <div class="index__info">
              <span class="index__name">${escapeHtml(ix.name)}</span>
              <span class="index__price">${fmt.format(ix.price)}</span>
            </div>
            <svg class="spark ${up ? 'spark--up' : 'spark--down'}" viewBox="0 0 90 28" preserveAspectRatio="none">
              <path d="${sparkPath(ix.spark, 90, 28)}" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <span class="delta ${up ? 'delta--up' : 'delta--down'}">${up ? '▲' : '▼'} ${fmt.format(Math.abs(ix.change))} (${Math.abs(ix.changePct).toFixed(2)}%)</span>
          </div>`;
        })
        .join('') + (hidden > 0 ? `<div class="more-hint">+${hidden} more — enlarge the card to see them</div>` : '')
    : '<div class="empty">Market data unavailable</div>';
}

export function mapMarkets(payload) {
  if (!payload || payload.error || !Array.isArray(payload.indices)) {
    return { updatedAt: null, stale: true, indices: [] };
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

export async function fetchData(cfg, net) {
  const symbols = cfg.markets?.symbols ?? [];
  const query = symbols.length ? `?symbols=${symbols.join(',')}` : '';
  return mapMarkets(await net.fetchJSON(`${WORKER_URL}/markets${query}`));
}
