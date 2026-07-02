// Full-screen, tap-only settings overlay for the board. Left rail of
// sections; every control is a ≥56px touch target; no typing anywhere
// (setup codes use the on-page keypad, names come from the companion page).

import { normalizeConfig, encodeConfig, decodeConfig, WIDGET_IDS } from '../config.js';
import { saveConfig, loadCache } from '../store.js';
import { fetchJSON } from '../net.js';
import { WORKER_URL } from '../env.js';
import { escapeHtml } from '../util.js';
import {
  boroughs,
  linesForBorough,
  stationsForLine,
  toggleIn,
} from './pickers.js';
import { MIN_SIZE, firstFit } from '../layout.js';
import { ROUTE_NAMES } from '../widgets/lirr.js';
import { FEED_FOR_ROUTE } from '../widgets/subway.js';

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

// Displayed subway routes (feed variants like GS/FS/SR collapse into S).
const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', 'SI'];

const PRESET_LOCATIONS = [
  { label: 'Midtown Manhattan', lat: 40.754, lon: -73.984 },
  { label: 'Lower Manhattan', lat: 40.707, lon: -74.011 },
  { label: 'Downtown Brooklyn', lat: 40.694, lon: -73.985 },
  { label: 'Long Island City', lat: 40.745, lon: -73.949 },
  { label: 'Jersey City', lat: 40.728, lon: -74.078 },
  { label: 'Newark', lat: 40.735, lon: -74.172 },
  { label: 'White Plains', lat: 41.034, lon: -73.763 },
  { label: 'Mineola', lat: 40.747, lon: -73.641 },
  { label: 'Stamford', lat: 41.053, lon: -73.539 },
];

let state = null; // { cfg, root, section, stack }

export async function openSettings(cfg, { focus } = {}) {
  if (state) closeSettings();
  state = {
    cfg: structuredClone(cfg),
    root: document.querySelector('#settings-root'),
    section: focus === 'code' ? 'code' : 'widgets',
    stack: [],
    dirty: false,
  };
  state.root.innerHTML = `
    <div class="settings" role="dialog" aria-label="Settings">
      <aside class="settings__rail">
        <h1 class="settings__brand">Settings</h1>
        <nav class="settings__nav"></nav>
        <div class="settings__railfoot">
          <button class="btn btn--primary settings__save">Save</button>
          <button class="btn settings__close">Cancel</button>
        </div>
      </aside>
      <section class="settings__pane"></section>
    </div>`;
  state.root.querySelector('.settings__close').addEventListener('click', closeSettings);
  state.root.querySelector('.settings__save').addEventListener('click', saveAndClose);
  renderNav();
  renderSection();
}

export function closeSettings() {
  if (!state) return;
  state.root.innerHTML = '';
  state = null;
}

async function saveAndClose() {
  state.cfg.t = Math.floor(Date.now() / 1000);
  const cfg = normalizeConfig(state.cfg);
  await saveConfig(cfg);
  try {
    if (window.__signage?.bridge) {
      await window.__signage.bridge.sendConfig(await encodeConfig(cfg));
      window.__signage.vault = 'synced';
    }
  } catch {
    window.__signage.vault = 'offline';
  }
  closeSettings();
  location.reload(); // simplest correct way to apply layout/widget changes
}

const SECTIONS = [
  ['widgets', 'Widgets'],
  ['subway', 'Subway'],
  ['lirr', 'LIRR'],
  ['njt', 'NJ Transit'],
  ['weather', 'Weather location'],
  ['display', 'Display'],
  ['code', 'Setup code'],
  ['diag', 'Diagnostics'],
];

function renderNav() {
  const nav = state.root.querySelector('.settings__nav');
  nav.innerHTML = SECTIONS.map(
    ([id, label]) =>
      `<button class="settings__navitem ${id === state.section ? 'is-active' : ''}" data-section="${id}">${label}</button>`,
  ).join('');
  nav.querySelectorAll('[data-section]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.section = btn.dataset.section;
      state.stack = [];
      renderNav();
      renderSection();
    }),
  );
}

function pane() {
  return state.root.querySelector('.settings__pane');
}

function renderSection() {
  const renderers = {
    widgets: renderWidgets,
    subway: renderSubway,
    lirr: renderLirr,
    njt: renderNjt,
    weather: renderWeather,
    display: renderDisplay,
    code: renderCode,
    diag: renderDiag,
  };
  renderers[state.section]();
}

