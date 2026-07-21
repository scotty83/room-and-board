// Fetches the slideshow manifest for a built-in curated screensaver source
// (see CURATED_SOURCES in config.js). Curated sources are screensaver-only —
// there's no dashboard widget to pre-populate a manifest — so this always
// fetches inline through the worker's /gdrive/album route, mirroring the
// user-configurable GDrive photo source. Returns a slideshow-shaped list
// ({img, ar, title, date}); [] on an unknown id or empty folder, so
// startSlideshow() bails without locking an empty engine.

import { WORKER_URL } from './env.js';
import { mapPhotos } from './widgets/photos-core.js';
import { CURATED_SOURCES } from './config.js';

export async function fetchCuratedManifest(id, net) {
  const src = CURATED_SOURCES[id];
  if (!src) return [];
  const digest = await net.fetchJSON(`${WORKER_URL}/gdrive/album?folder=${encodeURIComponent(src.folder)}`);
  return mapPhotos(digest).photos ?? [];
}
