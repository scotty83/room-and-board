// "My Teams" composite: ESPN's team endpoint (record, logo, live/next event)
// plus the last completed game from the schedule endpoint. The schedule runs
// ~2 MB — far too heavy for gen1 boards — so it's digested here and cached
// long (results change at most a few times a day).

export const LEAGUE_PATHS = {
  mlb: 'baseball/mlb',
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1',
};

const score = (c) => {
  const v = c?.score?.value ?? c?.score?.displayValue ?? c?.score;
  return v === undefined || v === null || v === '' ? null : String(v);
};

function eventLine(comp, ourAbbr, { withWL = false } = {}) {
  const status = comp.status?.type ?? {};
  const us = comp.competitors.find((c) => c.team?.abbreviation === ourAbbr);
  const them = comp.competitors.find((c) => c !== us);
  const vsAt = us?.homeAway === 'home' ? 'vs' : '@';
  const opp = them?.team?.abbreviation ?? '?';
  if (status.state === 'pre') return `${vsAt} ${opp} · ${status.shortDetail ?? ''}`.trim();
  const usS = score(us);
  const themS = score(them);
  const wl = withWL && status.state === 'post'
    ? (Number(usS) > Number(themS) ? 'W ' : Number(usS) < Number(themS) ? 'L ' : 'T ')
    : '';
  return `${wl}${usS ?? '–'}-${themS ?? '–'} ${vsAt} ${opp} · ${status.shortDetail ?? ''}`.trim();
}

// Most recent completed game from a schedule payload -> compact line.
export function digestSchedule(schedJson, ourAbbr) {
  const done = (schedJson?.events ?? []).filter(
    (e) => e.competitions?.[0]?.status?.type?.state === 'post',
  );
  if (!done.length) return null;
  const last = done[done.length - 1];
  return eventLine(last.competitions[0], ourAbbr, { withWL: true });
}

export function pickLogo(logos = []) {
  const dark = logos.find((l) => l.rel?.includes('dark') && !l.rel?.includes('scoreboard'));
  return (dark ?? logos[0])?.href ?? null;
}

export function mapTeamSummary(teamJson, lastLine, lg) {
  const team = teamJson?.team;
  if (!team) return null;
  const row = {
    lg,
    abbr: team.abbreviation ?? '',
    name: team.shortDisplayName ?? team.displayName ?? '',
    record: team.record?.items?.[0]?.summary ?? '',
    // Prefer the dark-background variant (light marks) — default logos like
    // the Yankees' navy NY disappear on the dashboard's dark cards.
    logo: pickLogo(team.logos),
    state: 'none',
    line: 'No scheduled games',
    lastLine: lastLine ?? null,
  };
  const comp = team.nextEvent?.[0]?.competitions?.[0];
  if (comp) {
    row.state = comp.status?.type?.state ?? 'pre';
    row.line = eventLine(comp, team.abbreviation, { withWL: row.state === 'post' });
  }
  return row;
}

export async function fetchTeamSummary(env, lg, id) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${LEAGUE_PATHS[lg]}/teams/${id}`;
  const teamRes = await fetch(base);
  if (!teamRes.ok) throw new Error(`espn team ${teamRes.status}`);
  const teamJson = await teamRes.json();
  const abbr = teamJson?.team?.abbreviation ?? '';

  // Schedule digest: 30-min KV cache, best-effort.
  let lastLine = null;
  const key = `sched:${lg}:${id}`;
  const cachedAt = await env.CODES.get(`${key}:at`);
  if (cachedAt && Date.now() / 1000 - Number(cachedAt) < 1800) {
    lastLine = await env.CODES.get(`${key}:line`);
  } else {
    try {
      const schedRes = await fetch(`${base}/schedule`);
      if (schedRes.ok) lastLine = digestSchedule(await schedRes.json(), abbr);
      await env.CODES.put(`${key}:line`, lastLine ?? '');
      await env.CODES.put(`${key}:at`, String(Math.floor(Date.now() / 1000)));
    } catch {
      lastLine = null;
    }
  }
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, row: mapTeamSummary(teamJson, lastLine || null, lg) };
}
