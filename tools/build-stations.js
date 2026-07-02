// Builds site/data/stations-subway.json and stations-lirr.json from public
// MTA datasets. Run: node tools/build-stations.js
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = (name) => new URL(`../site/data/${name}`, import.meta.url);

// --- Subway: MTA stations dataset on data.ny.gov (Socrata, keyless) ---
const subwayRows = await (
  await fetch('https://data.ny.gov/resource/39hk-dx4f.json?$limit=600')
).json();
const BOROUGHS = { M: 'Manhattan', Bx: 'Bronx', Bk: 'Brooklyn', Q: 'Queens', SI: 'Staten Island' };
const subway = subwayRows
  .map((r) => ({
    id: r.gtfs_stop_id,
    name: r.stop_name,
    borough: BOROUGHS[r.borough] ?? r.borough,
    lines: (r.daytime_routes ?? '').split(/\s+/).filter(Boolean),
  }))
  .filter((s) => s.id && s.name && s.lines.length)
  .sort((a, b) => a.name.localeCompare(b.name));
await writeFile(OUT('stations-subway.json'), JSON.stringify(subway, null, 1));
console.log(`subway: ${subway.length} stations`);

// --- LIRR: static GTFS stops.txt (id + TrainTime stop_code + name) ---
const zipPath = join(tmpdir(), 'gtfslirr.zip');
const zip = await (await fetch('https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip')).arrayBuffer();
await writeFile(zipPath, Buffer.from(zip));
const stopsTxt = execFileSync('unzip', ['-p', zipPath, 'stops.txt'], { encoding: 'utf8' });

const unquote = (cell) => cell.replace(/^"|"$/g, '');
const [header, ...lines] = stopsTxt.trim().split(/\r?\n/);
const cols = header.split(',').map(unquote);
const idx = (name) => cols.indexOf(name);
const [iId, iCode, iName] = [idx('stop_id'), idx('stop_code'), idx('stop_name')];
const lirr = lines
  .map((line) => {
    const f = line.split(',').map(unquote); // no embedded commas in this feed
    return { id: f[iId], name: f[iName], tt: iCode >= 0 ? f[iCode] || null : null };
  })
  .filter((s) => s.id && s.name)
  .sort((a, b) => a.name.localeCompare(b.name));
if (lirr.length < 100) throw new Error(`suspiciously few LIRR stops: ${lirr.length}`);
await writeFile(OUT('stations-lirr.json'), JSON.stringify(lirr, null, 1));
console.log(`lirr: ${lirr.length} stations (tt codes: ${lirr.filter((s) => s.tt).length})`);
