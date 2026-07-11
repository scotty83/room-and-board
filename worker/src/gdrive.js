// Google Drive public-folder ingest. A folder shared "anyone with the link"
// lists via the official files API with just an operator key (GDRIVE_KEY —
// free, unlike Flickr's paid gate), and each file's thumbnailLink re-sized to
// =s2048 serves the full-quality JPEG keylessly from Google's CDN — boards
// hotlink it directly (spike-verified from the worker AND a roomboard.app
// <img>; see spec 2026-07-10-gdrive-photo-source-design.md). thumbnailLink
// URLs are short-lived (order of hours), so the digest is cached only 1800 s
// at the route — the same regenerate-before-expiry defense as /icloud/album.

const MAX_PHOTOS = 60;

export function mapGdriveAlbum(json) {
  const photos = [];
  for (const f of json?.files ?? []) {
    const w = Number(f.imageMediaMetadata?.width);
    const h = Number(f.imageMediaMetadata?.height);
    // Same "skip unusable" rule as iCloud: no thumbnail or no dimensions →
    // nothing the board can lay out.
    if (!f.thumbnailLink || !w || !h) continue;
    photos.push({
      url: f.thumbnailLink.replace(/=s\d+.*$/, '=s2048'),
      w,
      h,
      ar: Math.round((w / h) * 1000) / 1000,
      // Drive has no real captions, only filenames ("pexels-pixabay-462162"…)
      // — noise on a board, so photos render caption-less (unlike iCloud,
      // where captions are user-written). The digest field stays for shape.
      caption: '',
      date: String(f.createdTime ?? ''),
    });
    if (photos.length >= MAX_PHOTOS) break;
  }
  // The query orders by createdTime desc, so the newest photos are already
  // first — no re-sort (and the cap keeps the newest 60 of larger folders).
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, photos };
}

export async function fetchGdriveAlbum(env, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/'`);
  const fields = encodeURIComponent(
    'files(id,name,mimeType,createdTime,thumbnailLink,imageMediaMetadata(width,height))',
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime%20desc&pageSize=100&key=${env.GDRIVE_KEY}`,
  );
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`gdrive ${res.status} ${json.error?.message ?? ''}`);
  return mapGdriveAlbum(json);
}
