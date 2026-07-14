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
  const wall = Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), hour, Number(m[5]), Number(m[6]));
  // Two-pass offset: the NY offset must be sampled at the TRUE instant, not at
  // wall-time-misread-as-UTC — otherwise a DST-transition morning lands an hour
  // off (the offset differs by an hour across the ~5h gap). `add` is how much to
  // add to wall-as-UTC to reach true UTC (+4h EDT, +5h EST).
  const add = (t) => t - Date.parse(`${new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York' })} UTC`);
  const utc = wall + add(wall + add(wall));
  return Math.round(utc / 1000);
}

// Decode NJT's HTML numeric entities (e.g. "&#9992" -> ✈, the Newark Airport
// marker) and collapse whitespace, so the digest carries clean text (the widget
// HTML-escapes on render, which would otherwise show a literal "&#9992").
const decodeEntities = (s) =>
  String(s ?? '')
    .replace(/&#(\d+);?/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
    .replace(/\s+/g, ' ')
    .trim();

// getStationSchedule returns an ARRAY of station objects; the day's whole
// timetable is nested in the matching station's ITEMS. Verified against the live
// API 2026-07-14: it carries both directions plus Amtrak trains that share the
// station, and has NO real-time track or status — its TRACK field holds the line
// name and there is no STATUS field. So per-train track/status are dropped (live
// delays surface via getStationMSG -> alerts); trains terminating here (arrivals)
// and Amtrak trains are filtered out — NJT train ids are numeric while Amtrak's
// are letter-prefixed (e.g. "A2121"), which cleanly separates the two even when
// they share a line name. The site widget slices this whole-day list down to the
// next upcoming departures.
export function mapNjtUpstream(json, station) {
  const st = Array.isArray(json)
    ? (json.find((s) => s?.STATION_2CHAR === station) ?? json[0])
    : json; // tolerate a bare {ITEMS} object too
  const items = Array.isArray(st?.ITEMS) ? st.ITEMS : (Array.isArray(json?.ITEMS) ? json.ITEMS : []);
  const stationName = String(st?.STATIONNAME ?? '').trim();
  const trains = items
    .filter((it) => /^\d+$/.test(String(it?.TRAIN_ID ?? ''))) // numeric id = NJ Transit; letter-prefixed = Amtrak
    .map((it) => ({
      time: njtDateToEpoch(it.SCHED_DEP_DATE),
      dest: decodeEntities(it.DESTINATION),
      line: String(it.LINE ?? '').trim(),
      track: null, // this endpoint's TRACK is the line name, not a track number
      status: '', // getStationSchedule carries no live status
    }))
    .filter((t) =>
      t.time !== null &&
      t.dest && t.dest !== stationName) // drop trains terminating here (arrivals, not departures)
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

// Station advisories ride along with departures; failures leave alerts [].
export function mapNjtMessages(json) {
  const items = Array.isArray(json) ? json : json?.STATIONMSGS ?? [];
  return items
    .map((m) => ({ header: String(m?.MSG_TEXT ?? m?.msg_text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((m) => m.header.length > 0)
    .slice(0, 4);
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
  const withAlerts = async () => {
    const vm = mapNjtUpstream(await getSchedule(), station);
    try {
      vm.alerts = mapNjtMessages(await form(`${BASE}/getStationMSG`, { token: cachedToken, station }));
    } catch {
      vm.alerts = [];
    }
    return vm;
  };
  try {
    return await withAlerts();
  } catch (err) {
    // One retry with a fresh token covers expiry-driven failures.
    cachedToken = null;
    return withAlerts();
  }
}

export async function fetchNjtStations(env) {
  const getList = async () => {
    if (!cachedToken) {
      const tok = await form(`${BASE}/getToken`, { username: env.NJT_USER, password: env.NJT_PASS });
      cachedToken = tok?.UserToken;
      if (!cachedToken) throw new Error('njt token missing');
    }
    return form(`${BASE}/getStationList`, { token: cachedToken });
  };
  let json;
  try {
    json = await getList();
  } catch {
    // One retry with a fresh token covers expiry-driven failures (mirrors
    // fetchNjtDepartures).
    cachedToken = null;
    json = await getList();
  }
  const items = Array.isArray(json) ? json : json?.STATIONS ?? [];
  return items
    .map((s) => ({ code: String(s.STATION_2CHAR ?? s.code ?? ''), name: String(s.STATIONNAME ?? s.name ?? '') }))
    .filter((s) => s.code && s.name);
}
