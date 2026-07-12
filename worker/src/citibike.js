// Live Citi Bike availability from the public GBFS station_status feed (Lyft-
// hosted, keyless). Station names come from the bundled dataset on the client,
// so this only returns live counts keyed by station id. See spec
// docs/superpowers/specs/2026-07-12-citibike-widget-design.md.

export function mapCitibike(json, ids) {
  const byId = new Map();
  for (const s of json?.data?.stations ?? []) byId.set(s.station_id, s);
  const stations = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((s) => ({
      id: s.station_id,
      bikes: Number(s.num_bikes_available ?? 0),
      ebikes: Number(s.num_ebikes_available ?? 0),
      docks: Number(s.num_docks_available ?? 0),
      ok: s.is_renting === 1 && s.is_installed === 1,
    }));
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, stations };
}

export async function fetchCitibike(ids) {
  const res = await fetch('https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json');
  if (!res.ok) throw new Error(`citibike ${res.status}`);
  return mapCitibike(await res.json(), ids);
}
