// Photos from a pluggable source (iCloud shared album today). Reuses the shared
// image viewer + slideshow; rotates on the interval like Art. The board loads
// the Worker's signed <img> URLs directly (CORS-exempt).

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

// refreshMs is the render cadence, not the photo-change rate: like Art, the
// widget re-renders every minute and the shown photo only changes when the
// cfg.photos.every bucket flips (the worker caches /icloud/album 30 min, so
// the frequent fetch is an edge-cache hit, and re-setting the same <img> URL
// is a browser-cache hit).
export const meta = { id: 'photos', title: 'Photos', refreshMs: 60 * 1000 };

// Worker digest → slideshow-shaped list ({img, ar, title, date}).
export function mapPhotos(digest) {
  const photos = (digest?.photos ?? []).map((p) => ({ img: p.url, ar: p.ar, title: p.caption || '', date: p.date }));
  return { photos, stale: Boolean(digest?.stale), updatedAt: digest?.updatedAt ?? null };
}

let sessionList = []; // most recent fetch, for the viewer to browse

export function render(el, vm, cfg) {
  sessionList = vm.photos ?? [];
  if (!sessionList.length) {
    el.innerHTML = '<div class="empty">Add a shared album in Settings → Photos</div>';
    return;
  }
  // Rotate deterministically on the user's interval bucket, like Art.
  const everyMs = (cfg?.photos?.every ?? 30) * 60 * 1000;
  const idx = Math.floor(Date.now() / everyMs) % sessionList.length;
  const p = sessionList[idx];
  el.innerHTML = `
    <figure class="artwork" role="button" tabindex="0" aria-label="View photo full screen">
      <img class="artwork__img" src="${escapeHtml(p.img)}" alt="${escapeHtml(p.title)}" loading="lazy">
      ${p.title ? `<figcaption class="artwork__caption"><span class="artwork__title">${escapeHtml(p.title)}</span></figcaption>` : ''}
    </figure>`;
  el.querySelector('.artwork').addEventListener('click', () => openImageViewer(p, cfg, { list: sessionList }));
}

// Used by ambient mode (Task 6) when photos are the chosen screensaver source.
export function photoManifest() {
  return sessionList;
}

export async function fetchData(cfg, net) {
  const { source, album } = cfg.photos ?? {};
  if (!album) return { photos: [] };
  if (source === 'icloud') {
    return mapPhotos(await net.fetchJSON(`${WORKER_URL}/icloud/album?token=${encodeURIComponent(album)}`));
  }
  if (source === 'gdrive') {
    return mapPhotos(await net.fetchJSON(`${WORKER_URL}/gdrive/album?folder=${encodeURIComponent(album)}`));
  }
  return { photos: [] };
}
