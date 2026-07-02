// Builds site/data/teams.json: pickable teams per league from ESPN's public
// API (keyless). Run: node tools/build-teams.js
import { writeFile } from 'node:fs/promises';

const LEAGUES = {
  mlb: ['baseball', 'mlb', 'MLB'],
  nfl: ['football', 'nfl', 'NFL'],
  nba: ['basketball', 'nba', 'NBA'],
  nhl: ['hockey', 'nhl', 'NHL'],
  mls: ['soccer', 'usa.1', 'MLS'],
  epl: ['soccer', 'eng.1', 'Premier League'],
};

const out = { leagues: [] };
for (const [lg, [sport, slug, label]] of Object.entries(LEAGUES)) {
  const json = await (
    await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/teams?limit=100`)
  ).json();
  const teams = (json.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map(({ team }) => ({ id: String(team.id), abbr: team.abbreviation, name: team.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (teams.length < 10) throw new Error(`suspiciously few teams for ${lg}: ${teams.length}`);
  out.leagues.push({ lg, label, sport, slug, teams });
  console.log(`${label}: ${teams.length} teams`);
}
await writeFile(new URL('../site/data/teams.json', import.meta.url), JSON.stringify(out, null, 1));
