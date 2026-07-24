// Shared news engine: RSS parse + merge, and a parameterized headline
// render/fetch reused by the Headlines and Markets-news widgets.
import { escapeHtml, setMoreBadge } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

// Minimal RSS <item> parser: title, pubDate, and (for the tap-to-read story
// view) the article link + a short description/summary. Handles CDATA.
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
    // link is a bare URL; description is a summary (HTML stripped by pick). Both
    // optional — some feeds omit the summary (Seeking Alpha), a few the link.
    const link = pick(block, 'link');
    items.push({ title, t, source: sourceLabel, link: /^https?:/i.test(link) ? link : '', desc: pick(block, 'description') });
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
    el.innerHTML = `<div class="empty" data-setup="${widgetId}">${emptyHint}</div>`;
    return;
  }
  const nowMs = vm.nowMs ?? Date.now();
  // Source + age stack above the full-width headline so neither ever
  // squeezes the other (at 3 cols the old side-by-side row truncated both).
  // A story with a link or summary is tappable (opens the full-screen story
  // view); carry those on the element so the delegated handler can read them.
  const itemHtml = (i, clamp) => {
    const more = i.link || i.desc;
    return `<div class="headline${clamp ? ' headline--clamp' : ''}${more ? ' headline--more' : ''}"${i.link ? ` data-link="${escapeHtml(i.link)}"` : ''}${i.desc ? ` data-desc="${escapeHtml(i.desc)}"` : ''}>
        <div class="headline__meta">
          <span class="headline__src">${escapeHtml(i.source)}</span>
          <span class="headline__age">${escapeHtml(ageLabel(i.t, nowMs))}</span>
        </div>
        <span class="headline__title">${escapeHtml(i.title)}</span>
      </div>`;
  };
  // Markup for the first n items. The overflow count rides the title badge
  // (setMoreBadge below), so it costs no row and isn't part of the measure.
  // clampLast renders the final item with its title clamped to one line.
  const build = (n, clampLast = false) =>
    vm.items.slice(0, n).map((it, idx) => itemHtml(it, clampLast && idx === n - 1)).join('');
  // Static estimate from the capacity model. This is the final answer when
  // there's no rendered box to measure (e.g. happy-dom in tests).
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity(widgetId, w, h) ?? 4;
  let n = Math.min(vm.items.length, cap);
  el.innerHTML = build(n);
  // Fill-to-fit: with a real rendered box, grow/shrink to the count that
  // actually fits. The static 75px/row estimate assumes worst-case two-line
  // titles; most titles are one line, so the card usually has room for more.
  if (el.clientHeight > 0) {
    while (n > 1 && el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); }
    while (n < vm.items.length) {
      n += 1;
      el.innerHTML = build(n);
      if (el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); break; }
    }
    // The loops fit whole rows, so when the next item doesn't fit, up to a
    // full two-line headline of slack can sit empty (visible on a 3x4 board
    // card). Spend it on one more item with its title clamped to a single
    // ellipsized line — a truncated headline beats blank space.
    if (n < vm.items.length) {
      n += 1;
      el.innerHTML = build(n, true);
      if (el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); }
    }
  }
  setMoreBadge(el, vm.items.length - n);
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
