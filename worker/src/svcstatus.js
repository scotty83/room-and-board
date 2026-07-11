// Public cloud-service status, normalized for the Service Status widget.
// Every endpoint is public — no keys, no auth. A whitelisted registry maps
// service ids to their status APIs (never caller-supplied URLs), one small
// mapper per provider family normalizes to
//   { state: 'ok'|'minor'|'major'|'unknown', note, incidents: [{title, since, update}] }
// and a fetch/parse failure reports 'unknown' — a status board must never
// fake green. Shapes were probe-verified live 2026-07-11 and are pinned by
// the recorded fixtures in test/worker/fixtures/svc-*.json.
// See spec docs/superpowers/specs/2026-07-11-service-status-widget-design.md.

const clamp = (s) => String(s ?? '').slice(0, 500);
const firstLine = (s) => String(s ?? '').replace(/\*/g, '').split('\n')[0].slice(0, 140);

export function mapStatuspage(json) {
  const ind = json?.status?.indicator;
  const state = ind === 'none' ? 'ok' : ind === 'minor' || ind === 'maintenance' ? 'minor'
    : ind === 'major' || ind === 'critical' ? 'major' : 'unknown';
  return {
    state,
    note: String(json?.status?.description ?? ''),
    incidents: (json?.incidents ?? []).slice(0, 3).map((i) => ({
      title: String(i.name ?? ''),
      since: String(i.started_at ?? i.created_at ?? ''),
      update: clamp(i.incident_updates?.[0]?.body),
    })),
  };
}

export function mapSlack(json) {
  const active = json?.active_incidents ?? [];
  if (!active.length) return { state: json?.status === 'ok' ? 'ok' : 'unknown', note: 'All systems operational', incidents: [] };
  return {
    state: active.some((i) => i.type === 'outage') ? 'major' : 'minor',
    note: String(active[0].title ?? 'Active incident'),
    incidents: active.slice(0, 3).map((i) => ({
      title: String(i.title ?? ''), since: String(i.date_created ?? ''), update: clamp(i.notes?.[0]?.body),
    })),
  };
}

export function mapMicrosoft(json) {
  const svcs = json?.Services ?? [];
  if (!svcs.length) return { state: 'unknown', note: '', incidents: [] };
  const down = svcs.filter((s) => s.IsUp === false);
  if (!down.length) return { state: 'ok', note: String(json?.Title ?? 'All systems operational'), incidents: [] };
  return {
    state: 'major',
    note: `${down[0].Name} is down`,
    incidents: down.slice(0, 3).map((s) => ({ title: String(s.Name ?? ''), since: '', update: clamp(s.Message) })),
  };
}

export function mapGoogle(json, nowMs) {
  const active = (Array.isArray(json) ? json : []).filter((i) => !i.end || Date.parse(i.end) > nowMs);
  if (!active.length) return { state: 'ok', note: 'All systems operational', incidents: [] };
  return {
    state: 'minor',
    note: firstLine(active[0].external_desc),
    incidents: active.slice(0, 3).map((i) => ({
      title: firstLine(i.external_desc), since: String(i.begin ?? ''),
      update: clamp(i.updates?.[0]?.text ?? i.external_desc),
    })),
  };
}

export function mapWebex(json) {
  // Webex lists routine scheduled maintenance under unResolvedIncidents —
  // permanent yellow would make the signal worthless, so maintenance is not
  // "degraded" here (fixture: 3 open entries, all maintenance → ok).
  const isMaint = (i) => /maintenance/i.test(String(i.impact ?? '')) || /maintenance/i.test(String(i.incidentType ?? ''));
  const open = (json?.unResolvedIncidents ?? []).filter((i) => !i.deleted && !isMaint(i));
  if (!open.length) return { state: 'ok', note: 'All systems operational', incidents: [] };
  return {
    state: open.some((i) => /major|critical|outage/i.test(String(i.impact ?? ''))) ? 'major' : 'minor',
    note: String(open[0].incidentName ?? 'Active incident'),
    incidents: open.slice(0, 3).map((i) => ({
      title: String(i.incidentName ?? ''), since: String(i.createTime ?? ''), update: clamp(i.impact),
    })),
  };
}

