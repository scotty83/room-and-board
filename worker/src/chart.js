// Statista "Chart of the Day". No feed exists, so this scrapes the listing
// page's infographic cards (data-infographic-panel-card blocks) and serves
// the newest one. The page is session-cookie gated (a 302 sets STATSESSID and
// bounces back), so fetchChart does one manual-redirect round to collect
// cookies, then refetches. Infographic images hotlink freely from
// cdn.statcdn.com (probe-verified: no cookie/referer checks) and carry the
// Statista branding baked in; the card adds a "Statista" credit line (their
// charts are CC BY-ND with attribution).

const PAGE = 'https://www.statista.com/chartoftheday/';
// Full browser UA: thin agents from datacenter egress get bounced by some
// CDNs (the AWS status lesson) — assume Statista is at least as picky.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// Curated per-topic slugs the /chart route accepts (label + slug). Each was
// verified to load the SSO chain and return live infographic cards; some slugs
// carry spaces (URL-encoded on fetch). Open vocabulary — there is no master
// list, so this is a hand-picked allowlist. Keep it alphabetical by label.
export const CHART_TOPICS = [
  ['Artificial Intelligence', 'artificial intelligence'],
  ['Business', 'business'],
  ['Consumer Goods', 'consumer goods'],
  ['E-Commerce', 'e-commerce'],
  ['Economy', 'economy'],
  ['Energy', 'energy'],
  ['Entertainment', 'entertainment'],
  ['Environment', 'environment'],
  ['Finance', 'finance'],
  ['Health', 'health'],
  ['Internet', 'internet'],
  ['Media', 'media'],
  ['Retail', 'retail'],
  ['Science', 'science'],
  ['Society', 'society'],
  ['Sports', 'sports'],
  ['Technology', 'technology'],
  ['Transportation', 'transportation'],
  ['Travel', 'travel'],
];
const TOPIC_SLUGS = new Set(CHART_TOPICS.map(([, slug]) => slug));

// Parse every infographic card on the page; return them newest-first (document
// order breaks a date tie) capped to the freshest ~10 so a client-side filter
// (e.g. hide-politics) always has a fallback and never blanks the card. Throws
// when nothing parses so the route's cached() falls back to the stale copy
// instead of caching junk.
export function mapChart(html) {
  const cards = [];
  const re = /href="\/chart\/(\d+)\/([a-z0-9-]+)\/"[^>]*[\s\S]{0,200}?data-infographic-panel-card([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const [, id, slug, body] = m;
    const alt = /alt="Infographic - ([^"]*)"/.exec(body);
    const date = /datetime="(\d{4}-\d{2}-\d{2})"/.exec(body);
    const desc = /<\/time>\s*<\/div>\s*([\s\S]*?)<span class="infographicsPanelCard__readMore"/.exec(body);
    if (!alt || !date) continue;
    cards.push({
      id,
      title: decode(alt[1]).trim().slice(0, 200),
      desc: decode((desc?.[1] ?? '').replace(/<[^>]*>/g, '')).trim().slice(0, 500),
      date: date[1],
      url: `https://cdn.statcdn.com/Infographic/images/normal/${id}.jpeg`,
      link: `https://www.statista.com/chart/${id}/${slug}/`,
    });
  }
  if (!cards.length) throw new Error('statista: no infographic cards parsed');
  // Stable newest-first: sort by date desc, keeping the original document order
  // for same-date cards (Array.prototype.sort is stable in V8/workerd).
  const charts = cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date < b.c.date ? 1 : a.c.date > b.c.date ? -1 : a.i - b.i))
    .slice(0, 10)
    .map(({ c }) => c);
  // Keep `chart` (the newest) beside `charts[]` so a client that only reads the
  // legacy singular field keeps working when this worker deploys ahead of the
  // new widget (e.g. prod worker updated, prod chart widget not yet).
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, chart: charts[0], charts };
}

// topic '' (default) hits the global listing; a validated slug re-points the
// scrape at the per-topic page. The route validates against CHART_TOPICS before
// calling here, but re-check so a bad slug can never smuggle path segments.
function topicUrl(topic) {
  if (!topic) return PAGE;
  if (!TOPIC_SLUGS.has(topic)) throw new Error(`statista: unknown topic "${topic}"`);
  return `${PAGE}${encodeURIComponent(topic)}/`;
}

export async function fetchChart(topic = '') {
  // The page bounces through /sso/iplogin and back, setting cookies at EVERY
  // hop (STATSESSID, __sso_iplogin, …). fetch's follow mode drops cookies
  // between hops, so walk the chain manually with a tiny cookie jar.
  const start = topicUrl(topic);
  const jar = new Map();
  let url = start;
  for (let hop = 0; hop < 6; hop += 1) {
    const headers = { 'User-Agent': UA, Accept: 'text/html' };
    if (jar.size) headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')].filter(Boolean)) {
      const pair = c.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (res.status >= 300 && res.status < 400) {
      url = new URL(res.headers.get('Location') ?? start, url).href;
      continue;
    }
    if (!res.ok) throw new Error(`statista ${res.status}`);
    return mapChart(await res.text());
  }
  throw new Error('statista: redirect loop (cookies rejected)');
}
