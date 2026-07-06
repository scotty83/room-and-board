// iCloud shared-album (Public Website) ingest. The webstream/webasseturls API
// is keyless but CORS-locked to icloud.com and returns signed image URLs, so
// the Worker does both calls and hands boards plain <img> URLs. Case-sensitive
// token. See spec 2026-07-05-photos-widget-design.md.

const HEADERS = { 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'https://www.icloud.com' };
const MAX_PHOTOS = 60;

// A partition guess derived from the first token char keeps redirects rare;
// we still follow one 330 to the host the server names.
function basePartition(token) {
  const c = token[0];
  const n = /[0-9]/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : c.charCodeAt(0) - 61;
  return String((n % 40) || 1).padStart(2, '0');
}

async function callStream(token, host, path, body) {
  let res = await fetch(`https://${host}/${token}/sharedstreams/${path}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  if (res.status === 330) {
    const next = (await res.json())['X-Apple-MMe-Host'];
    if (!next) throw new Error('icloud 330 without host');
    host = next;
    res = await fetch(`https://${host}/${token}/sharedstreams/${path}`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(`icloud ${path} ${res.status}`);
  return { host, json: await res.json() };
}

export function mapIcloudAlbum(ws, au, maxBytes) {
  const items = au?.items ?? {};
  const photos = [];
  for (const p of ws?.photos ?? []) {
    // Largest derivative whose fileSize fits and whose asset URL exists.
    const usable = Object.values(p.derivatives ?? {})
      .filter((d) => Number(d.fileSize) <= maxBytes && items[d.checksum])
      .sort((a, b) => Number(b.width) - Number(a.width))[0];
    if (!usable) continue;
    const it = items[usable.checksum];
    const w = Number(usable.width);
    const h = Number(usable.height);
    photos.push({
      url: `https://${it.url_location}${it.url_path}`,
      w,
      h,
      ar: h ? Math.round((w / h) * 1000) / 1000 : 1,
      caption: String(p.caption ?? ''),
      date: String(p.dateCreated ?? ''),
    });
  }
  photos.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)); // newest first
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, photos: photos.slice(0, MAX_PHOTOS) };
}

export async function fetchIcloudAlbum(token, maxBytes = 3_000_000) {
  const stream = await callStream(token, `p${basePartition(token)}-sharedstreams.icloud.com`, 'webstream', { streamCtag: null });
  const guids = (stream.json.photos ?? []).slice(0, MAX_PHOTOS).map((p) => p.photoGuid);
  const assets = await callStream(token, stream.host, 'webasseturls', { photoGuids: guids });
  return mapIcloudAlbum(stream.json, assets.json, maxBytes);
}
