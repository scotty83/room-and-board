// World clock: five fixed cities (per spec — not user-editable). Pure local
// time math via Intl; no network.

import { escapeHtml } from '../util.js';

export const meta = { id: 'worldclock', title: 'World Clock', refreshMs: 30 * 1000 };

export const CITIES = [
  ['New York', 'America/New_York'],
  ['Hyderabad', 'Asia/Kolkata'],
  ['London', 'Europe/London'],
  ['Los Angeles', 'America/Los_Angeles'],
  ['Hong Kong', 'Asia/Hong_Kong'],
];

const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', timeZone ? { timeZone, dateStyle: 'short' } : { dateStyle: 'short' }).format(date);

export function worldTimes(date) {
  const localDay = dayKey(date);
  return CITIES.map(([city, zone]) => {
    const zoneDay = dayKey(date, zone);
    return {
      city,
      time: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date),
      dayDiff: zoneDay === localDay ? 0 : zoneDay > localDay ? 1 : -1,
    };
  });
}

export async function fetchData() {
  return worldTimes(new Date());
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
