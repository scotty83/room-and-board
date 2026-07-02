// "My Teams" sports scores (per large-format scoreboard convention: one row
// per followed team — no league browsing on a glanceable display). Data is
// ESPN's public site API (keyless, CORS-open): each team's endpoint carries
// its record and current/next event, so live scores, finals and upcoming
// games all come from one small call per team.

import { escapeHtml } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'sports', title: 'My Teams', refreshMs: 2 * 60 * 1000 };

export const LEAGUE_PATHS = {
  mlb: 'baseball/mlb',
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1',
};

// ESPN team payload -> one glanceable row.
export function mapTeamRow(json, lg) {
  const team = json?.team;
  if (!team) return null;
  const row = {
    lg,
    abbr: team.abbreviation ?? '',
    name: team.shortDisplayName ?? team.displayName ?? '',
    record: team.record?.items?.[0]?.summary ?? '',
    state: 'none',
    line: 'No scheduled games',
  };
  const event = team.nextEvent?.[0];
  const comp = event?.competitions?.[0];
  if (!comp) return row;

  const status = comp.status?.type ?? {};
  const us = comp.competitors.find((c) => c.team?.abbreviation === team.abbreviation);
  const them = comp.competitors.find((c) => c !== us);
  const oppAbbr = them?.team?.abbreviation ?? '?';
  const vsAt = us?.homeAway === 'home' ? 'vs' : '@';
  const score = (c) => c?.score?.value ?? c?.score ?? null;

  row.state = status.state ?? 'pre'; // pre | in | post
  if (row.state === 'in' || row.state === 'post') {
    const usS = score(us);
    const themS = score(them);
    const wl = row.state === 'post' ? (Number(usS) > Number(themS) ? 'W ' : Number(usS) < Number(themS) ? 'L ' : 'T ') : '';
    row.line = `${wl}${usS ?? '–'}-${themS ?? '–'} ${vsAt} ${oppAbbr} · ${status.shortDetail ?? ''}`.trim();
  } else {
    row.line = `${vsAt} ${oppAbbr} · ${status.shortDetail ?? event.date?.slice(5, 10) ?? ''}`.trim();
  }
  return row;
}

export function render(el, vm, _cfg) {
  if (!vm.rows?.length) {
    el.innerHTML = '<div class="empty">Pick your teams in Settings → My Teams</div>';
    return;
  }
  const [w, h] = cardSize(el, [2, 2]);
  const cap = itemCapacity('sports', w, h);
  const shown = vm.rows.slice(0, cap);
  const hidden = vm.rows.length - shown.length;
  el.innerHTML =
    shown
      .map(
        (r) => `<div class="team ${r.state === 'in' ? 'team--live' : ''}">
          <span class="team__abbr">${escapeHtml(r.abbr)}</span>
          <div class="team__info">
            <span class="team__name">${escapeHtml(r.name)}${r.record ? ` <small>${escapeHtml(r.record)}</small>` : ''}</span>
            <span class="team__line">${r.state === 'in' ? '<b class="team__livedot">●</b> ' : ''}${escapeHtml(r.line)}</span>
          </div>
        </div>`,
      )
      .join('') +
    (hidden > 0 ? `<div class="more-hint">+${hidden} more team${hidden > 1 ? 's' : ''} — enlarge the card</div>` : '');
}

export async function fetchData(cfg, net) {
  const teams = cfg.sports?.teams ?? [];
  const rows = await Promise.all(
    teams.map(async ({ lg, id }) => {
      try {
        const json = await net.fetchJSON(
          `https://site.api.espn.com/apis/site/v2/sports/${LEAGUE_PATHS[lg]}/teams/${encodeURIComponent(id)}`,
        );
        return mapTeamRow(json, lg);
      } catch {
        return null;
      }
    }),
  );
  // Live games float to the top; otherwise keep the user's order.
  const list = rows.filter(Boolean);
  list.sort((a, b) => Number(b.state === 'in') - Number(a.state === 'in'));
  return { rows: list };
}
