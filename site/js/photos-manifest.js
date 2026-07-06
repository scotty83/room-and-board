// Ambient manifest resolver for the photos screensaver source.
// Extracted from startSlideshow() in main.js so it can be unit-tested in
// isolation (main.js has module-level DOM handlers that block happy-dom import).

/**
 * Resolves the ambient-slideshow manifest for the photos source.
 * photoManifest() holds the last-rendered list; on a cold boot (widget fetch
 * not yet complete) it may be empty — in that case we fetch inline, mirroring
 * how the art branch self-fetches its manifest. Returning [] without locking
 * lets startSlideshow() bail without assigning `slideshow`, so the next
 * applyMode() retry can recover.
 *
 * @param {object} cfg
 * @param {object} net
 * @param {object} photosModule  the photos widget module (explicit dep for testability)
 * @returns {Promise<Array>}
 */
export async function resolvePhotosManifest(cfg, net, photosModule) {
  let list = photosModule.photoManifest();
  if (!list.length) list = (await photosModule.fetchData(cfg, net)).photos ?? [];
  return list;
}
