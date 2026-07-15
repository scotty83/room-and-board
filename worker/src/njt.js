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

// The board is pinned to New York Penn Station: the widget mirrors LIRR/Amtrak
// (Penn-fixed, client-side line filter), so the upstream station is always NY.
const PENN = 'NY';

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
//
// Arrivals INTO Penn share the same ITEMS list as departures and previously
// leaked in as fake departures whenever their terminus wasn't literally "New
// York" (the old dest !== stationName check). getStationSchedule carries a
// DIRECTION field per train; at Penn, departures head out ("Westbound") while
// NY-bound arrivals come in ("Eastbound"), so we drop the inbound direction.
const PENN_ARRIVAL_DIRECTION = 'Eastbound'; // trains INTO Penn; departures are the other direction — VERIFY against live board before merge to main
export function mapNjtUpstream(json, station = PENN) {
  const st = Array.isArray(json)
    ? (json.find((s) => s?.STATION_2CHAR === PENN) ?? json[0])
    : json; // tolerate a bare {ITEMS} object too
  const items = Array.isArray(st?.ITEMS) ? st.ITEMS : (Array.isArray(json?.ITEMS) ? json.ITEMS : []);
  const stationName = String(st?.STATIONNAME ?? '').trim();
  const arrivalDir = PENN_ARRIVAL_DIRECTION.toLowerCase();
  const trains = items
    .filter((it) => /^\d+$/.test(String(it?.TRAIN_ID ?? ''))) // numeric id = NJ Transit; letter-prefixed = Amtrak
    .map((it) => ({
      time: njtDateToEpoch(it.SCHED_DEP_DATE),
      dest: decodeEntities(it.DESTINATION),
      line: String(it.LINE ?? '').trim(),
      direction: String(it.DIRECTION ?? ''),
      track: null, // this endpoint's TRACK is the line name, not a track number
      status: '', // getStationSchedule carries no live status
    }))
    .filter((t) =>
      t.time !== null &&
      t.dest &&
      t.direction.toLowerCase() !== arrivalDir && // drop arrivals INTO Penn (inbound direction)
      t.dest !== stationName) // safety: also drop anything terminating here by name
    .sort((a, b) => a.time - b.time);
  return { station: PENN, updatedAt: Math.floor(Date.now() / 1000), stale: false, trains };
}

async function form(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) throw new Error(`njt upstream ${res.status}`);
  return res.json();
}

// The RailData session token is the scarce resource: getToken is capped at just
// 10 requests/day (verified in the portal 2026-07-14), while the data endpoints
// allow 40,000/day. So the token is cached in the Cache API — NOT module-level
// memory — so it survives Cloudflare isolate eviction and is reused across every
// board and every fresh isolate in a colo. getToken then fires only ~once per
// token lifetime (driven by the 401 path below), not on each cold start. The TTL
// is a long ceiling; real refresh happens when the token actually expires upstream
// and a request gets a 401.
const TOKEN_KEY = 'https://njt-token.roomboard.internal/token';
const TOKEN_TTL = 24 * 3600; // seconds

async function readToken() {
  try {
    const hit = await caches.default.match(TOKEN_KEY);
    if (hit) return (await hit.text()) || null;
  } catch {
    // Cache unavailable (e.g. some test contexts) — fall back to a fresh token.
  }
  return null;
}

async function writeToken(token) {
  try {
    await caches.default.put(TOKEN_KEY, new Response(token, { headers: { 'Cache-Control': `max-age=${TOKEN_TTL}` } }));
  } catch {
    // Best effort: a failed cache write just means the next call re-authenticates.
  }
}

// Dedupes concurrent mints within one isolate: when several requests hit a cold
// token cache at once (e.g. a burst of station-list/departure calls near
// midnight), the first mint's promise is shared by the rest instead of each one
// spending a getToken call. The Cache API is the cross-isolate guard; this is the
// same-isolate guard. Reset in resetNjtToken so it can't leak between test cases.
let tokenInFlight = null;

// Test hook: clear the cached token so state can't leak between cases.
export async function resetNjtToken() {
  tokenInFlight = null;
  try {
    await caches.default.delete(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// Return a usable token, minting a new one only when the cache is empty or when
// `fresh` forces it (after a 401). A minted token is cached for reuse.
async function njtToken(env, fresh = false) {
  if (!fresh) {
    const cached = await readToken();
    if (cached) return cached;
    if (tokenInFlight) return tokenInFlight; // a concurrent caller is already minting — join it
  }
  const mint = (async () => {
    const tok = await form(`${BASE}/getToken`, { username: env.NJT_USER, password: env.NJT_PASS });
    const token = tok?.UserToken;
    if (!token) throw new Error('njt token missing');
    await writeToken(token);
    return token;
  })();
  // Only publish the non-forced mint: a `fresh` re-auth knows the current token
  // is bad, so it must not be handed to callers still holding the stale one.
  if (!fresh) tokenInFlight = mint;
  try {
    return await mint;
  } finally {
    if (!fresh && tokenInFlight === mint) tokenInFlight = null;
  }
}

// True when an upstream error was a token rejection (expired/invalid). Only these
// justify spending one of the 10 daily getToken calls; every other failure falls
// through to the cached()-served stale response instead.
const isAuthError = (err) => /\b401\b/.test(String(err?.message ?? ''));

// Station advisories ride along with departures; failures leave alerts [].
export function mapNjtMessages(json) {
  const items = Array.isArray(json) ? json : json?.STATIONMSGS ?? [];
  return items
    .map((m) => ({ header: String(m?.MSG_TEXT ?? m?.msg_text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((m) => m.header.length > 0)
    .slice(0, 4);
}

// The station is always New York Penn (the board mirrors LIRR/Amtrak); the
// `station` arg is ignored so old callers still resolve to Penn.
export async function fetchNjtDepartures(env, _station) {
  const run = async (fresh) => {
    const token = await njtToken(env, fresh);
    const vm = mapNjtUpstream(await form(`${BASE}/getStationSchedule`, { token, station: PENN }), PENN);
    try {
      vm.alerts = mapNjtMessages(await form(`${BASE}/getStationMSG`, { token, station: PENN }));
    } catch {
      vm.alerts = [];
    }
    return vm;
  };
  try {
    return await run(false);
  } catch (err) {
    if (!isAuthError(err)) throw err; // transient failure: let cached() serve stale, don't burn a token
    return run(true); // token expired: re-authenticate once
  }
}
