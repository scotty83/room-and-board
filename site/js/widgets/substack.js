// Followed Substack publications — long-form essays, roughly weekly cadence,
// so they get their own card instead of being buried under social posts.

import { renderPostRows, fetchSubstackRows, fetchAll } from './posts.js';

export const meta = { id: 'substack', title: 'Substack', refreshMs: 30 * 60 * 1000 };

export function render(el, vm, _cfg) {
  renderPostRows(el, vm, 'substack', 'Add publications in Settings → Substack');
}

export async function fetchData(cfg, net) {
  return fetchAll(cfg.substack?.pubs ?? [], fetchSubstackRows, net);
}
