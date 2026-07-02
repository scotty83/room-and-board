// Companion setup page logic: build a config, POST it to the worker's code
// exchange, show the 6-char code. Reads #cfg= to pre-fill (QR round trip).

import { normalizeConfig, encodeConfig, decodeConfig, WIDGET_IDS, DEFAULT_CONFIG } from '../config.js';
import { MIN_SIZE, firstFit } from '../layout.js';
import { ROUTE_NAMES } from '../widgets/lirr.js';
import { WORKER_URL } from '../env.js';
import { boroughs, linesForBorough, stationsForLine, toggleIn } from './pickers.js';

const $ = (sel) => document.querySelector(sel);
const WIDGET_LABELS = {
  weather: 'Weather',
  subway: 'NYC Subway',
  lirr: 'LIRR (Penn Station)',
  njt: 'NJ Transit',
  markets: 'Markets',
  art: 'Art slideshow',
  history: 'This Day in History',
  aqi: 'Air & Sky',
  quote: 'Quote of the Day',
  worldclock: 'World Clock',
};
const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', 'SI'];
const PRESETS = [
  ['Midtown Manhattan', 40.754, -73.984],
  ['Lower Manhattan', 40.707, -74.011],
  ['Downtown Brooklyn', 40.694, -73.985],
  ['Long Island City', 40.745, -73.949],
  ['Jersey City', 40.728, -74.078],
  ['Newark', 40.735, -74.172],
  ['White Plains', 41.034, -73.763],
  ['Mineola', 40.747, -73.641],
  ['Stamford', 41.053, -73.539],
];

let cfg = structuredClone(DEFAULT_CONFIG);
let subwayStations = [];

async function boot() {
  // Pre-fill from a scanned board QR (#cfg=...).
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.get('cfg')) {
    try {
      cfg = await decodeConfig(hash.get('cfg'));
    } catch {
      // fall through to defaults
    }
  }
  cfg = structuredClone(normalizeConfig(cfg));

  $('#name').value = cfg.name;
  renderWidgets();
  renderLocation();
  renderLirrBranches();
  renderSubwayLines();
  await Promise.all([renderSubway(), renderNjt()]);
  $('#mode').value = cfg.mode;

  $('#get-code').addEventListener('click', getCode);
}

function renderWidgets() {
  const placed = () => new Set(cfg.layout.map((r) => r.id));
  $('#widgets').innerHTML = WIDGET_IDS.map(
    (id) => `<label><input type="checkbox" data-w="${id}" ${placed().has(id) ? 'checked' : ''}> ${WIDGET_LABELS[id]}</label>`,
  ).join('');
  $('#widgets').addEventListener('change', (e) => {
    const id = e.target.dataset.w;
    if (!id) return;
    if (!e.target.checked) {
      cfg.layout = cfg.layout.filter((r) => r.id !== id);
    } else {
      const rect = firstFit(cfg.layout, id, MIN_SIZE[id]);
      if (rect) cfg.layout = [...cfg.layout, rect];
      else {
        e.target.checked = false;
        alert('No room on the grid for that widget — remove or shrink another one on the board first.');
      }
    }
  });
}

function renderLirrBranches() {
  $('#lirr-branches').innerHTML = Object.entries(ROUTE_NAMES)
    .map(
      ([routeId, name]) =>
        `<label><input type="checkbox" data-b="${routeId}" ${cfg.lirr.branches.includes(routeId) ? 'checked' : ''}> ${name}</label>`,
    )
    .join('');
  $('#lirr-branches').addEventListener('change', (e) => {
    const b = e.target.dataset.b;
    if (b) cfg.lirr.branches = toggleIn(cfg.lirr.branches, b);
  });
}

function renderSubwayLines() {
  $('#sub-lines').innerHTML = SUBWAY_LINES.map(
    (l) => `<label><input type="checkbox" data-l="${l}" ${cfg.subway.lines.includes(l) ? 'checked' : ''}> ${l}</label>`,
  ).join('');
  $('#sub-lines').addEventListener('change', (e) => {
    const l = e.target.dataset.l;
    if (l) cfg.subway.lines = toggleIn(cfg.subway.lines, l);
  });
}

