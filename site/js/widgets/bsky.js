// Followed Bluesky accounts — short-form, high-cadence social stream.

import { renderPostRows, fetchBskyRows, fetchAll } from './posts.js';

export const meta = { id: 'bsky', title: 'Bluesky', refreshMs: 10 * 60 * 1000 };

export function render(el, vm, _cfg) {
  renderPostRows(el, vm, 'bsky', 'Add accounts in Settings → Bluesky');
}

export async function fetchData(cfg, net) {
  return fetchAll(cfg.bsky?.handles ?? [], fetchBskyRows, net);
}
