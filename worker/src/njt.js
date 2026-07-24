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
  const res = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`njt upstream ${res.status}`);
  return res.json();
}

// The RailData session token is the scarce resource: getToken is capped at just
// 10 requests/day (verified in the portal 2026-07-14), while the data endpoints
// allow 40,000/day. It lived in the Cache API first, but caches.default is
// COLO-LOCAL and evictable — every colo (and every eviction) minted its own
// token against the shared global cap, which is exactly the recurring
// exhaustion we kept hitting. The token now lives in KV: global, durable,
// ~1-2 writes/day (nowhere near the 1000/day write cap that keeps CODES
// codes-only for high-churn data; a token is the textbook low-write case).
// A module-level memo still short-circuits the KV read for warm isolates.
const TOKEN_KV_KEY = 'njt:token';
const TOKEN_TTL = 24 * 3600; // seconds (KV expirationTtl ceiling; real refresh is the 401 path)

let tokenMemo = null; // { token, until } per isolate

async function readToken(env) {
  if (tokenMemo && tokenMemo.until > Date.now()) return tokenMemo.token;
  try {
    const token = await env.CODES.get(TOKEN_KV_KEY);
    if (token) {
      tokenMemo = { token, until: Date.now() + 5 * 60 * 1000 };
      return token;
    }
  } catch {
    // KV unavailable — fall through to a fresh mint.
  }
  return null;
}

async function writeToken(env, token) {
  tokenMemo = { token, until: Date.now() + 5 * 60 * 1000 };
  try {
    await env.CODES.put(TOKEN_KV_KEY, token, { expirationTtl: TOKEN_TTL });
  } catch {
    // Best effort: a failed KV write just means a later isolate re-authenticates.
  }
}

// Dedupes concurrent mints within one isolate: when several requests hit a cold
// token cache at once (e.g. a burst of station-list/departure calls near
// midnight), the first mint's promise is shared by the rest instead of each one
// spending a getToken call. The Cache API is the cross-isolate guard; this is the
// same-isolate guard. Reset in resetNjtToken so it can't leak between test cases.
let tokenInFlight = null;

// Test hook: clear the cached token so state can't leak between cases.
export async function resetNjtToken(env) {
  tokenInFlight = null;
  tokenMemo = null;
  try {
    await env?.CODES?.delete(TOKEN_KV_KEY);
  } catch {
    // ignore
  }
}

// Return a usable token, minting a new one only when the cache is empty or when
// `fresh` forces it (after a 401). A minted token is cached for reuse.
async function njtToken(env, fresh = false) {
  if (!fresh) {
    const cached = await readToken(env);
    if (cached) return cached;
    if (tokenInFlight) return tokenInFlight; // a concurrent caller is already minting — join it
  }
  if (fresh) tokenMemo = null; // the current token is known-bad
  const mint = (async () => {
    const tok = await form(`${BASE}/getToken`, { username: env.NJT_USER, password: env.NJT_PASS });
    const token = tok?.UserToken;
    if (!token) throw new Error('njt token missing');
    await writeToken(env, token);
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

// Wraps a single NJT upstream call with the one-shot 401 re-auth: try with the
// cached token, and only on a token rejection spend a fresh mint and retry once.
// The station is always New York Penn (the board mirrors LIRR/Amtrak).
async function withReauth(env, oneCall) {
  try {
    return await oneCall(await njtToken(env, false));
  } catch (err) {
    if (!isAuthError(err)) throw err; // transient upstream failure — don't burn a token
    return oneCall(await njtToken(env, true)); // token expired: re-authenticate once
  }
}

// The day's static timetable (getStationSchedule). Split from alerts because the
// schedule is fetched once per service day while alerts refresh often.
export async function fetchNjtSchedule(env) {
  return withReauth(env, (token) =>
    form(`${BASE}/getStationSchedule`, { token, station: PENN }).then((j) => mapNjtUpstream(j, PENN)));
}

// Live station advisories (getStationMSG) — the dynamic delay banner.
export async function fetchNjtAlerts(env) {
  return withReauth(env, (token) =>
    form(`${BASE}/getStationMSG`, { token, station: PENN }).then(mapNjtMessages));
}

// America/New_York calendar date ('YYYY-MM-DD') — the service day a timetable is
// for. en-CA renders ISO-style; timeZone pins it to NJT's clock.
export function nyDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// getStationSchedule returns a STATIC full-day timetable, so we fetch it at most
// ONCE per service day and serve it all day from KV. KV (not the Cache API)
// because the Cache API is colo-local and evicts — which stranded the widget with
// 502s mid-outage. ~1 write/day is the same low-write exception the token uses,
// nowhere near the 1000/day cap. NJT's endpoint 500s most of the day and only
// recovers after its ~midnight reset, so one good fetch in that window keeps the
// widget correct for 24h even while the upstream is down. `stale:true` means we
// could not get today's copy and are serving a prior day's.
const SCHEDULE_KV_KEY = 'njt:schedule';
let scheduleMemo = null; // { date, vm, until } per isolate

const scheduleGood = (s, today) => s && s.date === today && s.vm?.trains?.length > 0;

export async function getNjtSchedule(env) {
  const today = nyDate();
  if (scheduleMemo && scheduleMemo.until > Date.now() && scheduleGood(scheduleMemo, today)) {
    return { ...scheduleMemo.vm, stale: false };
  }
  let stored = null;
  try {
    const raw = await env.CODES.get(SCHEDULE_KV_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch { /* KV read failed — fall through and fetch fresh */ }
  if (scheduleGood(stored, today)) {
    scheduleMemo = { date: today, vm: stored.vm, until: Date.now() + 5 * 60 * 1000 };
    return { ...stored.vm, stale: false };
  }
  try {
    const vm = await fetchNjtSchedule(env);
    // Only persist a non-empty timetable — an empty result is anomalous and must
    // not become the cached "today" (nor spend a KV write on every request).
    if (vm.trains?.length > 0) {
      scheduleMemo = { date: today, vm, until: Date.now() + 5 * 60 * 1000 };
      try {
        await env.CODES.put(SCHEDULE_KV_KEY, JSON.stringify({ date: today, vm }), { expirationTtl: 48 * 3600 });
      } catch { /* best effort: a later isolate re-fetches */ }
    }
    return { ...vm, stale: false };
  } catch (err) {
    if (stored?.vm) return { ...stored.vm, stale: true }; // last resort: a prior day's timetable
    throw err;
  }
}

// Test hook: clear the cached schedule (KV + isolate memo) so state can't leak
// between cases.
export async function resetNjtSchedule(env) {
  scheduleMemo = null;
  try { await env?.CODES?.delete(SCHEDULE_KV_KEY); } catch { /* ignore */ }
}
