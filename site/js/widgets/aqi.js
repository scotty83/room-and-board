// Air quality + sun/moon widget. AQI from Open-Meteo's air-quality API
// (browser-direct); sunrise/sunset piggyback on the weather view model;
// moon phase is computed locally.

import { escapeHtml } from '../util.js';
import { icon } from '../icons.js';

export const meta = { id: 'aqi', title: 'Air & Sky', refreshMs: 60 * 60 * 1000 };

const timeOnly = (iso) => {
  if (!iso) return '—';
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

export function render(el, vm, _cfg) {
  el.innerHTML = `
    <div class="sky">
      <div class="sky__aqi sky__aqi--${vm.aqi <= 50 ? 'good' : vm.aqi <= 100 ? 'moderate' : 'bad'}">
        <span class="sky__aqi-value">${vm.aqi}</span>
        <span class="sky__aqi-label">AQI · ${escapeHtml(vm.category)}</span>
      </div>
      <div class="sky__row">${icon('sun', 'icon--sm')}<span>Sunrise ${timeOnly(vm.sunrise)}</span></div>
      <div class="sky__row">${icon('moon', 'icon--sm')}<span>Sunset ${timeOnly(vm.sunset)}</span></div>
      <div class="sky__row">${icon('moon', 'icon--sm')}<span>${escapeHtml(vm.moonPhase.name)}</span></div>
    </div>`;
}

const CATEGORIES = [
  [50, 'Good'],
  [100, 'Moderate'],
  [150, 'Unhealthy for Sensitive Groups'],
  [200, 'Unhealthy'],
  [300, 'Very Unhealthy'],
  [Infinity, 'Hazardous'],
];

export function aqiCategory(aqi) {
  for (const [max, name] of CATEGORIES) if (aqi <= max) return name;
  return 'Hazardous';
}

// Synodic month approximation anchored at the 2000-01-06 18:14 UTC new moon.
const SYNODIC_DAYS = 29.53058867;
const ANCHOR_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
];

export function moonPhase(date) {
  const days = (date.getTime() - ANCHOR_NEW_MOON) / 86400000;
  const fraction = ((days / SYNODIC_DAYS) % 1 + 1) % 1;
  const index = Math.round(fraction * 8) % 8;
  return { name: PHASE_NAMES[index], fraction };
}

export function mapAqi(aqJson, sunJson, now) {
  const aqi = Math.round(aqJson.current.us_aqi);
  return {
    aqi,
    category: aqiCategory(aqi),
    sunrise: sunJson?.daily?.sunrise?.[0] ?? null,
    sunset: sunJson?.daily?.sunset?.[0] ?? null,
    moonPhase: moonPhase(now),
  };
}

export async function fetchData(cfg, net) {
  const { lat, lon } = cfg.loc;
  const [aq, sun] = await Promise.all([
    net.fetchJSON(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`,
    ),
    // Own tiny forecast call for sun times — no dependency on the weather
    // widget being enabled or having fetched first.
    net
      .fetchJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&forecast_days=1&timezone=auto`,
      )
      .catch(() => null),
  ]);
  return mapAqi(aq, sun, new Date());
}
