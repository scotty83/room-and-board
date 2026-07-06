// Substack publication posts. The API is keyless JSON but sends no CORS
// headers, 301s to custom domains, and expects a browser UA — so boards get
// this Worker digest instead.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export function mapSubstackPosts(json) {
  const posts = (Array.isArray(json) ? json : [])
    .map((p) => ({
      title: String(p?.title ?? '').trim(),
      subtitle: p?.subtitle ? String(p.subtitle).trim() : '',
      t: Math.floor((Date.parse(p?.post_date ?? '') || 0) / 1000),
    }))
    .filter((p) => p.title);
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, posts: posts.slice(0, 12) };
}

export async function fetchSubstackPosts(slug) {
  const res = await fetch(`https://${slug}.substack.com/api/v1/posts?limit=12`, {
    redirect: 'follow',
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`substack ${res.status}`);
  return mapSubstackPosts(await res.json());
}
