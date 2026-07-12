// London TfL line status (Tube + Elizabeth + DLR + Overground) from the keyless
// TfL Unified API. One fleet-wide digest, cached at the route. An optional
// TFL_KEY only raises rate limits. See spec 2026-07-12-tfl-status-widget-design.md.

export function mapTfl(json) {
  const lines = (Array.isArray(json) ? json : []).map((l) => {
    const statuses = l.lineStatuses ?? [];
    const st = statuses.find((s) => s.statusSeverityDescription !== 'Good Service') ?? statuses[0] ?? {};
    const status = st.statusSeverityDescription ?? 'Unknown';
    return {
      id: l.id, name: l.name, mode: l.modeName,
      ok: status === 'Good Service', status, reason: String(st.reason ?? '').slice(0, 500),
    };
  });
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, lines };
}

export async function fetchTfl(env) {
  const key = env.TFL_KEY ? `?app_key=${env.TFL_KEY}` : '';
  const res = await fetch(`https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line/Status${key}`);
  if (!res.ok) throw new Error(`tfl ${res.status}`);
  return mapTfl(await res.json());
}
