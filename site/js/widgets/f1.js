// Formula 1 — next Grand Prix, last-race podium, and driver + constructor
// standings, from the worker's /f1 digest (Jolpica). Config-less. Team colour
// dots reuse the app's Subway/TfL bullet idiom; driver country flags are
// Unicode emoji (zero assets). Balanced/adaptive: standings sit side-by-side
// when the card is wide, stacked when narrow, measured to fit like the news card.

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';

export const meta = { id: 'f1', title: 'Formula 1', refreshMs: 30 * 60 * 1000 };

// constructorId -> [name, dot colour]. Approx current-grid liveries incl. the
// 2026 entrants (Audi, Cadillac). NOTE: recheck once a season — colours and the
// grid change. Unknown id -> neutral grey dot + the raw id.
const F1_TEAMS = {
  mercedes: ['Mercedes', '#27F4D2'], ferrari: ['Ferrari', '#E8002D'], mclaren: ['McLaren', '#FF8000'],
  red_bull: ['Red Bull', '#3671C6'], aston_martin: ['Aston Martin', '#229971'], alpine: ['Alpine', '#0093CC'],
  williams: ['Williams', '#64C4FF'], rb: ['Racing Bulls', '#6692FF'], haas: ['Haas', '#B6BABD'],
  audi: ['Audi', '#BB0A30'], sauber: ['Kick Sauber', '#52E252'], cadillac: ['Cadillac', '#C6A15B'],
};
// Prefer the curated short name; fall back to the worker's official name
// (present in standings rows), then the raw id as a last resort.
const teamName = (cid, fallback) => F1_TEAMS[cid]?.[0] ?? fallback ?? cid;
const teamColor = (cid) => F1_TEAMS[cid]?.[1] ?? '#7d8590';

// Ergast demonym -> ISO 3166 alpha-2 (F1 nationalities). Unknown -> no flag.
const NAT_ISO = {
  Argentine: 'AR', Australian: 'AU', Austrian: 'AT', Belgian: 'BE', Brazilian: 'BR', British: 'GB',
  Canadian: 'CA', Chinese: 'CN', Danish: 'DK', Dutch: 'NL', Finnish: 'FI', French: 'FR', German: 'DE',
  Italian: 'IT', Japanese: 'JP', Mexican: 'MX', Monegasque: 'MC', 'New Zealander': 'NZ', Polish: 'PL',
  Russian: 'RU', Spanish: 'ES', Swedish: 'SE', Swiss: 'CH', Thai: 'TH', American: 'US',
};
const flagOf = (nat) => {
  const iso = NAT_ISO[nat];
  if (!iso) return '';
  const emoji = [...iso].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
  return `<span class="f1-flag">${emoji}</span>`;
};

const dot = (cid) => `<span class="f1-dot" style="background:${teamColor(cid)}"></span>`;

export function render(el, vm, _cfg) {
  // No "as of" stamp: F1 data only changes after a race (weekly), never
  // intraday, so a minute-resolution timestamp would be misleading noise.
  // Outage staleness is still shown by the card frame's .is-stale dimming.
  const { next, lastRace, podium, drivers = [], teams = [] } = vm;
  if (!next && !podium && !drivers.length && !teams.length) {
    el.innerHTML = '<div class="empty">F1 data unavailable</div>';
    return;
  }
  // Below ~380px the card is too tight for secondary text: drop the circuit
  // name and podium team, and stack the two standings columns full-width so
  // surnames stay readable. Above it, standings sit side-by-side; the top few
  // of each fit even at the 3-wide minimum (long surnames may ellipsize).
  const narrow = el.clientWidth > 0 && el.clientWidth < 380;

  const nextBlock = next
    ? `<div class="f1-next">
         <div class="f1-next__hd"><span class="f1-next__tag">Next</span> ${escapeHtml(next.name)}</div>
         <div class="f1-next__meta">${escapeHtml(fmtDate(next.date))}${!narrow && next.circuit ? ` · ${escapeHtml(next.circuit)}` : ''}</div>
       </div>` : '';

  const podiumBlock = podium?.length
    ? `<div class="f1-sec"><div class="f1-sec__h">${escapeHtml(lastRace ?? 'Last race')} — podium</div>${
        podium.map((p) => `<div class="f1-row f1-row--p${p.pos}"><span class="f1-pos">${p.pos}</span>${dot(p.cid)}${flagOf(p.nat)}<span class="f1-name">${escapeHtml(p.driver)}</span>${narrow ? '' : `<span class="f1-team">${escapeHtml(teamName(p.cid))}</span>`}</div>`).join('')
      }</div>` : '';

  const driverRow = (s) => `<div class="f1-row"><span class="f1-pos">${s.pos}</span>${dot(s.cid)}${flagOf(s.nat)}<span class="f1-name">${escapeHtml(s.name)}</span><span class="f1-pts">${s.pts}</span></div>`;
  const teamRow = (s) => `<div class="f1-row"><span class="f1-pos">${s.pos}</span>${dot(s.cid)}<span class="f1-name">${escapeHtml(teamName(s.cid, s.name))}</span><span class="f1-pts">${s.pts}</span></div>`;
  const col = (h, rows) => `<div class="f1-col"><div class="f1-sec__h">${h}</div>${rows}</div>`;

  const build = (dn, cn) => {
    const dCol = drivers.length ? col('Drivers', drivers.slice(0, dn).map(driverRow).join('')) : '';
    const cCol = teams.length ? col('Constructors', teams.slice(0, cn).map(teamRow).join('')) : '';
    const stand = narrow ? dCol + cCol : `<div class="f1-cols">${dCol}${cCol}</div>`;
    return nextBlock + podiumBlock + stand;
  };

  // Static estimate for happy-dom (no layout to measure); the real board measures below.
  let dn = 8, cn = 8;
  el.innerHTML = build(dn, cn);
  if (el.clientHeight > 0) {
    let guard = 0;
    while (el.scrollHeight > el.clientHeight + 1 && guard++ < 60) {
      if (cn >= dn && cn > 1) cn -= 1;
      else if (dn > 1) dn -= 1;
      else break;
      el.innerHTML = build(dn, cn);
    }
  }
}

function fmtDate(iso) {
  const t = Date.parse(`${iso}T12:00:00`);
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : iso;
}

export async function fetchData(_cfg, net) {
  return net.fetchJSON(`${WORKER_URL}/f1`);
}