function renderLocation() {
  $('#loc-preset').innerHTML =
    `<option value="">Choose a preset…</option>` +
    PRESETS.map(([label], i) => `<option value="${i}" ${label === cfg.loc.label ? 'selected' : ''}>${label}</option>`).join('');
  $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
  $('#loc-preset').addEventListener('change', (e) => {
    const p = PRESETS[Number(e.target.value)];
    if (!p) return;
    cfg.loc = { label: p[0], lat: p[1], lon: p[2] };
    $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
  });
  $('#zip-go').addEventListener('click', async () => {
    const zip = $('#zip').value.trim();
    if (!/^\d{5}$/.test(zip)) return;
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${zip}&count=1&language=en&format=json&countryCode=US`,
    );
    const hit = (await res.json()).results?.[0];
    if (hit) {
      cfg.loc = { lat: hit.latitude, lon: hit.longitude, label: hit.name };
      $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
    } else {
      $('#loc-current').textContent = `Couldn't find ${zip}`;
    }
  });
}

async function renderSubway() {
  subwayStations = await (await fetch('data/stations-subway.json')).json();
  const boroughSel = $('#sub-borough');
  const lineSel = $('#sub-line');
  const stationSel = $('#sub-station');
  boroughSel.innerHTML = boroughs(subwayStations)
    .map((b) => `<option>${b}</option>`)
    .join('');
  const syncLines = () => {
    lineSel.innerHTML = linesForBorough(subwayStations, boroughSel.value)
      .map((l) => `<option>${l}</option>`)
      .join('');
    syncStations();
  };
  const syncStations = () => {
    stationSel.innerHTML = stationsForLine(subwayStations, boroughSel.value, lineSel.value)
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join('');
  };
  boroughSel.addEventListener('change', syncLines);
  lineSel.addEventListener('change', syncStations);
  syncLines();

  const chips = $('#subway-chips');
  const byId = Object.fromEntries(subwayStations.map((s) => [s.id, s]));
  const renderChips = () => {
    chips.innerHTML = cfg.subway.stops
      .map((stop) => {
        const st = byId[stop.replace(/[NS]$/, '')];
        return `<button type="button" data-stop="${stop}">${st?.name ?? stop} ${stop.endsWith('N') ? '↑' : '↓'} ✕</button>`;
      })
      .join('');
    chips.querySelectorAll('[data-stop]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.subway.stops = cfg.subway.stops.filter((s) => s !== b.dataset.stop);
        renderChips();
      }),
    );
  };
  renderChips();
  $('#sub-add').addEventListener('click', () => {
    const stop = stationSel.value + $('#sub-dir').value;
    const station = byId[stationSel.value];
    if (station && !cfg.subway.stops.includes(stop) && cfg.subway.stops.length < 4) {
      cfg.subway.stops = [...cfg.subway.stops, stop];
      renderChips();
    }
  });
}

async function renderNjt() {
  try {
    const { stations } = await (await fetch(`${WORKER_URL}/njt/stations`)).json();
    $('#njt-station').innerHTML = stations
      .map((s) => `<option value="${s.code}">${s.name}</option>`)
      .join('');
  } catch {
    // keep the default option; the widget still works once the proxy is up
  }
  $('#njt-station').value = cfg.njt.station;
  $('#njt-station').addEventListener('change', (e) => (cfg.njt.station = e.target.value));
}

async function getCode() {
  cfg.name = $('#name').value.trim();
  cfg.mode = $('#mode').value;
  cfg.t = Math.floor(Date.now() / 1000);
  const encoded = await encodeConfig(normalizeConfig(cfg));
  const btn = $('#get-code');
  btn.disabled = true;
  btn.textContent = 'Getting code…';
  try {
    const res = await fetch(`${WORKER_URL}/code`, {
      method: 'POST',
      body: JSON.stringify({ cfg: encoded }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { code } = await res.json();
    $('#code').textContent = code;
    $('#code-out').hidden = false;
  } catch (err) {
    $('#code-out').hidden = false;
    $('#code').textContent = '—';
    $('#code-out').querySelector('p').textContent =
      `Couldn't reach the code service (${err.message}). Check that the Worker is deployed.`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Get my setup code';
  }
}

boot();
