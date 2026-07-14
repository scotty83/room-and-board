// Rebuild site/data/citibike-stations.json from Citi Bike GBFS station_information.
// Also prints the stations nearest the app's default location (DEFAULT_CONFIG.loc)
// as DEFAULT_CONFIG.citibike candidates. Re-run when Citi Bike adds/removes
// stations (rare). Usage: node tools/build-citibike-data.js
import { writeFileSync } from 'node:fs';

const FEED = 'https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json';
const ANCHOR = { lat: 40.7506, lon: -73.9971 }; // DEFAULT_CONFIG.loc — New York 10001

const hav = (a, b) => {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const dp = r(b.lat - a.lat), dl = r(b.lon - a.lon);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const res = await fetch(FEED);
const stations = (await res.json()).data.stations;
const bundle = stations
  .map((s) => ({ id: s.station_id, name: s.name }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(new URL('../site/data/citibike-stations.json', import.meta.url), JSON.stringify(bundle));

const near = [...stations].sort((a, b) => hav(ANCHOR, a) - hav(ANCHOR, b)).slice(0, 3);
console.log(`${bundle.length} stations written. Default (nearest the default location):`);
console.log(JSON.stringify(near.map((s) => ({ id: s.station_id, name: s.name }))));
