// World clock: user-configurable city list (cfg.worldclock.cities), displayed
// in order of current local time (earliest -> latest). Presets are the
// D. E. Shaw offices; any IANA zone can be added. Pure Intl math, no network.

import { escapeHtml, clockTimeOpts, setMoreBadge } from '../util.js';
import { itemCapacity, cardSize } from '../capacity.js';

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

// Group ~400 IANA zones by the segment before the first "/" (so
// "America/Argentina/Buenos_Aires" lands under "America"); zones with no "/"
// (UTC, GMT, etc.) share a synthetic bucket. Input is alphabetical, so the
// keys and each group's zones come out sorted.
export function zonesByRegion(zones) {
  const out = {};
  for (const zone of zones) {
    const slash = zone.indexOf('/');
    const region = slash === -1 ? 'UTC / Other' : zone.slice(0, slash);
    (out[region] ??= []).push(zone);
  }
  return out;
}

const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', timeZone ? { timeZone, dateStyle: 'short' } : { dateStyle: 'short' }).format(date);

export function worldTimes(date, cities, clock24 = false) {
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
        time: new Intl.DateTimeFormat('en-US', { timeZone: zone, ...clockTimeOpts(clock24) }).format(date),
        dayDiff,
        sortKey: dayDiff * 1440 + get('hour') * 60 + get('minute'),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ city, time, dayDiff }) => ({ city, time, dayDiff }));
}

export async function fetchData(cfg) {
  return worldTimes(new Date(), cfg.worldclock.cities, cfg.clock24);
}

export function render(el, vm) {
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('worldclock', w, h);
  const shown = vm.slice(0, cap);
  const hidden = vm.length - shown.length;
  // Reserve the day-offset gutter on every row (only when some city actually
  // crosses a day boundary) so the +1d/−1d badge never shifts the time; and
  // split the hour into a fixed-width cell so the colon sits on one axis
  // whether the hour is one or two digits.
  el.classList.toggle('wc-has-day', shown.some((row) => row.dayDiff));
  el.innerHTML = shown
    .map((row) => {
      const ci = row.time.indexOf(':');
      const hh = row.time.slice(0, ci);
      const rest = row.time.slice(ci); // ":11 PM"
      const day = row.dayDiff > 0 ? '+1d' : row.dayDiff < 0 ? '−1d' : '';
      return `<div class="wc-row">
        <span class="wc-row__city">${escapeHtml(row.city)}</span>
        <span class="wc-row__time"><span class="wc-row__hh">${escapeHtml(hh)}</span>${escapeHtml(rest)}</span>
        <span class="wc-row__day">${day}</span>
      </div>`;
    })
    .join('');
  setMoreBadge(el, hidden);
}
