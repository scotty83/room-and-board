// Current tennis tournament from ESPN's public ATP + WTA scoreboards
// (CORS-open, keyless, browser-direct). Config-less: whatever tournament is
// on IS the card — live singles matches first, then today's upcoming, then
// the freshest finals. Doubles are skipped (no athlete names in the feed).

import { escapeHtml, setCardNote, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { WORKER_URL } from '../env.js';
import { mapTennisEvent, mapTennis } from '../espn-scores.js';

export { mapTennisEvent, mapTennis }; // single shared mapper (site fallback + worker digest + tests)

export const meta = { id: 'tennis', title: 'Tennis', refreshMs: 5 * 60 * 1000 };

const FEEDS = [
  ['ATP', 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'],
  ['WTA', 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'],
];

export function render(el, vm, _cfg) {
  setCardNote(el, vm.name);
  if (!vm.rows.length) {
    el.innerHTML = '<div class="empty">No tournament matches right now</div>';
    return;
  }
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('tennis', w, h);
  const shown = vm.rows.slice(0, cap);
  el.style.setProperty('--n', String(shown.length)); // elastic row-gap divisor
  el.innerHTML = shown
    .map((m) => {
      const live = m.state === 'in';
      const label = m.state === 'post' && m.winner
        ? `${m.winner === 'a' ? m.a : m.b} d. ${m.winner === 'a' ? m.b : m.a}`
        : `${m.a} vs ${m.b}`;
      const right = live
        ? `<b class="tennis-row__live">●</b> ${escapeHtml(m.sets)}`
        : m.state === 'post'
          ? escapeHtml(m.sets || m.detail) // walkovers have no sets
          : escapeHtml(m.detail);
      return `<div class="tennis-row ${live ? 'tennis-row--live' : ''}">
        <span class="tennis-row__tour">${escapeHtml(m.tour)}</span>
        <span class="tennis-row__match">${escapeHtml(label)}</span>
        <span class="tennis-row__score">${right}</span>
      </div>`;
    })
    .join('');
  setMoreBadge(el, vm.rows.length - shown.length);
}

export async function fetchData(_cfg, net) {
  // Worker digest first (~2 KB + 24h stale fallback vs ~1.8 MB of raw
  // scoreboards); browser-direct fallback covers the route's rollout window
  // and worker outages. Either tour may be idle: partial is fine, both
  // failing throws so the scheduler backs off and keeps the last-good cache.
  try {
    return await net.fetchJSON(`${WORKER_URL}/tennis`);
  } catch {
    const [atp, wta] = await Promise.allSettled(FEEDS.map(([, u]) => net.fetchJSON(u)));
    if (atp.status === 'rejected' && wta.status === 'rejected') throw new Error('tennis: both tours failed');
    return mapTennis(
      atp.status === 'fulfilled' ? atp.value : null,
      wta.status === 'fulfilled' ? wta.value : null,
    );
  }
}
