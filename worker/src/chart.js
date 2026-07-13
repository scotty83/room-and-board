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

// Parse every infographic card on the page; return the newest by publish date
// (first in document order wins a tie). Throws when nothing parses so the
// route's cached() falls back to the stale copy instead of caching junk.
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
  const chart = cards.reduce((best, c) => (c.date > best.date ? c : best), cards[0]);
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, chart };
}

export async function fetchChart() {
  // The page bounces through /sso/iplogin and back, setting cookies at EVERY
  // hop (STATSESSID, __sso_iplogin, …). fetch's follow mode drops cookies
  // between hops, so walk the chain manually with a tiny cookie jar.
  const jar = new Map();
  let url = PAGE;
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
      url = new URL(res.headers.get('Location') ?? PAGE, url).href;
      continue;
    }
    if (!res.ok) throw new Error(`statista ${res.status}`);
    return mapChart(await res.text());
  }
  throw new Error('statista: redirect loop (cookies rejected)');
}
