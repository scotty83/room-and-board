// Companion setup page logic: build a config, POST it to the worker's code
// exchange, show the 6-char code. Reads #cfg= to pre-fill (QR round trip).

import { normalizeConfig, encodeConfig, decodeConfig, WIDGET_IDS, ART_CATS, DEFAULT_CONFIG } from '../config.js';
import { MIN_SIZE, firstFit } from '../layout.js';
import { WORKER_URL } from '../env.js';
import { toggleIn } from './pickers.js';
import { zipLookup } from '../geo.js';
import { escapeHtml } from '../util.js';
import { OFFICES, zoneLabel } from '../widgets/worldclock.js';
import { symbolKnown } from '../widgets/markets.js';
import { SUBWAY_LINES } from '../widgets/subway.js';
import { PATH_STATIONS, PATH_DIRS } from '../widgets/path.js';
import { BSKY_API } from '../widgets/posts.js';

const $ = (sel) => document.querySelector(sel);
export const WIDGET_LABELS = {
  weather: 'Weather',
  subway: 'NYC Subway',
  lirr: 'LIRR (Penn Station)',
  mnr: 'Metro-North (GCT)',
  njt: 'NJ Transit',
  path: 'PATH',
  ferry: 'NYC Ferry',
  bus: 'MTA Bus',
  markets: 'Markets',
  art: 'Art slideshow',
  history: 'This Day in History',
  aqi: 'Air & Sky',
  quote: 'Quote of the Day',
  wotd: 'Word of the Day',
  worldclock: 'World Clock',
  sports: 'My Teams (sports)',
  worldcup: 'World Cup 2026',
  news: 'Headlines',
  substack: 'Substack',
  bsky: 'Bluesky',
};
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
  await renderLirrDest();
  await renderRailDest('mnr-dest', 'data/stations-mnr.json', 'mnr');
  bindAlertCheck('mnr-alerts', 'mnr');
  renderSubwayLines();
  renderArtPrefs();
  bindAlertCheck('lirr-alerts', 'lirr');
  bindAlertCheck('njt-alerts', 'njt');
  await renderNjt();
  renderPath();
  await renderFerry();
  renderBusStops();
  renderTickers();
  renderWorldclockPrefs();
  await renderTeams();
  await renderNewsSources();
  renderPostsAccounts();
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

async function renderRailDest(selectId, dataUrl, group) {
  const stations = await (await fetch(dataUrl)).json();
  $('#' + selectId).innerHTML =
    `<option value="">Any station</option>` +
    stations.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  $('#' + selectId).value = cfg[group].dest;
  $('#' + selectId).addEventListener('change', (e) => (cfg[group].dest = e.target.value));
}

async function renderLirrDest() {
  return renderRailDest('lirr-dest', 'data/stations-lirr.json', 'lirr');
}

function bindAlertCheck(id, group) {
  const box = $('#' + id);
  box.checked = cfg[group].alerts;
  box.addEventListener('change', () => (cfg[group].alerts = box.checked));
}

function renderArtPrefs() {
  $('#art-every').value = String(cfg.art.every);
  $('#art-every').addEventListener('change', (e) => (cfg.art.every = Number(e.target.value)));
  $('#art-cats').innerHTML = ART_CATS.map(
    ([id, label]) => `<label><input type="checkbox" data-c="${id}" ${cfg.art.cats.includes(id) ? 'checked' : ''}> ${label}</label>`,
  ).join('');
  $('#art-cats').addEventListener('change', (e) => {
    const c = e.target.dataset.c;
    if (c) cfg.art.cats = toggleIn(cfg.art.cats, c);
  });
}

function renderSubwayLines() {
  const paint = () => {
    $('#sub-lines').innerHTML = SUBWAY_LINES.map((l) => {
      const on = cfg.subway.lines.includes(l);
      return `<button type="button" class="bullet bullet--${l} linechip ${on ? '' : 'linechip--off'}" data-l="${l}" role="switch" aria-checked="${on}">${l}</button>`;
    }).join('');
    $('#sub-lines').querySelectorAll('[data-l]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.subway.lines = toggleIn(cfg.subway.lines, b.dataset.l);
        paint();
      }),
    );
  };
  paint();
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
    try {
      const loc = await zipLookup(zip);
      if (!loc) throw new Error('no match');
      cfg.loc = loc;
      $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
    } catch {
      $('#loc-current').textContent = `Couldn't find ${zip}`;
    }
  });
}

