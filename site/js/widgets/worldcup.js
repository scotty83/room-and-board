// FIFA World Cup 2026: live matches, upcoming fixtures and recent results
// from ESPN's public scoreboard (keyless, CORS-open). Live first, then
// upcoming by kickoff, then recent finals — the canonical tournament-widget
// ordering. Rolling window: 3 days back, 5 days ahead.

import { escapeHtml, fmtTime } from '../util.js';
import { logoUrl } from './sports.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'worldcup', title: 'World Cup 2026', refreshMs: 60 * 1000 };

const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');

export function mapWorldCup(json, nowMs) {
  const matches = [];
  for (const event of json?.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const status = comp.status?.type ?? {};
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    matches.push({
      t: Date.parse(event.date),
      state: status.state ?? 'pre', // pre | in | post
      detail: status.shortDetail ?? '',
      home: home.team?.abbreviation ?? '?',
      away: away.team?.abbreviation ?? '?',
      hf: home.team?.logo ?? null, // country flag PNGs on ESPN's CDN
      af: away.team?.logo ?? null,
      hs: home.score ?? null,
      as: away.score ?? null,
      note: comp.notes?.[0]?.headline ?? '',
      stage: event.season?.type?.name ?? '',
    });
  }
  const live = matches.filter((m) => m.state === 'in').sort((a, b) => a.t - b.t);
  const upcoming = matches.filter((m) => m.state === 'pre' && m.t > nowMs - 3600e3).sort((a, b) => a.t - b.t);
  const results = matches.filter((m) => m.state === 'post').sort((a, b) => b.t - a.t);
  return { live, upcoming, results };
}

const dayLabel = (t, nowMs) => {
  const d = new Date(t);
  const today = new Date(nowMs);
  if (d.toDateString() === today.toDateString()) return fmtTime(t / 1000);
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${fmtTime(t / 1000)}`;
};

const flagImg = (href) =>
  href ? `<img class="wc-flag" src="${escapeHtml(logoUrl(href, 56))}" alt="">` : '';

function matchRow(m, nowMs) {
  if (m.state === 'pre') {
    return `<div class="wc-match">
      <span class="wc-match__teams">${flagImg(m.hf)}${escapeHtml(m.home)} vs ${flagImg(m.af)}${escapeHtml(m.away)}</span>
      <span class="wc-match__meta">${escapeHtml(dayLabel(m.t, nowMs))}</span>
    </div>`;
  }
  return `<div class="wc-match ${m.state === 'in' ? 'wc-match--live' : ''}">
    <span class="wc-match__teams">${flagImg(m.hf)}${escapeHtml(m.home)} <b>${escapeHtml(String(m.hs ?? '–'))}–${escapeHtml(String(m.as ?? '–'))}</b> ${flagImg(m.af)}${escapeHtml(m.away)}</span>
    <span class="wc-match__meta">${m.state === 'in' ? '<b class="team__livedot">●</b> ' : ''}${escapeHtml(m.detail)}</span>
  </div>${m.note ? `<div class="wc-match__note">${escapeHtml(m.note)}</div>` : ''}`;
}

export function render(el, vm, _cfg) {
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('worldcup', w, h);
  const nowMs = vm.nowMs ?? Date.now();
  const sections = [];
  let left = cap;
  // A match with a note renders as two rows, so it costs two capacity units —
  // otherwise an exactly-full card clips the last row. `share` caps the middle
  // section to half the remaining budget so the last section still gets room.
  const take = (list, label, share) => {
    if (!list.length || left <= 0) return;
    const maxMatches = share ? Math.max(1, Math.ceil(left / 2)) : list.length;
    const rows = [];
    for (const m of list) {
      if (rows.length >= maxMatches) break;
      const cost = m.note ? 2 : 1;
      if (left - cost < 0) break;
      rows.push(m);
      left -= cost;
    }
    if (!rows.length) return;
    sections.push(`<div class="wc-section"><span class="wc-section__label">${label}</span>${rows
      .map((m) => matchRow(m, nowMs))
      .join('')}</div>`);
  };
  take(vm.live, 'Live', false);
  take(vm.upcoming, 'Upcoming', true);
  take(vm.results, 'Results', false);
  el.innerHTML = sections.join('') || '<div class="empty">No matches in the current window</div>';
}

export async function fetchData(cfg, net) {
  const now = Date.now();
  const from = ymd(new Date(now - 3 * 86400e3));
  const to = ymd(new Date(now + 5 * 86400e3));
  const json = await net.fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${from}-${to}`,
  );
  return { ...mapWorldCup(json, now), nowMs: now };
}