/* ---------- widgets ---------- */

function renderWidgets() {
  const layout = state.cfg.layout;
  const placed = new Set(layout.map((r) => r.id));
  pane().innerHTML = `
    <h2 class="pane__title">Widgets</h2>
    <p class="pane__hint">Toggle what appears on your dashboard. To move or resize widgets, close settings and tap the ✎ pencil button.</p>
    <div class="rows">${WIDGET_IDS.map((id) => {
      const on = placed.has(id);
      const canAdd = on || firstFit(layout, id, MIN_SIZE[id]) !== null;
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-toggle="${id}" role="switch"
          aria-checked="${on}" ${canAdd ? '' : 'disabled'}>
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${WIDGET_LABELS[id]}${canAdd ? '' : ' <small>(no room — resize others first)</small>'}</span>
      </div>`;
    }).join('')}</div>`;
  pane().querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      if (placed.has(id)) {
        state.cfg.layout = layout.filter((r) => r.id !== id);
      } else {
        const rect = firstFit(layout, id, MIN_SIZE[id]);
        if (rect) state.cfg.layout = [...layout, rect];
      }
      renderWidgets();
    }),
  );
}

/* ---------- subway ---------- */

let subwayStations = null;
async function getSubwayStations() {
  subwayStations ??= await fetchJSON('data/stations-subway.json');
  return subwayStations;
}

async function renderSubway() {
  const stations = await getSubwayStations();
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  const chips = state.cfg.subway.stops
    .map((stop) => {
      const parent = byId[stop.replace(/[NS]$/, '')];
      const dir = stop.endsWith('N') ? 'Uptown' : stop.endsWith('S') ? 'Downtown' : '';
      return `<button class="chip" data-remove-stop="${stop}">
        ${escapeHtml(parent?.name ?? stop)}${dir ? ` · ${dir}` : ''} ✕</button>`;
    })
    .join('');
  const lineChips = SUBWAY_LINES.map((l) => {
    const on = state.cfg.subway.lines.includes(l);
    return `<button class="bullet bullet--${l} linechip ${on ? '' : 'linechip--off'}" data-line="${l}"
      role="switch" aria-checked="${on}">${l}</button>`;
  }).join('');
  pane().innerHTML = `
    <h2 class="pane__title">Subway stops</h2>
    <p class="pane__hint">Up to 4 stops appear on the Subway card.</p>
    <div class="chips">${chips || '<span class="pane__empty">No stops chosen yet</span>'}</div>
    <button class="btn btn--primary" data-add>Add a stop</button>
    <p class="pane__hint">Lines to show at your stops — none selected means every line:</p>
    <div class="linechips">${lineChips}</div>
    <div class="drill"></div>`;
  pane().querySelectorAll('[data-line]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.subway.lines = toggleIn(state.cfg.subway.lines, chip.dataset.line);
      renderSubway();
    }),
  );
  pane().querySelectorAll('[data-remove-stop]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.subway.stops = state.cfg.subway.stops.filter((s) => s !== chip.dataset.removeStop);
      renderSubway();
    }),
  );
  pane().querySelector('[data-add]').addEventListener('click', () => drillBorough(stations));
}

function drillList(title, items, onPick) {
  const drill = pane().querySelector('.drill');
  drill.innerHTML = `
    <div class="drill__head">
      <button class="iconbtn" data-back aria-label="Back">←</button>
      <h3>${escapeHtml(title)}</h3>
    </div>
    <div class="drill__list">${items
      .map((it, i) => `<button class="drill__item" data-i="${i}">${it.html}</button>`)
      .join('')}</div>`;
  drill.querySelector('[data-back]').addEventListener('click', () => {
    const prev = state.stack.pop();
    if (prev) prev();
    else drill.innerHTML = '';
  });
  drill.querySelectorAll('[data-i]').forEach((btn) =>
    btn.addEventListener('click', () => onPick(items[Number(btn.dataset.i)])),
  );
}

function drillBorough(stations) {
  drillList(
    'Choose a borough',
    boroughs(stations).map((b) => ({ html: escapeHtml(b), value: b })),
    (pick) => {
      state.stack.push(() => drillBorough(stations));
      drillLine(stations, pick.value);
    },
  );
}

function drillLine(stations, borough) {
  drillList(
    `${borough} — choose a line`,
    linesForBorough(stations, borough).map((l) => ({
      html: `<span class="bullet bullet--${escapeHtml(l)}">${escapeHtml(l)}</span>`,
      value: l,
    })),
    (pick) => {
      state.stack.push(() => drillLine(stations, borough));
      drillStation(stations, borough, pick.value);
    },
  );
}

function drillStation(stations, borough, line) {
  drillList(
    `${line} train — choose a station`,
    stationsForLine(stations, borough, line).map((s) => ({ html: escapeHtml(s.name), value: s })),
    (pick) => {
      state.stack.push(() => drillStation(stations, borough, line));
      drillDirection(pick.value);
    },
  );
}

function drillDirection(station) {
  drillList(
    `${station.name} — direction`,
    [
      { html: 'Uptown / North', value: `${station.id}N` },
      { html: 'Downtown / South', value: `${station.id}S` },
    ],
    (pick) => {
      if (!state.cfg.subway.stops.includes(pick.value) && state.cfg.subway.stops.length < 4) {
        state.cfg.subway.stops = [...state.cfg.subway.stops, pick.value];
      }
      state.stack = [];
      renderSubway();
    },
  );
}

/* ---------- LIRR / NJT ---------- */

function renderLirr() {
  const branches = state.cfg.lirr.branches;
  pane().innerHTML = `
    <h2 class="pane__title">LIRR — Penn Station departures</h2>
    <p class="pane__hint">This board always shows trains leaving Penn Station (Grand Central trains are excluded). Pick branches to show — none selected means all branches:</p>
    <div class="rows">${Object.entries(ROUTE_NAMES).map(([routeId, name]) => {
      const on = branches.includes(routeId);
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-branch="${routeId}" role="switch" aria-checked="${on}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${escapeHtml(name)}</span>
      </div>`;
    }).join('')}</div>`;
  pane().querySelectorAll('[data-branch]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.lirr.branches = toggleIn(branches, btn.dataset.branch);
      renderLirr();
    }),
  );
}