function renderWorldclockPrefs() {
  const has = (label, zone) => cfg.worldclock.cities.some((c) => c.label === label && c.zone === zone);
  const rerender = () => {
    $('#wc-chips').innerHTML = cfg.worldclock.cities
      .map((c, i) => `<button type="button" data-wc-rm="${i}">${c.label} ✕</button>`).join('');
    $('#wc-chips').querySelectorAll('[data-wc-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.worldclock.cities = cfg.worldclock.cities.filter((_, i) => i !== Number(b.dataset.wcRm));
        rerender();
      }));
    $('#wc-offices').innerHTML = OFFICES.map(([label, zone], i) =>
      `<label><input type="checkbox" data-wc-office="${i}" ${has(label, zone) ? 'checked' : ''}> ${label}</label>`).join('');
    $('#wc-offices').querySelectorAll('[data-wc-office]').forEach((box) =>
      box.addEventListener('change', () => {
        const [label, zone] = OFFICES[Number(box.dataset.wcOffice)];
        cfg.worldclock.cities = box.checked && cfg.worldclock.cities.length < 10
          ? [...cfg.worldclock.cities, { label, zone }]
          : cfg.worldclock.cities.filter((c) => !(c.label === label && c.zone === zone));
        rerender();
      }));
  };
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  $('#wc-zone').innerHTML = zones.map((z) => `<option value="${z}">${zoneLabel(z)} — ${z}</option>`).join('');
  if (!zones.length) { $('#wc-zone').hidden = true; $('#wc-add').hidden = true; }
  $('#wc-add').addEventListener('click', () => {
    const zone = $('#wc-zone').value;
    if (!zone) return;
    const label = zoneLabel(zone);
    if (!has(label, zone) && cfg.worldclock.cities.length < 10) {
      cfg.worldclock.cities = [...cfg.worldclock.cities, { label, zone }];
      rerender();
    }
  });
  rerender();
}

const INDEX_NAMES = { '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq', '^GSPC': 'S&P 500' };

function renderTickers() {
  const chips = $('#sym-chips');
  const renderChips = () => {
    chips.innerHTML = cfg.markets.symbols
      .map((t) => `<button type="button" data-sym="${t}">${INDEX_NAMES[t] ?? t} ✕</button>`)
      .join('');
    chips.querySelectorAll('[data-sym]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.markets.symbols = cfg.markets.symbols.filter((t) => t !== b.dataset.sym);
        renderChips();
      }),
    );
  };
  renderChips();
  $('#sym-add').addEventListener('click', async () => {
    const t = $('#sym-code').value.trim().toUpperCase();
    if (!(/^[\^A-Z0-9.\-]{1,10}$/.test(t) && cfg.markets.symbols.length < 10 && !cfg.markets.symbols.includes(t))) return;
    const btn = $('#sym-add');
    btn.disabled = true;
    $('#sym-status').textContent = 'Checking…';
    if (await symbolKnown(t)) {
      cfg.markets.symbols = [...cfg.markets.symbols, t];
      $('#sym-code').value = '';
      $('#sym-status').textContent = '';
      renderChips();
    } else {
      $('#sym-status').textContent = `${t} isn't a known ticker — check the symbol.`;
    }
    btn.disabled = false;
  });
}

async function renderTeams() {
  const data = await (await fetch('data/teams.json')).json();
  const leagueSel = $('#team-league');
  const teamSel = $('#team-select');
  leagueSel.innerHTML = data.leagues.map((l, i) => `<option value="${i}">${l.label}</option>`).join('');
  const syncTeams = () => {
    const l = data.leagues[Number(leagueSel.value)];
    teamSel.innerHTML = l.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  };
  leagueSel.addEventListener('change', syncTeams);
  syncTeams();
  const chips = $('#team-chips');
  const byKey = {};
  for (const l of data.leagues) for (const t of l.teams) byKey[`${l.lg}:${t.id}`] = { ...t, label: l.label };
  const renderChips = () => {
    chips.innerHTML = cfg.sports.teams
      .map((sel) => {
        const t = byKey[`${sel.lg}:${sel.id}`];
        return `<button type="button" data-team="${sel.lg}:${sel.id}">${t ? t.name : sel.id} ✕</button>`;
      })
      .join('');
    chips.querySelectorAll('[data-team]').forEach((b) =>
      b.addEventListener('click', () => {
        const [lg, id] = b.dataset.team.split(':');
        cfg.sports.teams = cfg.sports.teams.filter((t) => !(t.lg === lg && t.id === id));
        renderChips();
      }),
    );
  };
  renderChips();
  $('#team-add').addEventListener('click', () => {
    const lg = data.leagues[Number(leagueSel.value)].lg;
    const id = teamSel.value;
    if (!cfg.sports.teams.some((t) => t.lg === lg && t.id === id) && cfg.sports.teams.length < 6) {
      cfg.sports.teams = [...cfg.sports.teams, { lg, id }];
      renderChips();
    }
  });
}

