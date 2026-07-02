// Air quality + sun/moon widget. AQI from Open-Meteo's air-quality API
// (browser-direct); sunrise/sunset piggyback on the weather view model;
// moon phase is computed locally.

export const meta = { id: 'aqi', title: 'Air & Sky', refreshMs: 60 * 60 * 1000 };

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

export function mapAqi(aqJson, weatherVm, now) {
  const aqi = Math.round(aqJson.current.us_aqi);
  return {
    aqi,
    category: aqiCategory(aqi),
    sunrise: weatherVm?.sunrise ?? null,
    sunset: weatherVm?.sunset ?? null,
    moonPhase: moonPhase(now),
  };
}

export async function fetchData(cfg, net, deps = {}) {
  const { lat, lon } = cfg.loc;
  const aq = await net.fetchJSON(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`,
  );
  return mapAqi(aq, deps.weatherVm ?? null, new Date());
}
