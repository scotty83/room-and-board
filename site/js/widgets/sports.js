// "My Teams" sports scores (per large-format scoreboard convention: one row
// per followed team — no league browsing on a glanceable display). Rows come
// from the Worker, which combines ESPN's team endpoint with a digest of the
// heavyweight schedule payload (recent result) that boards must never fetch.

import { escapeHtml, setMoreBadge } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

// ESPN's image combiner serves right-sized logos for 4K panels.
export const logoUrl = (href, px = 80) =>
  href ? `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(href).pathname)}&h=${px}&w=${px}` : null;

export const meta = { id: 'sports', title: 'My Teams', refreshMs: 2 * 60 * 1000 };

export const LEAGUE_PATHS = {
  mlb: 'baseball/mlb',
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1',
};

export function render(el, vm, _cfg) {
  if (!vm.rows?.length) {
    el.innerHTML = '<div class="empty" data-setup="sports">Pick your teams in Settings → My Teams</div>';
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('sports', w, h);
  const shown = vm.rows.slice(0, cap);
  const hidden = vm.rows.length - shown.length;
  el.style.setProperty('--n', String(shown.length)); // elastic row-gap divisor
  el.innerHTML =
    shown
      .map(
        (r) => `<div class="team ${r.state === 'in' ? 'team--live' : ''}">
          ${r.logo ? `<img class="team__logo" src="${escapeHtml(logoUrl(r.logo))}" alt="">` : `<span class="team__abbr">${escapeHtml(r.abbr)}</span>`}
          <div class="team__info">
            <span class="team__name">${escapeHtml(r.name)}${r.record ? ` <small>${escapeHtml(r.record)}</small>` : ''}</span>
            <span class="team__line">${r.state === 'in' ? '<b class="team__livedot">●</b> ' : ''}${escapeHtml(r.line)}</span>
            ${r.lastLine && r.state !== 'post' ? `<span class="team__last">Last: ${escapeHtml(r.lastLine)}</span>` : ''}
          </div>
        </div>`,
      )
      .join('');
  setMoreBadge(el, hidden);
}

export async function fetchData(cfg, net) {
  const teams = cfg.sports?.teams ?? [];
  const settled = await Promise.allSettled(
    teams.map(({ lg, id }) =>
      net.fetchJSON(`${WORKER_URL}/sports/team?lg=${encodeURIComponent(lg)}&id=${encodeURIComponent(id)}`),
    ),
  );
  const list = settled
    .filter((s) => s.status === 'fulfilled')
    .map((s) => s.value?.row)
    .filter(Boolean);
  // Total upstream failure (every team fetch rejected): throw so the scheduler
  // backs off and the last good cache keeps rendering, instead of overwriting
  // it with an empty payload and a false "pick your teams" state.
  if (teams.length && !list.length && settled.some((s) => s.status === 'rejected')) {
    throw new Error('sports: all team fetches failed');
  }
  // Live games float to the top; otherwise keep the user's order.
  list.sort((a, b) => Number(b.state === 'in') - Number(a.state === 'in'));
  return { rows: list };
}