async function renderNjt() {
  pane().innerHTML = `
    <h2 class="pane__title">NJ Transit</h2>
    <div class="kv"><span>Station</span><b>${escapeHtml(state.cfg.njt.station)}</b></div>
    <div class="drill"><p class="pane__hint">Loading stations…</p></div>`;
  try {
    const { stations } = await fetchJSON(`${WORKER_URL}/njt/stations`);
    drillList(
      'Choose a station',
      stations.map((s) => ({ html: escapeHtml(s.name), value: s })),
      (pick) => {
        state.cfg.njt.station = pick.value.code;
        renderNjt();
      },
    );
  } catch {
    pane().querySelector('.drill').innerHTML =
      '<p class="pane__empty">Station list unavailable — is the NJ Transit proxy configured?</p>';
  }
}

/* ---------- weather / display ---------- */

function renderWeather() {
  pane().innerHTML = `
    <h2 class="pane__title">Weather location</h2>
    <div class="kv"><span>Current</span><b>${escapeHtml(state.cfg.loc.label)}</b></div>
    <div class="rows">${PRESET_LOCATIONS.map(
      (p, i) =>
        `<button class="row row--tap ${p.label === state.cfg.loc.label ? 'is-selected' : ''}" data-loc="${i}">
          ${escapeHtml(p.label)}</button>`,
    ).join('')}</div>
    <p class="pane__hint">Or enter a ZIP code:</p>
    <div class="zip">
      <output class="zip__display" aria-live="polite"></output>
      <div class="keypad keypad--zip">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'Go'].map(
        (k) => `<button class="key" data-key="${k}">${k}</button>`,
      ).join('')}</div>
      <p class="zip__status"></p>
    </div>`;
  pane().querySelectorAll('[data-loc]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = PRESET_LOCATIONS[Number(btn.dataset.loc)];
      state.cfg.loc = { lat: p.lat, lon: p.lon, label: p.label };
      renderWeather();
    }),
  );
  let zip = '';
  const display = pane().querySelector('.zip__display');
  const status = pane().querySelector('.zip__status');
  pane().querySelectorAll('[data-key]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const k = btn.dataset.key;
      if (k === '⌫') zip = zip.slice(0, -1);
      else if (k === 'Go') {
        if (zip.length !== 5) return;
        status.textContent = 'Looking up…';
        try {
          const geo = await fetchJSON(
            `https://geocoding-api.open-meteo.com/v1/search?name=${zip}&count=1&language=en&format=json&countryCode=US`,
          );
          const hit = geo.results?.[0];
          if (!hit) throw new Error('no match');
          state.cfg.loc = { lat: hit.latitude, lon: hit.longitude, label: hit.name };
          renderWeather();
          return;
        } catch {
          status.textContent = `Couldn't find ${zip} — try a nearby preset.`;
        }
      } else if (zip.length < 5) zip += k;
      display.textContent = zip;
    }),
  );
}

