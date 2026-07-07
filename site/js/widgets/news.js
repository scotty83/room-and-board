// News headlines from user-selected sources. NYT feeds are CORS-open and
// fetched browser-direct; other outlets go through the Worker's whitelist
// proxy. RSS is parsed with a small regex parser (no DOMParser dependency,
// so the logic is unit-testable in Node).

import { renderHeadlines, fetchHeadlines } from './newscore.js';
export { parseRss, mergeNews, ageLabel } from './newscore.js'; // preserve existing test imports

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

export function render(el, vm, _cfg) {
  renderHeadlines(el, vm, { widgetId: 'news', emptyHint: 'No headlines — pick sources in Settings → Headlines' });
}

export async function fetchData(cfg, net) {
  const ids = cfg.news?.sources?.length ? cfg.news.sources : ['nyt-home'];
  return fetchHeadlines(ids, SOURCE_BY_ID, net);
}
