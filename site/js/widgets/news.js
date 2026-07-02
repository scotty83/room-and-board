// News headlines from user-selected sources. NYT feeds are CORS-open and
// fetched browser-direct; other outlets go through the Worker's whitelist
// proxy. RSS is parsed with a small regex parser (no DOMParser dependency,
// so the logic is unit-testable in Node).

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'news', title: 'Headlines', refreshMs: 10 * 60 * 1000 };

// id -> [label, kind, url-or-proxy-id, scope]
export const NEWS_SOURCES = [
  ['nyt-home', 'NYT Top Stories', 'direct', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 'National'],
  ['nyt-us', 'NYT U.S.', 'direct', 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml', 'National'],
  ['nyt-business', 'NYT Business', 'direct', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', 'National'],
  ['npr', 'NPR News', 'proxy', 'npr', 'National'],
  ['bbc', 'BBC World', 'proxy', 'bbc', 'National'],
  ['nyt-nyregion', 'NYT New York', 'direct', 'https://rss.nytimes.com/services/xml/rss/nyt/NYRegion.xml', 'Local NYC'],
  ['gothamist', 'Gothamist', 'proxy', 'gothamist', 'Local NYC'],
];

const SOURCE_BY_ID = Object.fromEntries(NEWS_SOURCES.map((s) => [s[0], s]));

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
  return perSource
    .flat()
    .filter((i) => i.t === 0 || i.t <= nowMs + 3600e3) // drop clock-skewed future items
    .sort((a, b) => b.t - a.t)
    .slice(0, max);
}

export function ageLabel(t, nowMs) {
  if (!t) return '';
  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function render(el, vm, _cfg) {
  if (!vm.items?.length) {
    el.innerHTML = '<div class="empty">No headlines — pick sources in Settings → Headlines</div>';
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('news', w, h);
  const nowMs = vm.nowMs ?? Date.now();
  el.innerHTML = vm.items
    .slice(0, cap)
    .map(
      (i) => `<div class="headline">
        <span class="headline__src">${escapeHtml(i.source)}</span>
        <span class="headline__title">${escapeHtml(i.title)}</span>
        <span class="headline__age">${escapeHtml(ageLabel(i.t, nowMs))}</span>
      </div>`,
    )
    .join('');
}

export async function fetchData(cfg, net) {
  const ids = cfg.news?.sources?.length ? cfg.news.sources : ['nyt-home'];
  const perSource = await Promise.all(
    ids.map(async (id) => {
      const src = SOURCE_BY_ID[id];
      if (!src) return [];
      const [, label, kind, ref] = src;
      try {
        if (kind === 'direct') {
          const res = await fetch(ref);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return parseRss(await res.text(), label);
        }
        const payload = await net.fetchJSON(`${WORKER_URL}/news/${ref}`);
        return parseRss(payload.xml ?? '', label);
      } catch {
        return []; // a dead source never blanks the card
      }
    }),
  );
  const nowMs = Date.now();
  return { items: mergeNews(perSource, nowMs), nowMs };
}