function renderDisplay() {
  const opt = (group, value, label) => `
    <button class="row row--tap ${state.cfg[group] === value ? 'is-selected' : ''}" data-set="${group}:${value}">${label}</button>`;
  pane().innerHTML = `
    <h2 class="pane__title">Display</h2>
    <p class="pane__hint">Mode</p>
    <div class="rows">
      ${opt('mode', 'auto', 'Auto — dashboard at commute times, art otherwise')}
      ${opt('mode', 'dashboard', 'Always dashboard')}
      ${opt('mode', 'ambient', 'Always art')}
    </div>
    <p class="pane__hint">Greeting name: <b>${escapeHtml(state.cfg.name || 'not set')}</b> — set it from the companion page (Setup code section).</p>`;
  pane().querySelectorAll('[data-set]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [group, value] = btn.dataset.set.split(':');
      state.cfg[group] = value;
      renderDisplay();
    }),
  );
}

/* ---------- setup code + QR export ---------- */

function renderCode() {
  pane().innerHTML = `
    <h2 class="pane__title">Setup code</h2>
    <p class="pane__hint">Build your configuration at <b>${location.host}/setup</b> on any device, then enter the 6-character code here.</p>
    <output class="code__display" aria-live="polite">······</output>
    <div class="keypad keypad--code">${'ABCDEFGHJKMNPQRSTVWXYZ0123456789'.split('').map(
      (k) => `<button class="key" data-key="${k}">${k}</button>`,
    ).join('')}<button class="key key--wide" data-key="⌫">⌫</button></div>
    <p class="code__status"></p>
    <hr class="pane__rule">
    <p class="pane__hint">Or move this board's setup to your phone:</p>
    <button class="btn" data-qr>Show QR of current config</button>
    <div class="qr"></div>`;
  let code = '';
  const display = pane().querySelector('.code__display');
  const status = pane().querySelector('.code__status');
  pane().querySelectorAll('[data-key]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const k = btn.dataset.key;
      if (k === '⌫') code = code.slice(0, -1);
      else if (code.length < 6) code += k;
      display.textContent = code.padEnd(6, '·');
      if (code.length === 6) {
        status.textContent = 'Checking…';
        try {
          const { cfg: encoded } = await fetchJSON(`${WORKER_URL}/code/${code}`);
          const incoming = await decodeConfig(encoded);
          state.cfg = incoming;
          status.textContent = 'Applied! Review the other sections, then press Save.';
        } catch {
          status.textContent = 'Code not found (codes expire after an hour).';
          code = '';
          display.textContent = '······';
        }
      }
    }),
  );
  pane().querySelector('[data-qr]').addEventListener('click', async () => {
    const { default: qrcode } = await import('../vendor/qrcode.js');
    const encoded = await encodeConfig(normalizeConfig(state.cfg));
    const qr = qrcode(0, 'M');
    qr.addData(`https://${location.host}/setup#cfg=${encoded}`);
    qr.make();
    pane().querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4 });
  });
}

/* ---------- diagnostics ---------- */

function renderDiag() {
  const rows = state.cfg.layout.map(({ id }) => {
    const cache = loadCache(id);
    const age = cache ? Math.round((Date.now() / 1000 - cache.t) / 60) : null;
    return `<div class="kv"><span>${WIDGET_LABELS[id]}</span>
      <b>${age === null ? 'no data yet' : age < 1 ? 'fresh' : `${age} min ago`}</b></div>`;
  });
  pane().innerHTML = `
    <h2 class="pane__title">Diagnostics</h2>
    <div class="kv"><span>Config source</span><b>${window.__signage?.source ?? '—'}</b></div>
    <div class="kv"><span>Vault sync</span><b>${window.__signage?.vault ?? 'not connected'}</b></div>
    ${rows.join('')}
    <div class="kv"><span>User agent</span><b class="kv__small">${escapeHtml(navigator.userAgent)}</b></div>`;
}