async function renderNewsSources() {
  const { NEWS_SOURCES } = await import('../widgets/news.js');
  $('#news-sources').innerHTML = NEWS_SOURCES.map(
    ([id, label, , , scope]) => `<label><input type="checkbox" data-n="${id}" ${cfg.news.sources.includes(id) ? 'checked' : ''}> ${label} <small>(${scope})</small></label>`,
  ).join('');
  $('#news-sources').addEventListener('change', (e) => {
    const id = e.target.dataset.n;
    if (id) cfg.news.sources = toggleIn(cfg.news.sources, id);
  });
}

function renderBusStops() {
  const chips = $('#bus-chips');
  const renderChips = () => {
    chips.innerHTML = cfg.bus.stops
      .map((c) => `<button type="button" data-stop="${c}">Stop ${c} ✕</button>`)
      .join('');
    chips.querySelectorAll('[data-stop]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.bus.stops = cfg.bus.stops.filter((s) => s !== b.dataset.stop);
        renderChips();
      }),
    );
  };
  renderChips();
  $('#bus-add').addEventListener('click', () => {
    const code = $('#bus-code').value.trim();
    if (/^\d{4,7}$/.test(code) && cfg.bus.stops.length < 2 && !cfg.bus.stops.includes(code)) {
      cfg.bus.stops = [...cfg.bus.stops, code];
      $('#bus-code').value = '';
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

// Shared follow-list field (substack pubs / bsky handles): chips + one
// validated text-input add flow.
function renderFollowField(prefix, cfgKey, listKey, validate) {
  const chips = $(`#${prefix}-chips`);
  const status = $(`#${prefix}-status`);
  const renderChips = () => {
    chips.innerHTML = cfg[cfgKey][listKey]
      .map((a, i) => `<button type="button" data-acct="${i}">${escapeHtml(a.label)} ✕</button>`)
      .join('');
    chips.querySelectorAll('[data-acct]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg[cfgKey][listKey] = cfg[cfgKey][listKey].filter((_, i) => i !== Number(b.dataset.acct));
        renderChips();
      }),
    );
  };
  renderChips();
  $(`#${prefix}-add`).addEventListener('click', async () => {
    const id = $(`#${prefix}-id`).value.trim().toLowerCase();
    const list = cfg[cfgKey][listKey];
    if (!id || list.length >= 6 || list.some((a) => a.id === id)) return;
    status.textContent = 'Checking…';
    try {
      const label = await validate(id);
      cfg[cfgKey][listKey] = [...list, { id, label }];
      $(`#${prefix}-id`).value = '';
      status.textContent = '';
      renderChips();
    } catch {
      status.textContent = `Couldn't find "${id}".`;
    }
  });
}

function renderPostsAccounts() {
  renderFollowField('substack', 'substack', 'pubs', async (id) => {
    const digest = await (await fetch(`${WORKER_URL}/posts/substack?pub=${encodeURIComponent(id)}`)).json();
    if (!digest.posts?.length) throw new Error('not found');
    return id.slice(0, 30);
  });
  renderFollowField('bsky', 'bsky', 'handles', async (id) => {
    const prof = await (await fetch(`${BSKY_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(id)}`)).json();
    if (!prof.handle) throw new Error('not found');
    return (prof.displayName || prof.handle).slice(0, 30);
  });
}

function renderPath() {
  $('#path-station').innerHTML = Object.entries(PATH_STATIONS)
    .map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
  $('#path-station').value = cfg.path.station;
  $('#path-station').addEventListener('change', (e) => (cfg.path.station = e.target.value));
  $('#path-dir').innerHTML = PATH_DIRS
    .map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  $('#path-dir').value = cfg.path.dir;
  $('#path-dir').addEventListener('change', (e) => (cfg.path.dir = e.target.value));
}

async function renderFerry() {
  try {
    const { stops } = await (await fetch('data/ferry.json')).json();
    $('#ferry-landing').innerHTML = stops
      .map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  } catch {
    $('#ferry-landing').innerHTML = '<option value="17">East 34th Street</option>';
  }
  $('#ferry-landing').value = cfg.ferry.landing;
  $('#ferry-landing').addEventListener('change', (e) => (cfg.ferry.landing = e.target.value));
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
