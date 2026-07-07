// Shared news engine: RSS parse + merge, and a parameterized headline
// render/fetch reused by the Headlines and Markets-news widgets.
import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

// Minimal RSS <item> parser: title, link-free, pubDate. Handles CDATA.
export function parseRss(xml, sourceLabel) {
  const items = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/g;
  const pick = (block, tag) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
    if (!m) return '';
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  };
  for (const block of xml.match(itemRe) ?? []) {
    const title = pick(block, 'title');
    if (!title) continue;
    const t = Date.parse(pick(block, 'pubDate')) || 0;
    items.push({ title, t, source: sourceLabel });
  }
  return items;
}

export function mergeNews(perSource, nowMs, max = 30) {
  // Overlapping feeds (e.g. NYT Top Stories + NYT New York) carry the same
  // story; dedupe by normalized title after the newest-first sort so the
  // freshest copy wins and rows are never wasted on repeats.
  const seen = new Set();
  return perSource
    .flat()
    .filter((i) => i.t === 0 || i.t <= nowMs + 3600e3) // drop clock-skewed future items
    .sort((a, b) => b.t - a.t)
    .filter((i) => {
      const key = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      // Non-ASCII text (emoji-only, CJK, Cyrillic posts) normalizes to '';
      // don't let the first such item claim that key and drop all the rest.
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

export function ageLabel(t, nowMs) {
  if (!t) return '';
  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function renderHeadlines(el, vm, { widgetId, emptyHint }) {
  if (!vm.items?.length) {
    el.innerHTML = `<div class="empty">${emptyHint}</div>`;
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity(widgetId, w, h);
  const nowMs = vm.nowMs ?? Date.now();
  // When there's more than fits, reserve a row for the hint so it never
  // overflows a body that the capacity model has already filled exactly.
  const overflow = vm.items.length > cap;
  const shown = vm.items.slice(0, overflow ? Math.max(1, cap - 1) : cap);
  const hidden = vm.items.length - shown.length;
  // Source + age stack above the full-width headline so neither ever
  // squeezes the other (at 3 cols the old side-by-side row truncated both).
  el.innerHTML = shown
    .map(
      (i) => `<div class="headline">
        <div class="headline__meta">
          <span class="headline__src">${escapeHtml(i.source)}</span>
          <span class="headline__age">${escapeHtml(ageLabel(i.t, nowMs))}</span>
        </div>
        <span class="headline__title">${escapeHtml(i.title)}</span>
      </div>`,
    )
    .join('') + (hidden > 0 ? `<div class="more-hint">+${hidden} more — enlarge the card</div>` : '');
}

export async function fetchHeadlines(ids, sourceById, net) {
  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      const src = sourceById[id];
      if (!src) return [];
      const [, label, kind, ref] = src;
      if (kind === 'direct') {
        // net.fetchText applies the 15s timeout — a bare fetch() on a hung
        // NYT connection would stall the whole refresh cycle indefinitely.
        return parseRss(await net.fetchText(ref), label);
      }
      const payload = await net.fetchJSON(`${WORKER_URL}/news/${ref}`);
      return parseRss(payload.xml ?? '', label);
    }),
  );
  const perSource = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  // Every source failed (not merely empty): throw so the stale cache survives.
  if (ids.length && !perSource.some((p) => p.length) && settled.some((s) => s.status === 'rejected')) {
    throw new Error('news: all sources failed');
  }
  const nowMs = Date.now();
  return { items: mergeNews(perSource, nowMs), nowMs };
}