export function mapAws(json, nowMs) {
  // data.json mixes resolved history into the same array (fixture events are
  // months old) — only an event from the last six hours counts as active.
  const RECENT_MS = 6 * 3600e3;
  const events = (Array.isArray(json) ? json : []).filter((e) => nowMs - Number(e.date) * 1000 < RECENT_MS);
  if (!events.length) return { state: 'ok', note: 'All systems operational', incidents: [] };
  return {
    state: 'minor',
    note: `${events[0].service_name}: ${events[0].summary}`,
    incidents: events.slice(0, 3).map((e) => ({
      title: `${e.service_name} (${e.region_name}): ${e.summary}`,
      since: new Date(Number(e.date) * 1000).toISOString(),
      update: clamp(e.event_log?.[e.event_log.length - 1]?.message),
    })),
  };
}

// AWS serves data.json as UTF-16 with a BOM — and it's big-endian (FE FF),
// which a hardcoded 'utf-16le' silently byte-swaps into garbage. Sniff the
// BOM so either endianness (or a future switch to UTF-8) parses correctly.
export function decodeBomJson(buffer) {
  const b = new Uint8Array(buffer);
  const enc = b[0] === 0xFE && b[1] === 0xFF ? 'utf-16be'
    : b[0] === 0xFF && b[1] === 0xFE ? 'utf-16le'
    : 'utf-8';
  return JSON.parse(new TextDecoder(enc).decode(b).replace(/^﻿/, ''));
}

const MAPPERS = { statuspage: mapStatuspage, slack: mapSlack, microsoft: mapMicrosoft, google: mapGoogle, webex: mapWebex, aws: mapAws };

export const SERVICES = {
  zoom: { label: 'Zoom', adapter: 'statuspage', url: 'https://status.zoom.us/api/v2/summary.json' },
  ubiquiti: { label: 'Ubiquiti', adapter: 'statuspage', url: 'https://status.ui.com/api/v2/summary.json' },
  cloudflare: { label: 'Cloudflare', adapter: 'statuspage', url: 'https://www.cloudflarestatus.com/api/v2/summary.json' },
  github: { label: 'GitHub', adapter: 'statuspage', url: 'https://www.githubstatus.com/api/v2/summary.json' },
  slack: { label: 'Slack', adapter: 'slack', url: 'https://status.slack.com/api/v2.0.0/current' },
  m365: { label: 'Microsoft 365', adapter: 'microsoft', url: 'https://portal.office.com/api/servicestatus/index' },
  gworkspace: { label: 'Google Workspace', adapter: 'google', url: 'https://www.google.com/appsstatus/dashboard/incidents.json' },
  webex: { label: 'Webex', adapter: 'webex', url: 'https://service-status.webex.com/customer/dashServices/891?commercial=true' },
  aws: { label: 'AWS', adapter: 'aws', url: 'https://status.aws.amazon.com/data.json' },
};

export async function fetchServiceStatuses(ids) {
  const settled = await Promise.allSettled(ids.map(async (id) => {
    const svc = SERVICES[id];
    // Full browser UA: CloudFront (AWS's status CDN) rejects thin/bot agents
    // from datacenter egress — same lesson as the Yahoo markets fetch.
    const res = await fetch(svc.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`svc ${id} ${res.status}`);
    // AWS is UTF-16-with-BOM (see decodeBomJson); everything else is plain JSON.
    const json = svc.adapter === 'aws' ? decodeBomJson(await res.arrayBuffer()) : await res.json();
    return { id, label: svc.label, ...MAPPERS[svc.adapter](json, Date.now()) };
  }));
  const services = settled.map((s, i) => (s.status === 'fulfilled' ? s.value
    : { id: ids[i], label: SERVICES[ids[i]].label, state: 'unknown', note: 'Status unavailable', incidents: [] }));
  if (services.every((s) => s.state === 'unknown')) throw new Error('all services unavailable');
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, services };
}
