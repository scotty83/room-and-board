// NASA Astronomy Picture of the Day. A 7-day window is fetched in one call and
// the newest image-type entry is served (video days — ~10% — carry no image,
// so we skip them). Free key with a DEMO_KEY fallback; cached 1h at the route.
// See spec docs/superpowers/specs/2026-07-11-nasa-daily-photo-design.md.

export function mapApod(json) {
  const list = Array.isArray(json) ? json : json ? [json] : [];
  // The window is date-ascending, so scan from the end for the newest image.
  let pick = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.media_type === 'image' && list[i]?.url) { pick = list[i]; break; }
  }
  const photo = pick ? {
    url: String(pick.url),
    title: String(pick.title ?? ''),
    explanation: String(pick.explanation ?? ''),
    credit: String(pick.copyright ?? '').trim(),
    date: String(pick.date ?? ''),
  } : null;
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, photo };
}

export async function fetchApod(env) {
  const key = env.NASA_KEY || 'DEMO_KEY';
  const DAY = 86400e3;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  const start = iso(now - 6 * DAY);
  const call = (end) => fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}&start_date=${start}&end_date=${end}`);
  // APOD posts on US/Eastern "today"; a UTC end_date=today 400s before the new
  // post exists — retry the window ending yesterday.
  let res = await call(iso(now));
  if (res.status === 400) res = await call(iso(now - DAY));
  if (!res.ok) throw new Error(`apod ${res.status}`);
  return mapApod(await res.json());
}
