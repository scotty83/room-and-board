// Photos from a pluggable source (iCloud shared album today). Reuses the shared
// image viewer + slideshow; rotates on the interval like Art. The board loads
// the Worker's signed <img> URLs directly (CORS-exempt).

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

export const meta = { id: 'photos', title: 'Photos', refreshMs: 30 * 60 * 1000 };

// Worker digest → slideshow-shaped list ({img, ar, title, date}).
export function mapPhotos(digest) {
  const photos = (digest?.photos ?? []).map((p) => ({ img: p.url, ar: p.ar, title: p.caption || '', date: p.date }));
  return { photos, stale: Boolean(digest?.stale), updatedAt: digest?.updatedAt ?? null };
}

let sessionList = []; // most recent fetch, for the viewer to browse

export function render(el, vm, _cfg) {
  sessionList = vm.photos ?? [];
  if (!sessionList.length) {
    el.innerHTML = '<div class="empty">Add a shared album in Settings → Photos</div>';
    return;
  }
  // Rotate deterministically on the interval bucket, like Art.
  const idx = Math.floor(Date.now() / meta.refreshMs) % sessionList.length;
  const p = sessionList[idx];
  el.innerHTML = `
    <figure class="artwork" role="button" tabindex="0" aria-label="View photo full screen">
      <img class="artwork__img" src="${escapeHtml(p.img)}" alt="${escapeHtml(p.title)}" loading="lazy">
      ${p.title ? `<figcaption class="artwork__caption"><span class="artwork__title">${escapeHtml(p.title)}</span></figcaption>` : ''}
    </figure>`;
  el.querySelector('.artwork').addEventListener('click', () => openImageViewer(p, _cfg, { list: sessionList }));
}

// Used by ambient mode (Task 6) when photos are the chosen screensaver source.
export function photoManifest() {
  return sessionList;
}

export async function fetchData(cfg, net) {
  const { source, album } = cfg.photos ?? {};
  if (source !== 'icloud' || !album) return { photos: [] };
  return mapPhotos(await net.fetchJSON(`${WORKER_URL}/icloud/album?token=${encodeURIComponent(album)}`));
}
