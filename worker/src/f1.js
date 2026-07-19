// Formula 1 digest, from Jolpica (the keyless community successor to Ergast).
// Four endpoints — next race, last-race results, driver + constructor standings —
// fanned out and merged into one digest, cached 1h at the route. Team colours
// and driver flags are added on the site, not here (this stays generic data).

const JOLPICA = 'https://api.jolpi.ca/ergast/f1/current';
// Full browser UA — thin datacenter agents get bounced by some hosts.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const num = (x) => Number(x);

function mapNext(j) {
  const r = j?.MRData?.RaceTable?.Races?.[0];
  if (!r) return null;
  return {
    name: String(r.raceName ?? ''),
    date: String(r.date ?? ''),
    circuit: String(r.Circuit?.circuitName ?? ''),
    country: String(r.Circuit?.Location?.country ?? ''),
  };
}

function mapPodium(j) {
  const r = j?.MRData?.RaceTable?.Races?.[0];
  if (!r?.Results?.length) return { lastRace: null, podium: null };
  const podium = r.Results.slice(0, 3).map((x) => ({
    pos: num(x.position),
    driver: String(x.Driver?.familyName ?? ''),
    nat: String(x.Driver?.nationality ?? ''),
    cid: String(x.Constructor?.constructorId ?? ''),
  }));
  return { lastRace: String(r.raceName ?? ''), podium };
}

function mapDrivers(j) {
  const list = j?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
  return list.map((s) => ({
    pos: num(s.position),
    name: String(s.Driver?.familyName ?? ''),
    nat: String(s.Driver?.nationality ?? ''),
    // A driver's CURRENT team is the last constructor listed for the season.
    cid: String(s.Constructors?.[s.Constructors.length - 1]?.constructorId ?? ''),
    pts: num(s.points),
  }));
}

function mapConstructors(j) {
  const list = j?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
  return list.map((s) => ({
    pos: num(s.position),
    cid: String(s.Constructor?.constructorId ?? ''),
    name: String(s.Constructor?.name ?? ''),
    pts: num(s.points),
  }));
}

// Pure: each argument is a parsed Jolpica JSON object (or null for a block that
// failed to fetch). Null blocks degrade to null/[] rather than throwing.
export function mapF1(nextJson, lastJson, driversJson, teamsJson) {
  const { lastRace, podium } = mapPodium(lastJson);
  return {
    updatedAt: Math.floor(Date.now() / 1000),
    stale: false,
    next: mapNext(nextJson),
    lastRace,
    podium,
    drivers: mapDrivers(driversJson),
    teams: mapConstructors(teamsJson),
  };
}

export async function fetchF1() {
  const get = async (path) => {
    const res = await fetch(`${JOLPICA}/${path}/?format=json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`jolpica ${path} ${res.status}`);
    return res.json();
  };
  const settled = await Promise.allSettled([
    get('next'), get('last/results'), get('driverStandings'), get('constructorStandings'),
  ]);
  if (settled.every((s) => s.status === 'rejected')) throw new Error('jolpica: all endpoints failed');
  const val = (s) => (s.status === 'fulfilled' ? s.value : null);
  const digest = mapF1(...settled.map(val));
  // A partial digest is fine to serve fresh but must not overwrite the complete
  // 24h stale backup (same guard as /markets).
  const partial = settled.some((s) => s.status === 'rejected');
  return { ...digest, ...(partial && { partial: true }) };
}
