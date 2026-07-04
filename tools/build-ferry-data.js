// Builds site/data/ferry.json from NYC Ferry's static GTFS. Run whenever
// NYC Ferry changes schedules (a stale trips map only degrades destination
// labels — the widget falls back to the trip's last stop name).
// Run: node tools/build-ferry-data.js
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ZIP_URL = 'https://nycferry.connexionz.net/rtt/public/resource/gtfs.zip';
const OUT = new URL('../site/data/ferry.json', import.meta.url);

const zipPath = join(tmpdir(), 'nycferry-gtfs.zip');
await writeFile(zipPath, Buffer.from(await (await fetch(ZIP_URL)).arrayBuffer()));

// These feeds quote every cell; none contain embedded commas.
function table(name) {
  const txt = execFileSync('unzip', ['-p', zipPath, name], { encoding: 'utf8' });
  const unquote = (c) => c.replace(/^"|"$/g, '');
  const [header, ...lines] = txt.trim().split(/\r?\n/);
  const cols = header.split(',').map(unquote);
  return lines.map((line) => {
    const f = line.split(',').map(unquote);
    return Object.fromEntries(cols.map((c, i) => [c, f[i]]));
  });
}

// Ferries only: RES/RWS in routes.txt are Rockaway shuttle buses (type 3).
const routeRows = table('routes.txt').filter((r) => r.route_type === '4');
const routes = Object.fromEntries(
  routeRows.map((r) => [r.route_id, { name: r.route_long_name, color: r.route_color }]),
);

const tripRows = table('trips.txt').filter((t) => routes[t.route_id]);
const trips = Object.fromEntries(tripRows.map((t) => [t.trip_id, [t.route_id, t.trip_headsign]]));

const ferryTripIds = new Set(tripRows.map((t) => t.trip_id));
const servedStopIds = new Set(
  table('stop_times.txt').filter((st) => ferryTripIds.has(st.trip_id)).map((st) => st.stop_id),
);
const stops = table('stops.txt')
  .filter((s) => servedStopIds.has(s.stop_id))
  .map((s) => ({ id: s.stop_id, name: s.stop_name }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (stops.length < 20) throw new Error(`suspiciously few ferry landings: ${stops.length}`);
if (Object.keys(trips).length < 500) throw new Error(`suspiciously few trips: ${Object.keys(trips).length}`);

await writeFile(OUT, JSON.stringify({ stops, trips, routes }, null, 1));
console.log(`ferry: ${stops.length} landings, ${Object.keys(trips).length} trips, ${Object.keys(routes).length} routes`);
