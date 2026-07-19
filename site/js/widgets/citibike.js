// Live Citi Bike availability at the user's chosen stations. Station names come
// from cfg (bundled dataset at pick time); this joins them with the worker's
// live counts and shows bikes (e-bikes called out) + open docks.

import { WORKER_URL } from '../env.js';
import { escapeHtml, setMoreBadge, setupPrompt } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'citibike', title: 'Citi Bike', refreshMs: 60 * 1000 };

export function render(el, vm, cfg) {
  const chosen = cfg.citibike?.stations ?? [];
  if (!chosen.length) {
    el.innerHTML = setupPrompt('citibike', 'add stations', 'Citi Bike');
    return;
  }
  const byId = new Map((vm.stations ?? []).map((s) => [s.id, s]));
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('citibike', w, h) ?? 4;
  const shown = chosen.slice(0, cap);
  const hidden = chosen.length - shown.length;
  el.style.setProperty('--n', String(shown.length)); // elastic row-gap divisor
  el.innerHTML = shown
    .map((st) => {
      const live = byId.get(st.id);
      const stat = !live || !live.ok
        ? '<span class="cb__stat cb__stat--off">not renting</span>'
        : `<span class="cb__stat"><b class="cb__n">${live.bikes}</b> bikes${live.ebikes > 0 ? ` (<b class="cb__e">${live.ebikes}⚡</b>)` : ''} · ${live.docks} docks</span>`;
      return `<div class="cb"><span class="cb__name">${escapeHtml(st.name)}</span>${stat}</div>`;
    })
    .join('');
  setMoreBadge(el, hidden);
}

export async function fetchData(cfg, net) {
  const ids = (cfg.citibike?.stations ?? []).map((s) => s.id);
  if (!ids.length) return { updatedAt: 0, stale: false, stations: [] };
  return net.fetchJSON(`${WORKER_URL}/citibike/status?ids=${ids.join(',')}`);
}
