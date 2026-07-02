// Records live API responses as test fixtures. Run once (or when refreshing
// fixtures): node tools/record-fixtures.js
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../test/fixtures/', import.meta.url);

const BINARY = {
  'subway.pb': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'lirr.pb': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr',
  'mnr.pb': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr',
};

const JSON_FIXTURES = {
  'open-meteo-forecast.json':
    'https://api.open-meteo.com/v1/forecast?latitude=40.754&longitude=-73.984&current=temperature_2m,apparent_temperature,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=6&timezone=auto&temperature_unit=fahrenheit',
  'open-meteo-aq.json':
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=40.754&longitude=-73.984&current=us_aqi&timezone=auto',
  'nws-alerts.json': 'https://api.weather.gov/alerts/active?point=40.754,-73.984',
  'wikimedia-onthisday.json':
    'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/07/02',
  'traintime-nyk.json': 'https://backend-unified.mylirr.org/arrivals/NYK',
  'yahoo-gspc.json':
    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=15m',
};

const EXTRA_HEADERS = {
  'traintime-nyk.json': { 'Accept-Version': '3.0' },
  'yahoo-gspc.json': {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  },
};

await mkdir(OUT, { recursive: true });

for (const [name, url] of Object.entries(BINARY)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await writeFile(new URL(name, OUT), Buffer.from(await res.arrayBuffer()));
  console.log(`recorded ${name}`);
}

for (const [name, url] of Object.entries(JSON_FIXTURES)) {
  const headers = EXTRA_HEADERS[name] ?? {};
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    await writeFile(new URL(name, OUT), JSON.stringify(body, null, 1));
    console.log(`recorded ${name}`);
  } catch (err) {
    console.warn(`SKIPPED ${name}: ${err.message}`);
  }
}
