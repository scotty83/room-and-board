// RSS proxy for outlets without CORS headers. Whitelisted feeds only; the
// body is returned as text and parsed on the page.

const FEEDS = {
  gothamist: 'https://gothamist.com/feed',
  npr: 'https://feeds.npr.org/1001/rss.xml',
  bbc: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  cnbc: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
  marketwatch: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  'yahoo-finance': 'https://finance.yahoo.com/news/rssindex',
  seekingalpha: 'https://seekingalpha.com/feed.xml',
};

export function newsFeedUrl(id) {
  // Object.hasOwn so inherited keys ('constructor' matches the route regex)
  // don't resolve to a prototype member instead of null.
  return Object.hasOwn(FEEDS, id) ? FEEDS[id] : null;
}

export async function fetchNewsFeed(id) {
  const url = newsFeedUrl(id);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 board-pro-signage' } });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, xml: await res.text() };
}
