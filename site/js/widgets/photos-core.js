// Shared implementation for the two photo widgets (iCloud + Google Drive).
// Each is its own module with its own closure state (sessionList) so their
// slideshows and ambient manifests never collide — hence a factory, not a
// shared module namespace. The board loads the Worker's signed <img> URLs
// directly (CORS-exempt).

import { escapeHtml, setupPrompt } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

// Worker digest → slideshow-shaped list ({img, ar, title, date}).
export function mapPhotos(digest) {
  const photos = (digest?.photos ?? []).map((p) => ({ img: p.url, ar: p.ar, title: p.caption || '', date: p.date }));
  return { photos, stale: Boolean(digest?.stale), updatedAt: digest?.updatedAt ?? null };
}

// Builds one photo-widget module.
//   cfgKey   — config block with this widget's { album, every } (photos | gdrivephotos)
//   endpoint — worker album path incl. its query key, e.g. '/icloud/album?token='
//   emptyAction/emptyDest — the unconfigured tap-prompt pieces (setupPrompt)
//   curated  — optional { title, folder, every } for a built-in curated source
//              (e.g. Landscapes): a fixed folder needing no user setup, so it
//              ignores cfgKey and shows a neutral empty state, not a setup prompt.
// title is "Photos" for the user photo widgets so the dashboard card stays clean
// (their descriptive picker/edit label lives in WIDGET_LABELS); a curated widget
// carries its own title (e.g. "Landscapes").
export function createPhotoWidget({ id, cfgKey, endpoint, emptyAction, emptyDest, curated }) {
  let sessionList = []; // most recent fetch, for the viewer to browse

  // refreshMs is the render cadence, not the photo-change rate: like Art, the
  // widget re-renders every minute and the shown photo only changes when the
  // cfg[cfgKey].every bucket flips (the worker caches the album digest, so the
  // frequent fetch is an edge-cache hit and re-setting the same <img> URL is a
  // browser-cache hit).
  const meta = { id, title: curated?.title ?? 'Photos', refreshMs: 60 * 1000 };

  function render(el, vm, cfg) {
    sessionList = vm.photos ?? [];
    if (!sessionList.length) {
      // Curated sources have nothing for the user to set up, so a setup prompt
      // would be wrong — show a neutral placeholder instead.
      el.innerHTML = curated
        ? `<div class="empty">${escapeHtml(curated.title)} unavailable right now.</div>`
        : setupPrompt(id, emptyAction, emptyDest);
      return;
    }
    // Rotate deterministically on the interval bucket, like Art.
    const everyMs = (curated ? curated.every : (cfg?.[cfgKey]?.every ?? 30)) * 60 * 1000;
    const idx = Math.floor(Date.now() / everyMs) % sessionList.length;
    const p = sessionList[idx];
    el.innerHTML = `
      <figure class="artwork" role="button" tabindex="0" aria-label="View photo full screen">
        <img class="artwork__img" src="${escapeHtml(p.img)}" alt="${escapeHtml(p.title)}" loading="lazy">
        ${p.title ? `<figcaption class="artwork__caption"><span class="artwork__title">${escapeHtml(p.title)}</span></figcaption>` : ''}
      </figure>`;
    el.querySelector('.artwork').addEventListener('click', () => openImageViewer(p, cfg, { list: sessionList }));
  }

  // Used by ambient mode when these photos are the chosen screensaver source.
  const photoManifest = () => sessionList;

  async function fetchData(cfg, net) {
    const album = curated ? curated.folder : cfg?.[cfgKey]?.album;
    if (!album) return { photos: [] };
    return mapPhotos(await net.fetchJSON(`${WORKER_URL}${endpoint}${encodeURIComponent(album)}`));
  }

  return { meta, render, photoManifest, fetchData, mapPhotos };
}
