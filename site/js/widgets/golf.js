// PGA Tour leaderboard from ESPN's public scoreboard (CORS-open, keyless,
// browser-direct — same source family as My Teams/World Cup). Config-less:
// the feed's current event IS the card. Majors (Masters/PGA/US Open/The
// Open) ride the pga scoreboard, so they appear automatically.

import { escapeHtml, setCardNote, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'golf', title: 'Golf', refreshMs: 5 * 60 * 1000 };

const FEED_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

// Scoreboard payload -> { name, state, round, players[] } for the current
// (first) event. Players sort by leaderboard order; score is the relative
// total ("-10"); today is the current round's relative line when available.
export function mapGolf(payload) {
  const ev = payload?.events?.[0];
  if (!ev) return { name: null, state: 'none', round: null, players: [] };
  const comp = ev.competitions?.[0] ?? {};
  const status = comp.status?.type ?? ev.status?.type ?? {};
  const detail = status.detail ?? status.shortDetail ?? '';
  const round = (/Round (\d+)/i.exec(detail) || [])[1] ?? null;
  const players = (comp.competitors ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((c) => {
      // Last PLAYED round: an in-progress event appends a period-only stub
      // for the unplayed round, so scan back to a real displayValue.
      const line = (c.linescores ?? []).filter((l) => l?.displayValue != null).at(-1);
      return {
        pos: c.order ?? null,
        name: c.athlete?.shortName ?? c.athlete?.displayName ?? '',
        // ESPN has flipped score between string and {value, displayValue} on
        // sibling endpoints; tolerate both.
        score: c.score != null && typeof c.score === 'object' ? (c.score.displayValue ?? '') : c.score != null ? String(c.score) : '',
        today: line?.displayValue ?? '',
      };
    })
    .filter((p) => p.name);
  return {
    name: ev.shortName ?? ev.name ?? null,
    state: status.state ?? 'pre',
    // Off-week / pre-tournament: surface the start date instead of a board.
    startsAt: status.state === 'pre' ? Date.parse(ev.date ?? '') || null : null,
    round,
    players,
  };
}

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
        <span class="golf-row__name">${escapeHtml(p.name)}</span>
        ${p.today ? `<span class="golf-row__today">${escapeHtml(p.today)}</span>` : ''}
        <span class="golf-row__score ${p.score.startsWith('-') ? 'golf-row__score--under' : ''}">${escapeHtml(p.score)}</span>
      </div>`,
    )
    .join('');
  setMoreBadge(el, vm.players.length - shown.length);
}

export async function fetchData(_cfg, net) {
  return mapGolf(await net.fetchJSON(FEED_URL));
}
