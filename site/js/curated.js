// Fetches the slideshow manifest for a built-in curated screensaver source
// (see CURATED_SOURCES in config.js). Curated sources are screensaver-only —
// there's no dashboard widget to pre-populate a manifest — so this always
// fetches inline through the worker's /gdrive/album route, mirroring the
// user-configurable GDrive photo source. Returns a slideshow-shaped list
// ({img, ar, title, date}); [] on an unknown id or empty folder, so
// startSlideshow() bails without locking an empty engine.

import { WORKER_URL } from './env.js';
import { mapPhotos } from './widgets/photos-core.js';
import { CURATED_SOURCES, CLOCK_BACKDROP_FOLDER } from './config.js';

// Enumerate a public Drive folder into a slideshow-shaped list ({img, ar, ...}).
export async function fetchFolderPhotos(folder, net) {
  const digest = await net.fetchJSON(`${WORKER_URL}/gdrive/album?folder=${encodeURIComponent(folder)}`);
  return mapPhotos(digest).photos ?? [];
}

export async function fetchCuratedManifest(id, net) {
  const src = CURATED_SOURCES[id];
  if (!src) return [];
  return fetchFolderPhotos(src.folder, net);
}

// Full curated clock-backdrop list (for swipe-to-next); [] if empty/unreachable.
export function fetchBackdropList(net) {
  return fetchFolderPhotos(CLOCK_BACKDROP_FOLDER, net);
}

// Deterministic daily index into a list of length len, keyed to the LOCAL day so
// the default image is stable through the day and flips at local midnight.
export function backdropDayIndex(now, len) {
  if (!len) return 0;
  const localDay = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  return ((localDay % len) + len) % len;
}

// Today's clock-backdrop image URL, or '' if the folder is empty/unreachable.
export async function fetchDailyBackdrop(net, now = new Date()) {
  const list = await fetchBackdropList(net);
  return list.length ? list[backdropDayIndex(now, list.length)].img : '';
}
