// Landscapes — a curated image widget. Twin of gdrivephotos, but pinned to a
// built-in, hand-curated Google Drive folder (CURATED_SOURCES.landscapes), so it
// needs no user setup: it just shows rotating landscape photos and taps through
// to the same full-screen viewer. Also selectable as a screensaver source.

import { createPhotoWidget, mapPhotos as mapPhotosCore } from './photos-core.js';
import { CURATED_SOURCES } from '../config.js';

const src = CURATED_SOURCES.landscapes;
const widget = createPhotoWidget({
  id: 'landscapes',
  cfgKey: 'landscapes', // reads cfg.landscapes.every for the user rotation setting
  endpoint: '/gdrive/album?folder=',
  curated: { title: 'Landscapes', folder: src.folder, every: src.every },
});

export const meta = widget.meta;
export const render = widget.render;
export const fetchData = widget.fetchData;
export const photoManifest = widget.photoManifest;
export const mapPhotos = mapPhotosCore;
