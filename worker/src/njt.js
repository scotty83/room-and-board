// NJ Transit RailData upstream: token flow + response mapping.
// NOTE: the response-shape assumptions here (getToken -> {UserToken},
// getStationSchedule -> {ITEMS: [...]}) follow community RailData clients;
// verify against the live API when credentials are issued — all shape
// knowledge is confined to this file.

const BASE = 'https://raildata.njtransit.com/api/TrainData';

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// "02-Jul-2026 08:15:00 AM" (America/New_York) -> epoch seconds.
export function njtDateToEpoch(str) {
  const m = /^(\d{2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(str ?? '');
  if (!m) return null;
  let hour = Number(m[4]) % 12;
  if (m[7] === 'PM') hour += 12;
  const asUtc = Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), hour, Number(m[5]), Number(m[6]));
  // Determine the New York offset at that instant (handles EST/EDT).
  const nyString = new Date(asUtc).toLocaleString('en-US', { timeZone: 'America/New_York' });
  const nyAsUtc = Date.parse(`${nyString} UTC`);
  return Math.round((asUtc + (asUtc - nyAsUtc)) / 1000);
}

export function mapNjtUpstream(json, station) {
  const items = Array.isArray(json?.ITEMS) ? json.ITEMS : [];
  const trains = items
    .map((it) => ({
      time: njtDateToEpoch(it.SCHED_DEP_DATE),
      dest: String(it.DESTINATION ?? ''),
      line: String(it.LINE ?? ''),
      track: it.TRACK ? String(it.TRACK) : null,
      status: String(it.STATUS ?? ''),
    }))
    .filter((t) => t.time !== null)
    .sort((a, b) => a.time - b.time);
  return { station, updatedAt: Math.floor(Date.now() / 1000), stale: false, trains };
}

async function form(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) throw new Error(`njt upstream ${res.status}`);
  return res.json();
}

let cachedToken = null;

// Test hook: module-level token state must not leak between test cases.
export function resetNjtToken() {
  cachedToken = null;
}

export async function fetchNjtDepartures(env, station) {
  const getSchedule = async () => {
    if (!cachedToken) {
      const tok = await form(`${BASE}/getToken`, { username: env.NJT_USER, password: env.NJT_PASS });
      cachedToken = tok?.UserToken;
      if (!cachedToken) throw new Error('njt token missing');
    }
    return form(`${BASE}/getStationSchedule`, { token: cachedToken, station });
  };
  try {
    return mapNjtUpstream(await getSchedule(), station);
  } catch (err) {
    // One retry with a fresh token covers expiry-driven failures.
    cachedToken = null;
    return mapNjtUpstream(await getSchedule(), station);
  }
}

export async function fetchNjtStations(env) {
  if (!cachedToken) {
    const tok = await form(`${BASE}/getToken`, { username: env.NJT_USER, password: env.NJT_PASS });
    cachedToken = tok?.UserToken;
  }
  const json = await form(`${BASE}/getStationList`, { token: cachedToken });
  const items = Array.isArray(json) ? json : json?.STATIONS ?? [];
  return items
    .map((s) => ({ code: String(s.STATION_2CHAR ?? s.code ?? ''), name: String(s.STATIONNAME ?? s.name ?? '') }))
    .filter((s) => s.code && s.name);
}
