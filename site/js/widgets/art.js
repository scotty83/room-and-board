// Public-domain art from the bundled manifest (built from The Met + Art
// Institute of Chicago open-access APIs). Images load via <img>, so no CORS
// involvement; the slideshow crossfades two stacked layers with an opacity
// transition only (gen1-safe) and preloads the next image before switching.

import { escapeHtml } from '../util.js';
import { openImageViewer } from '../imageshow.js';
export { createSlideshow } from '../imageshow.js';

export const meta = { id: 'art', title: 'Art', refreshMs: 60 * 1000 };

// [] = all categories; unknown cat fields (older manifests) always pass.
export function filterByCats(manifest, cats) {
  if (!cats?.length) return manifest;
  const wanted = new Set(cats);
  const out = manifest.filter((a) => !a.cat || wanted.has(a.cat));
  return out.length ? out : manifest; // never filter down to an empty show
}

export function render(el, vm, cfg) {
  el.innerHTML = `
    <figure class="artwork" role="button" tabindex="0" aria-label="View artwork full screen">
      <img class="artwork__img" src="${escapeHtml(vm.img)}" alt="${escapeHtml(vm.title)}" loading="lazy">
      <figcaption class="artwork__caption">
        <span class="artwork__title">${escapeHtml(vm.title)}</span>
        <span class="artwork__artist">${escapeHtml(vm.artist)}${vm.year ? ` (${escapeHtml(vm.year)})` : ''}</span>
      </figcaption>
    </figure>`;
  el.querySelector('.artwork').addEventListener('click', () => openImageViewer(vm, cfg, { list: artList.length ? artList : [vm] }));
}

let artList = []; // cats-filtered manifest, for fullscreen swiping
let manifestCache = null; // fetched once; reused across card refreshes

export async function fetchData(cfg, net) {
  // The manifest is static; fetch it once and reuse (also seeds the viewer),
  // instead of re-downloading the whole file on every 60 s card refresh.
  if (!manifestCache) manifestCache = await net.fetchJSON('data/art-manifest.json');
  const manifest = filterByCats(manifestCache, cfg.art?.cats);
  artList = manifest; // stash for fullscreen swiping (passed to openImageViewer)
  if (!manifest.length) return { img: '', title: '', artist: '', year: '' };
  // Rotate deterministically on the user's interval so refreshes don't
  // repeat the same piece; the card re-renders each minute but the image
  // only changes when the interval bucket flips.
  const everyMs = (cfg.art?.every ?? 30) * 60 * 1000;
  const idx = Math.floor(Date.now() / everyMs) % manifest.length;
  return manifest[idx];
}
