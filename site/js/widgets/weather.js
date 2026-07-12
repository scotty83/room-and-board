// Weather widget: Open-Meteo forecast (browser-direct, CORS-open, keyless)
// plus NWS active-alert banner. All time strings stay in the device-local
// timezone Open-Meteo returns (timezone=auto) — no Date parsing of API times.

import { escapeHtml, setCardNote } from '../util.js';
import { icon } from '../icons.js';

export const meta = { id: 'weather', title: 'Weather', refreshMs: 10 * 60 * 1000 };

// Inline SVG temperature trend. viewBox is 0..n across (points at column
// centers) and 0..100 down, stretched to the chart box with
// preserveAspectRatio="none" so it lines up with an n-column flex label row at
// ANY width. The stroke uses vector-effect="non-scaling-stroke" to stay a
// constant weight under that stretch. Domain is padded (min 6° window) so a
// calm night still shows a legible slope without being misleading.
function trendSvg(temps, gradId) {
  const n = temps.length;
  if (n < 2) return '';
  let lo = Math.min(...temps), hi = Math.max(...temps);
  if (hi - lo < 6) { const mid = (lo + hi) / 2; lo = mid - 3; hi = mid + 3; }
  else { lo -= 1; hi += 1; }
  const TOP = 14, BOT = 86;
  const xs = (i) => (i + 0.5).toFixed(2);
  const ys = (t) => (TOP + (1 - (t - lo) / (hi - lo)) * (BOT - TOP)).toFixed(2);
  const pts = temps.map((t, i) => `${xs(i)} ${ys(t)}`);
  const line = 'M' + pts.join(' L');
  const area = `M${xs(0)} 100 L` + pts.join(' L') + ` L${xs(n - 1)} 100 Z`;
  return `<svg class="wx-trend__chart" viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="wx-trend__g0"></stop><stop offset="1" class="wx-trend__g1"></stop>
      </linearGradient></defs>
      <path class="wx-trend__area" d="${area}" fill="url(#${gradId})"></path>
      <path class="wx-trend__line" d="${line}"></path>
    </svg>`;
}

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

// Format a rounded-Fahrenheit temp for display in the chosen unit ('F'|'C').
export function fmtTemp(fTemp, units) {
  return `${units === 'C' ? Math.round((fTemp - 32) * 5 / 9) : fTemp}°`;
}

export function render(el, vm, cfg) {
  // Location note in the card header ("New York 10001", "London, England (GB)")
  // — matters now that weather can track anywhere, not just the office.
  setCardNote(el, cfg?.loc?.label ?? '');
  const units = cfg?.loc?.units ?? 'F';

  // Size class is stamped on the card by main.js (cardFor) before render runs.
  const card = el.closest('.card');
  const w = Number(card?.dataset.w) || 3;
  const h = Number(card?.dataset.h) || 4;
  const big = w >= 5 || h >= 5;
  const nHours = big ? 8 : 6;
  const nDays = big ? 5 : 4;

  // Drive the accent from the CURRENT condition.
  if (card) card.dataset.cond = vm.now.icon;

  const hours = vm.hourly.slice(0, nHours);
  const days = vm.daily.slice(0, nDays);

  const tempsRow = hours
    .map((x) => `<span>${fmtTemp(x.temp, units)}</span>`)
    .join('');
  const hoursRow = hours
    .map((x) => `<span>${escapeHtml(x.h)}</span>`)
    .join('');
  const dayTiles = days
    .map(
      (d) => `<div class="wx-day">
          <span class="wx-day__name">${escapeHtml(d.day)}</span>
          ${icon(wmoInfo(d.code).icon, 'wx-day__ico wx-ico--' + wmoInfo(d.code).icon)}
          <span class="wx-day__hi">${fmtTemp(d.hi, units)}</span>
          <span class="wx-day__lo">${fmtTemp(d.lo, units)}</span>
        </div>`,
    )
    .join('');

  el.innerHTML = `
    ${vm.alert ? `<div class="alert">${icon('thunder', 'icon--sm')}<span>${escapeHtml(vm.alert.event)}</span></div>` : ''}
    <div class="wx-now">
      ${icon(vm.now.icon, 'wx-now__icon wx-ico--' + vm.now.icon)}
      <span class="wx-now__temp">${fmtTemp(vm.now.temp, units)}</span>
      <div class="wx-now__meta">
        <span class="wx-now__label">${escapeHtml(vm.now.label)}</span>
        <span class="wx-now__feels">Feels like ${fmtTemp(vm.now.feels, units)}</span>
      </div>
    </div>
    <div class="wx-rule"></div>
    <div class="wx-trend">
      <div class="wx-trend__row">${tempsRow}</div>
      ${trendSvg(hours.map((x) => x.temp), 'wx-trend-grad')}
      <div class="wx-trend__row wx-trend__row--hours">${hoursRow}</div>
    </div>
    <div class="wx-days">${dayTiles}</div>`;
}

// Rough US bounding boxes (continental, Alaska, Hawaii). Gates the US-only
// NWS alerts call — a non-US point would 400 on every refresh otherwise.
export function inUS(lat, lon) {
  return (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.9)
    || (lat >= 51 && lat <= 72 && lon >= -170 && lon <= -129)
    || (lat >= 18.5 && lat <= 22.5 && lon >= -160.5 && lon <= -154.5);
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
  if (inUS(lat, lon)) {
    try {
      alerts = await net.fetchJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
    } catch {
      // Alerts are an enhancement; the widget renders without them.
    }
  }
  return mapWeather(forecast, alerts);
}
