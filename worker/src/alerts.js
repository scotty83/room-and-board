// MTA service-alert digestion. The raw camsys feeds are large (the subway one
// runs ~800 KB), so the Worker reduces them to compact rows and the whole
// fleet shares one cached digest.

const FEEDS = {
  subway: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json',
  lirr: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Flirr-alerts.json',
};

// GTFS-RT ServiceAlerts (JSON flavor) -> [{routes, header}], active now only.
export function mapMtaAlerts(json, nowSec) {
  const out = [];
  const seen = new Set();
  for (const entity of json.entity ?? []) {
    const alert = entity.alert;
    if (!alert) continue;
    const periods = alert.active_period ?? [];
    const active =
      periods.length === 0 ||
      periods.some((p) => (p.start ?? 0) <= nowSec && (p.end === undefined || p.end >= nowSec));
    if (!active) continue;
    const routes = [
      ...new Set((alert.informed_entity ?? []).map((ie) => ie.route_id).filter(Boolean)),
    ];
    const en =
      alert.header_text?.translation?.find((t) => t.language === 'en') ??
      alert.header_text?.translation?.[0];
    if (!en?.text) continue;
    // Headers lead with "[A][C]" route tokens; the routes array carries that.
    const header = en.text.replace(/^(\s*\[[A-Z0-9]+\])+\s*/, '').trim();
    const key = header.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ routes, header });
  }
  return out.slice(0, 30);
}

export async function fetchMtaAlerts(system) {
  const res = await fetch(FEEDS[system]);
  if (!res.ok) throw new Error(`mta alerts ${res.status}`);
  const nowSec = Math.floor(Date.now() / 1000);
  return { updatedAt: nowSec, stale: false, alerts: mapMtaAlerts(await res.json(), nowSec) };
}
