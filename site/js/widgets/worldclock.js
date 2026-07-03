// World clock: user-configurable city list (cfg.worldclock.cities), displayed
// in order of current local time (earliest -> latest). Presets are the
// D. E. Shaw offices; any IANA zone can be added. Pure Intl math, no network.

import { escapeHtml } from '../util.js';

export const meta = { id: 'worldclock', title: 'World Clock', refreshMs: 30 * 1000 };

export const OFFICES = [
  ['New York', 'America/New_York'],
  ['Boston', 'America/New_York'],
  ['Rye', 'America/New_York'],
  ['Bermuda', 'Atlantic/Bermuda'],
  ['Kansas City', 'America/Chicago'],
  ['San Francisco', 'America/Los_Angeles'],
  ['London', 'Europe/London'],
  ['Luxembourg', 'Europe/Luxembourg'],
  ['Bengaluru', 'Asia/Kolkata'],
  ['Gurugram', 'Asia/Kolkata'],
  ['Hyderabad', 'Asia/Kolkata'],
  ['Hong Kong', 'Asia/Hong_Kong'],
  ['Shanghai', 'Asia/Shanghai'],
  ['Singapore', 'Asia/Singapore'],
];

// "America/Indiana/Indianapolis" -> "Indianapolis"
export const zoneLabel = (zone) => zone.split('/').pop().replace(/_/g, ' ');

const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', timeZone ? { timeZone, dateStyle: 'short' } : { dateStyle: 'short' }).format(date);

export function worldTimes(date, cities) {
  const localDay = dayKey(date);
  return cities
    .map(({ label, zone }) => {
      const zoneDay = dayKey(date, zone);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(date);
      const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      const dayDiff = zoneDay === localDay ? 0 : zoneDay > localDay ? 1 : -1;
      return {
        city: label,
        time: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date),
        dayDiff,
        sortKey: dayDiff * 1440 + get('hour') * 60 + get('minute'),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ city, time, dayDiff }) => ({ city, time, dayDiff }));
}

export async function fetchData(cfg) {
  return worldTimes(new Date(), cfg.worldclock.cities);
}

export function render(el, vm) {
  el.innerHTML = vm
    .map(
      (row) => `<div class="wc-row">
        <span class="wc-row__city">${escapeHtml(row.city)}</span>
        <span class="wc-row__time">${escapeHtml(row.time)}${
          row.dayDiff ? `<span class="wc-row__day">${row.dayDiff > 0 ? '+1d' : '−1d'}</span>` : ''
        }</span>
      </div>`,
    )
    .join('');
}
