// Ambient-mode info strip: a compact digest (temperature + next departures)
// assembled from whatever transit widgets the user has enabled, using their
// latest cached view models.

export function stripData(caches, cfg) {
  const enabled = new Set(cfg.widgets);
  const temp = enabled.has('weather') && caches.weather ? caches.weather.now?.temp ?? null : null;
  const transit = [];

  if (enabled.has('lirr') && caches.lirr) {
    const d = caches.lirr.departures?.[0];
    if (d) transit.push({ label: `LIRR · ${d.dest}${d.track ? ` · Tk ${d.track}` : ''}`, min: d.min });
  }
  if (enabled.has('mnr') && caches.mnr) {
    const d = caches.mnr.departures?.[0];
    if (d) transit.push({ label: `MNR · ${d.dest}`, min: d.min });
  }
  if (enabled.has('njt') && caches.njt) {
    const t = caches.njt.trains?.[0];
    if (t) transit.push({ label: `NJT · ${t.dest}${t.track ? ` · Tk ${t.track}` : ''}`, min: t.min });
  }
  return { temp, transit };
}

// Strip markup shared by ambient mode (#strip) and the art viewer's overlay.
export function stripHtml(data, now) {
  return `
    <span class="strip__time">${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    ${data.temp !== null ? `<span class="strip__temp">${data.temp}°</span>` : ''}
    ${data.transit
      .map((t) => `<span class="strip__transit">${t.label} <b>${t.min} min</b></span>`)
      .join('')}`;
}
