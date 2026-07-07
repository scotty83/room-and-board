// Markets/finance headlines from selectable outlets. Reuses the shared news
// engine (newscore.js); non-CORS feeds go through the Worker proxy.
import { renderHeadlines, fetchHeadlines } from './newscore.js';

export const meta = { id: 'marketsnews', title: 'Markets News', refreshMs: 10 * 60 * 1000 };

// [id, label, kind, url-or-proxy-id, audience]
export const MARKET_SOURCES = [
  ['mw', 'MarketWatch', 'proxy', 'marketwatch', 'Professional'],
  ['sa', 'Seeking Alpha', 'proxy', 'seekingalpha', 'Professional'],
  ['cnbc', 'CNBC', 'proxy', 'cnbc', 'General'],
  ['nyt-business', 'NYT Business', 'direct', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', 'General'],
  ['yahoo-finance', 'Yahoo Finance', 'proxy', 'yahoo-finance', 'General'],
];
export const DEFAULT_MARKET_SOURCES = ['cnbc', 'nyt-business'];
const SOURCE_BY_ID = Object.fromEntries(MARKET_SOURCES.map((s) => [s[0], s]));

export function render(el, vm, _cfg) {
  renderHeadlines(el, vm, { widgetId: 'marketsnews', emptyHint: 'No markets news — pick sources in Settings → Markets News' });
}
export async function fetchData(cfg, net) {
  const ids = cfg.marketsnews?.sources?.length ? cfg.marketsnews.sources : DEFAULT_MARKET_SOURCES;
  return fetchHeadlines(ids, SOURCE_BY_ID, net);
}
