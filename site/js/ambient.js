// Ambient-mode info strip: a compact digest (temperature + next departures)
// assembled from whatever transit widgets the user has enabled, using their
// latest cached view models.

import { escapeHtml } from './util.js';

export function stripData(caches, cfg) {
  const enabled = new Set(cfg.widgets);
  // The weather VM stores canonical Fahrenheit and converts at the card's
  // render; the strip must convert too or a °C board shows Fahrenheit here.
  const rawF = enabled.has('weather') && caches.weather ? caches.weather.now?.temp ?? null : null;
  const temp = rawF === null ? null
    : (cfg.loc?.units === 'C' ? Math.round((rawF - 32) * 5 / 9) : rawF);
  const cond = temp === null ? null : (caches.weather.now?.label ?? null);
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
  return { temp, cond, transit };
}

// Strip markup shared by ambient mode (#strip) and the art viewer's overlay.
// showTime is suppressed under a clock-face screensaver — the clock already
// IS the time, so repeating it in the strip is pure duplication.
export function stripHtml(data, now, { showTime = true } = {}) {
  return `
    ${showTime ? `<span class="strip__time">${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>` : ''}
    ${data.temp !== null ? `<span class="strip__wx"><b>${data.temp}°</b>${data.cond ? ` ${escapeHtml(data.cond)}` : ''}</span>` : ''}
    ${data.transit
      .map((t) => `<span class="strip__transit">${escapeHtml(t.label)} <b>${t.min} min</b></span>`)
      .join('')}`;
}
