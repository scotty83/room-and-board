// Weather widget: Open-Meteo forecast (browser-direct, CORS-open, keyless)
// plus NWS active-alert banner. All time strings stay in the device-local
// timezone Open-Meteo returns (timezone=auto) — no Date parsing of API times.

import { escapeHtml } from '../util.js';
import { icon } from '../icons.js';

export const meta = { id: 'weather', title: 'Weather', refreshMs: 10 * 60 * 1000 };

// WMO weather interpretation codes → display label + icon key.
const WMO = new Map([
  [0, ['Clear', 'clear']],
  [1, ['Mostly clear', 'clear']],
  [2, ['Partly cloudy', 'partly']],
  [3, ['Overcast', 'cloudy']],
  [45, ['Fog', 'fog']],
  [48, ['Freezing fog', 'fog']],
  [51, ['Light drizzle', 'drizzle']],
  [53, ['Drizzle', 'drizzle']],
  [55, ['Heavy drizzle', 'drizzle']],
  [56, ['Freezing drizzle', 'sleet']],
  [57, ['Freezing drizzle', 'sleet']],
  [61, ['Light rain', 'rain']],
  [63, ['Rain', 'rain']],
  [65, ['Heavy rain', 'rain']],
  [66, ['Freezing rain', 'sleet']],
  [67, ['Freezing rain', 'sleet']],
  [71, ['Light snow', 'snow']],
  [73, ['Snow', 'snow']],
  [75, ['Heavy snow', 'snow']],
  [77, ['Snow grains', 'snow']],
  [80, ['Light showers', 'rain']],
  [81, ['Showers', 'rain']],
  [82, ['Heavy showers', 'rain']],
  [85, ['Snow showers', 'snow']],
  [86, ['Snow showers', 'snow']],
  [95, ['Thunderstorm', 'thunder']],
  [96, ['Thunderstorm w/ hail', 'thunder']],
  [99, ['Thunderstorm w/ hail', 'thunder']],
]);

export function wmoInfo(code) {
  const hit = WMO.get(code);
  return hit ? { label: hit[0], icon: hit[1] } : { label: '—', icon: 'clear' };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hourLabel(isoLocal) {
  const h = Number(isoLocal.slice(11, 13));
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function dayLabel(isoDate, index) {
  if (index === 0) return 'Today';
  // Parse as UTC noon to avoid TZ date shifts, then take the weekday.
  return DAY_NAMES[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
}

const SEVERITY_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

function pickAlert(alertsJson) {
  const feats = alertsJson?.features;
  if (!Array.isArray(feats) || feats.length === 0) return null;
  const ranked = feats
    .map((f) => f?.properties)
    .filter((p) => p && typeof p.event === 'string')
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    );
  if (!ranked.length) return null;
  return { event: ranked[0].event, headline: ranked[0].headline ?? ranked[0].event };
}

export function mapWeather(json, alertsJson) {
  const cur = json.current;
  const info = wmoInfo(cur.weather_code);
  // Hourly strip: the next 8 full hours after the current observation time.
  const startIdx = json.hourly.time.findIndex((t) => t > cur.time);
  const hourly = [];
  for (let i = Math.max(startIdx, 0); i < json.hourly.time.length && hourly.length < 8; i++) {
    hourly.push({
      h: hourLabel(json.hourly.time[i]),
      temp: Math.round(json.hourly.temperature_2m[i]),
      code: json.hourly.weather_code[i],
    });
  }
  const daily = json.daily.time.slice(0, 5).map((t, i) => ({
    day: dayLabel(t, i),
    hi: Math.round(json.daily.temperature_2m_max[i]),
    lo: Math.round(json.daily.temperature_2m_min[i]),
    code: json.daily.weather_code[i],
  }));
  return {
    now: {
      temp: Math.round(cur.temperature_2m),
      feels: Math.round(cur.apparent_temperature),
      code: cur.weather_code,
      label: info.label,
      icon: info.icon,
    },
    hourly,
    daily,
    sunrise: json.daily.sunrise[0],
    sunset: json.daily.sunset[0],
    alert: pickAlert(alertsJson),
  };
}

export function render(el, vm, _cfg) {
  const hourly = vm.hourly
    .map(
      (h) => `<div class="wx-hour">
        <span class="wx-hour__label">${escapeHtml(h.h)}</span>
        ${icon(wmoInfo(h.code).icon, 'icon--sm')}
        <span class="wx-hour__temp">${h.temp}°</span>
      </div>`,
    )
    .join('');
  const daily = vm.daily
    .map(
      (d) => `<div class="wx-day">
        <span class="wx-day__name">${escapeHtml(d.day)}</span>
        ${icon(wmoInfo(d.code).icon, 'icon--sm')}
        <span class="wx-day__hi">${d.hi}°</span><span class="wx-day__lo">${d.lo}°</span>
      </div>`,
    )
    .join('');
  el.innerHTML = `
    ${vm.alert ? `<div class="alert">${icon('thunder', 'icon--sm')}<span>${escapeHtml(vm.alert.event)}</span></div>` : ''}
    <div class="wx-now">
      ${icon(vm.now.icon, 'icon--xl wx-now__icon')}
      <div class="wx-now__main">
        <span class="wx-now__temp">${vm.now.temp}°</span>
        <span class="wx-now__label">${escapeHtml(vm.now.label)}</span>
        <span class="wx-now__feels">Feels like ${vm.now.feels}°</span>
      </div>
    </div>
    <div class="wx-hours">${hourly}</div>
    <div class="wx-days">${daily}</div>`;
}

export async function fetchData(cfg, net) {
  const { lat, lon } = cfg.loc;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code' +
    '&hourly=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    '&forecast_days=6&timezone=auto&temperature_unit=fahrenheit';
  const forecast = await net.fetchJSON(url);
  let alerts = null;
  try {
    alerts = await net.fetchJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
  } catch {
    // Alerts are an enhancement; the widget renders without them.
  }
  return mapWeather(forecast, alerts);
}
