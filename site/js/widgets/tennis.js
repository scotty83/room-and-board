// Current tennis tournament from ESPN's public ATP + WTA scoreboards
// (CORS-open, keyless, browser-direct). Config-less: whatever tournament is
// on IS the card — live singles matches first, then today's upcoming, then
// the freshest finals. Doubles are skipped (no athlete names in the feed).

import { escapeHtml, setCardNote, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'tennis', title: 'Tennis', refreshMs: 5 * 60 * 1000 };

const FEEDS = [
  ['ATP', 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'],
  ['WTA', 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'],
];

// "6-2 6-2" from the two sides' per-set linescores.
const setline = (a, b) => {
  const as = a?.linescores ?? [];
  const bs = b?.linescores ?? [];
  const n = Math.max(as.length, bs.length);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const av = as[i]?.value;
    const bv = bs[i]?.value;
    if (av == null && bv == null) continue;
    parts.push(`${av ?? '–'}-${bv ?? '–'}`);
  }
  return parts.join(' ');
};

// Singles rows for one event. The tour label comes from the GROUPING name,
// not the feed: a single ESPN event can carry both draws (combined weeks
// like the Nordea Open appear identically in the atp AND wta scoreboards).
export function mapTennisEvent(ev) {
  const rows = [];
  for (const g of ev?.groupings ?? []) {
    const gname = g.grouping?.displayName ?? '';
    if (!/singles/i.test(gname)) continue;
    const tour = /women/i.test(gname) ? 'WTA' : 'ATP';
    for (const m of g.competitions ?? []) {
      const [a, b] = m.competitors ?? [];
      const nameOf = (side) => side?.athlete?.shortName ?? side?.athlete?.displayName ?? '';
      if (!nameOf(a) || !nameOf(b)) continue;
      const state = m.status?.type?.state ?? 'pre';
      const winnerB = !a?.winner && b?.winner;
      rows.push({
        id: m.id ?? null,
        tour,
        state,
        t: Date.parse(m.date ?? '') || 0,
        round: m.round?.displayName ?? '',
        a: nameOf(a),
        b: nameOf(b),
        // Winner-first when decided ("Bulgaru d. Strakhova 6-2 6-2"), else
        // the a-vs-b orientation matching the "a vs b" label.
        sets: winnerB ? setline(b, a) : setline(a, b),
        winner: a?.winner ? 'a' : b?.winner ? 'b' : null,
        // The leading date is noise on a today-focused card.
        detail: (m.status?.type?.shortDetail ?? '').replace(/^\d+\/\d+ - /, ''),
      });
    }
  }
  return rows;
}

// Merge the top event from each feed (deduped by event id — often the same
// combined tournament): live first, then upcoming (soonest first), then the
// freshest finals. The card note names the tournament(s).
export function mapTennis(atp, wta) {
  const events = [];
  const seenEv = new Set();
  for (const p of [atp, wta]) {
    const ev = p?.events?.[0];
    if (ev && !seenEv.has(ev.id)) {
      seenEv.add(ev.id);
      events.push(ev);
    }
  }
  const rows = [];
  const seenMatch = new Set();
  for (const ev of events) {
    for (const r of mapTennisEvent(ev)) {
      if (r.id && seenMatch.has(r.id)) continue;
      if (r.id) seenMatch.add(r.id);
      rows.push(r);
    }
  }
  const rank = { in: 0, pre: 1, post: 2 };
  rows.sort((x, y) => (rank[x.state] ?? 3) - (rank[y.state] ?? 3) || (x.state === 'post' ? y.t - x.t : x.t - y.t));
  const names = [...new Set(events.map((e) => e.shortName ?? e.name).filter(Boolean))];
  return { name: names.join(' · ') || null, rows };
}

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
  // Either tour may be idle (feed error or off week): partial is fine, both
  // failing throws so the scheduler backs off and keeps the last-good cache.
  const [atp, wta] = await Promise.allSettled(FEEDS.map(([, u]) => net.fetchJSON(u)));
  if (atp.status === 'rejected' && wta.status === 'rejected') throw new Error('tennis: both tours failed');
  return mapTennis(
    atp.status === 'fulfilled' ? atp.value : null,
    wta.status === 'fulfilled' ? wta.value : null,
  );
}
