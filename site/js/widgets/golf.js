// PGA Tour leaderboard from ESPN's public scoreboard (CORS-open, keyless,
// browser-direct — same source family as My Teams/World Cup). Config-less:
// the feed's current event IS the card. Majors (Masters/PGA/US Open/The
// Open) ride the pga scoreboard, so they appear automatically.

import { escapeHtml, setCardNote, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { WORKER_URL } from '../env.js';
import { mapGolf } from '../espn-scores.js';

export { mapGolf }; // single shared mapper (site fallback + worker digest + tests)

export const meta = { id: 'golf', title: 'Golf', refreshMs: 5 * 60 * 1000 };

const FEED_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

export function render(el, vm, _cfg) {
  const note = vm.name ? `${vm.name}${vm.round ? ` · Rd ${vm.round}` : ''}` : null;
  setCardNote(el, note);
  if (!vm.players.length) {
    const when = vm.startsAt
      ? ` Starts ${new Date(vm.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
      : '';
    el.innerHTML = `<div class="empty">${vm.name ? `${escapeHtml(vm.name)}.${when}` : 'No tournament this week'}</div>`;
    return;
  }
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('golf', w, h);
  const shown = vm.players.slice(0, cap);
  el.style.setProperty('--n', String(shown.length)); // elastic row-gap divisor
  el.innerHTML = shown
    .map(
      (p) => `<div class="golf-row">
        <span class="golf-row__pos">${p.pos ?? ''}</span>
        ${p.flag ? `<img class="golf-row__flag" src="${escapeHtml(p.flag)}" alt="">` : ''}
        <span class="golf-row__name">${escapeHtml(p.name)}</span>
        ${p.today ? `<span class="golf-row__today">${escapeHtml(p.today)}</span>` : ''}
        <span class="golf-row__score ${p.score.startsWith('-') ? 'golf-row__score--under' : ''}">${escapeHtml(p.score)}</span>
      </div>`,
    )
    .join('');
  setMoreBadge(el, vm.players.length - shown.length);
}

export async function fetchData(_cfg, net) {
  // Worker digest first: ~2 KB (plus the 24h stale fallback) vs the 2.3 MB
  // raw scoreboard. Browser-direct remains as the fallback while the route
  // rolls out (worker deploys only on main pushes) and if the worker is down.
  try {
    return await net.fetchJSON(`${WORKER_URL}/golf`);
  } catch {
    return mapGolf(await net.fetchJSON(FEED_URL));
  }
}
