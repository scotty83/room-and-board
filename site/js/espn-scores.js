// Pure ESPN scoreboard digests for the config-less Golf + Tennis cards.
// DOM-free on purpose: the worker imports this too (like gtfs.js) so the
// board-facing /golf and /tennis routes and the widgets' browser-direct
// fallback can never drift apart.

// Scoreboard payload -> { name, state, round, players[] } for the current
// (first) event. Players sort by leaderboard order; score is the relative
// total ("-10"); today is the current round's relative line when available.
export function mapGolf(payload) {
  const ev = payload?.events?.[0];
  if (!ev) return { name: null, state: 'none', round: null, players: [] };
  const comp = ev.competitions?.[0] ?? {};
  const status = comp.status?.type ?? ev.status?.type ?? {};
  const detail = status.detail ?? status.shortDetail ?? '';
  const round = (/Round (\d+)/i.exec(detail) || [])[1] ?? null;
  const players = (comp.competitors ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((c) => {
      // Last PLAYED round: an in-progress event appends a period-only stub
      // for the unplayed round, so scan back to a real displayValue.
      const line = (c.linescores ?? []).filter((l) => l?.displayValue != null).at(-1);
      return {
        pos: c.order ?? null,
        name: c.athlete?.shortName ?? c.athlete?.displayName ?? '',
        flag: c.athlete?.flag?.href ?? null, // ESPN CDN country flag PNG
        // ESPN has flipped score between string and {value, displayValue} on
        // sibling endpoints; tolerate both.
        score: c.score != null && typeof c.score === 'object' ? (c.score.displayValue ?? '') : c.score != null ? String(c.score) : '',
        today: line?.displayValue ?? '',
      };
    })
    .filter((p) => p.name);
  return {
    name: ev.shortName ?? ev.name ?? null,
    state: status.state ?? 'pre',
    // Off-week / pre-tournament: surface the start date instead of a board.
    startsAt: status.state === 'pre' ? Date.parse(ev.date ?? '') || null : null,
    round,
    players,
  };
}

// "6-2 6-2" from the two sides' per-set linescores.
const setline = (a, b) => {
  const as = a?.linescores ?? [];
  const bs = b?.linescores ?? [];
  const n = Math.max(as.length, bs.length);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const av = as[i]?.value;
    const bv = bs[i]?.value;
    if (av == null && bv == null) continue;
    parts.push(`${av ?? '–'}-${bv ?? '–'}`);
  }
  return parts.join(' ');
};

// Singles rows for one event. The tour label comes from the GROUPING name,
// not the feed: a single ESPN event can carry both draws (combined weeks
// like the Nordea Open appear identically in the atp AND wta scoreboards).
export function mapTennisEvent(ev) {
  const rows = [];
  for (const g of ev?.groupings ?? []) {
    const gname = g.grouping?.displayName ?? '';
    if (!/singles/i.test(gname)) continue;
    const tour = /women/i.test(gname) ? 'WTA' : 'ATP';
    for (const m of g.competitions ?? []) {
      const [a, b] = m.competitors ?? [];
      const nameOf = (side) => side?.athlete?.shortName ?? side?.athlete?.displayName ?? '';
      if (!nameOf(a) || !nameOf(b)) continue;
      const state = m.status?.type?.state ?? 'pre';
      const winnerB = !a?.winner && b?.winner;
      rows.push({
        id: m.id ?? null,
        tour,
        state,
        t: Date.parse(m.date ?? '') || 0,
        round: m.round?.displayName ?? '',
        a: nameOf(a),
        b: nameOf(b),
        aFlag: a?.athlete?.flag?.href ?? null,
        bFlag: b?.athlete?.flag?.href ?? null,
        // Winner-first when decided ("Bulgaru d. Strakhova 6-2 6-2"), else
        // the a-vs-b orientation matching the "a vs b" label.
        sets: winnerB ? setline(b, a) : setline(a, b),
        winner: a?.winner ? 'a' : b?.winner ? 'b' : null,
        // The leading date is noise on a today-focused card.
        detail: (m.status?.type?.shortDetail ?? '').replace(/^\d+\/\d+ - /, ''),
      });
    }
  }
  return rows;
}

// Merge the top event from each feed (deduped by event id — often the same
// combined tournament): live first, then upcoming (soonest first), then the
// freshest finals. The card note names the tournament(s).
export function mapTennis(atp, wta) {
  const events = [];
  const seenEv = new Set();
  for (const p of [atp, wta]) {
    const ev = p?.events?.[0];
    if (ev && !seenEv.has(ev.id)) {
      seenEv.add(ev.id);
      events.push(ev);
    }
  }
  const rows = [];
  const seenMatch = new Set();
  for (const ev of events) {
    for (const r of mapTennisEvent(ev)) {
      if (r.id && seenMatch.has(r.id)) continue;
      if (r.id) seenMatch.add(r.id);
      rows.push(r);
    }
  }
  const rank = { in: 0, pre: 1, post: 2 };
  rows.sort((x, y) => (rank[x.state] ?? 3) - (rank[y.state] ?? 3) || (x.state === 'post' ? y.t - x.t : x.t - y.t));
  const names = [...new Set(events.map((e) => e.shortName ?? e.name).filter(Boolean))];
  return { name: names.join(' · ') || null, rows };
}
