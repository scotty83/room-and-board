// Companion setup page logic: build a config, POST it to the worker's code
// exchange, show the 6-char code. Reads #cfg= to pre-fill (QR round trip).

import { isRetired, isLaunched, normalizeConfig, encodeConfig, decodeConfig, WIDGET_IDS, WIDGET_GROUPS, ART_CATS, DEFAULT_CONFIG, NJT_LINES } from '../config.js';
import { firstFitAny } from '../layout.js';
import { WORKER_URL } from '../env.js';
import { toggleIn, searchStations } from './pickers.js';
import { locationSearch } from '../geo.js';
import { escapeHtml, parseAlbumToken, parseDriveFolder } from '../util.js';
import { OFFICES, zoneLabel, zonesByRegion } from '../widgets/worldclock.js';
import { symbolKnown, normalizeSymbol } from '../widgets/markets.js';
import { TFL_LINES, TFL_MODES } from '../tfl-lines.js';
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
  amtrak: 'Amtrak (Moynihan)',
  path: 'PATH',
  ferry: 'NYC Ferry',
  bus: 'Express Bus',
  markets: 'Markets',
  marketsnews: 'Markets News',
  art: 'Art slideshow',
  photos: 'iCloud Photos',
  gdrivephotos: 'GDrive Photos',
  services: 'Cloud Services',
  apod: 'NASA Daily Photo',
  chart: 'Chart of the Day',
  citibike: 'Citi Bike',
  tfl: 'TfL Status',
  history: 'This Day in History',
  aqi: 'Air & Sky',
  quote: 'Quote of the Day',
  wotd: 'Word of the Day',
  worldclock: 'World Clock',
  sports: 'My Teams (sports)',
  worldcup: 'World Cup 2026',
  f1: 'Formula 1',
  golf: 'Golf (PGA)',
  tennis: 'Tennis',
  iptv: 'Live Video (HLS)',
  news: 'Headlines',
  substack: 'Substack',
  bsky: 'Bluesky',
};

// Ordered config sections for the two-step /setup wizard. A section shows in
// step 2 iff any of its trigger widget ids is placed; a category divider shows
// iff its group has ≥1 visible section. Single source of truth for step-2
// visibility — triggers ⊆ WIDGET_IDS, group ∈ WIDGET_GROUPS (settings-logic.test).
export const SETUP_SECTIONS = [
  { id: 'subway-field', group: 'Commute', triggers: ['subway'] },
  { id: 'lirr-field', group: 'Commute', triggers: ['lirr'] },
  { id: 'mnr-field', group: 'Commute', triggers: ['mnr'] },
  { id: 'njt-field', group: 'Commute', triggers: ['njt'] },
  { id: 'amtrak-field', group: 'Commute', triggers: ['amtrak'] },
  { id: 'path-field', group: 'Commute', triggers: ['path'] },
  { id: 'ferry-field', group: 'Commute', triggers: ['ferry'] },
  { id: 'bus-field', group: 'Commute', triggers: ['bus'] },
  { id: 'citibike-field', group: 'Commute', triggers: ['citibike'] },
  { id: 'tfl-field', group: 'Commute', triggers: ['tfl'] },
  { id: 'weather-field', group: 'Weather & Air', triggers: ['weather', 'aqi'] },
  { id: 'markets-field', group: 'Markets & Sports', triggers: ['markets'] },
  { id: 'marketsnews-field', group: 'Markets & Sports', triggers: ['marketsnews'] },
  { id: 'sports-field', group: 'Markets & Sports', triggers: ['sports'] },
  { id: 'news-field', group: 'News & Social', triggers: ['news'] },
  { id: 'substack-field', group: 'News & Social', triggers: ['substack'] },
  { id: 'bsky-field', group: 'News & Social', triggers: ['bsky'] },
  { id: 'art-field', group: 'Ambient', triggers: ['art'] },
  { id: 'photos-field', group: 'Ambient', triggers: ['photos'] },
  { id: 'gdrivephotos-field', group: 'Ambient', triggers: ['gdrivephotos'] },
  { id: 'iptv-field', group: 'Ambient', triggers: ['iptv'] },
  { id: 'wc-field', group: 'Ambient', triggers: ['worldclock'] },
  { id: 'services-field', group: 'Daily Extras', triggers: ['services'] },
  { id: 'chart-field', group: 'Daily Extras', triggers: ['chart'] },
];

// Which step-2 config sections + category dividers are visible for a set of
// placed widget ids. Pure — drives the DOM apply step in the wizard.
export function stepTwoVisibility(placed) {
  const p = placed instanceof Set ? placed : new Set(placed);
  const sections = new Set();
  const groups = new Set();
  for (const s of SETUP_SECTIONS) {
    if (s.triggers.some((id) => p.has(id))) { sections.add(s.id); groups.add(s.group); }
  }
  return { sections, groups };
}

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
  $('#mode').value = cfg.mode;

  // Wire the critical controls FIRST — before any data-loading section render —
  // so a flaky fetch or a Pages per-asset deploy skew (which throws an import
  // SyntaxError) can't leave the Get-code / wizard buttons dead.
  $('#get-code').addEventListener('click', getCode);
  $('#get-signage-url').addEventListener('click', getSignageUrl);
  $('#copy-signage-url').addEventListener('click', copySignageUrl);
  $('#to-step-2').addEventListener('click', () => {
    applyStepTwo();
    $('#step-1').hidden = true;
    $('#step-2').hidden = false;
    window.scrollTo(0, 0);
  });
  $('#to-step-1').addEventListener('click', () => {
    $('#step-2').hidden = true;
    $('#step-1').hidden = false;
    window.scrollTo(0, 0);
  });

  // Each section renders independently: one failure is logged, not fatal, so a
  // single broken field can't blank the rest of the setup form.
  const safe = async (fn) => { try { await fn(); } catch (e) { console.error('[setup] section render failed', e); } };
  await safe(renderWidgets);
  await safe(renderLocation);
  await safe(renderSchedule);
  await safe(renderLirrDest);
  await safe(() => renderRailDest('mnr-dest', 'data/stations-mnr.json', 'mnr'));
  await safe(() => bindAlertCheck('mnr-alerts', 'mnr'));
  await safe(renderSubwayLines);
  await safe(renderArtPrefs);
  await safe(() => bindAlertCheck('lirr-alerts', 'lirr'));
  await safe(() => bindAlertCheck('njt-alerts', 'njt'));
  await safe(() => renderRailDest('amtrak-dest', 'data/stations-amtrak.json', 'amtrak'));
  await safe(() => bindAlertCheck('amtrak-alerts', 'amtrak'));
  await safe(renderNjt);
  await safe(renderPath);
  await safe(renderFerry);
  await safe(renderBusStops);
  await safe(renderCitibikeField);
  await safe(renderTflLines);
  await safe(renderTickers);
  await safe(renderMarketsNewsSources);
  await safe(renderWorldclockPrefs);
  await safe(renderTeams);
  await safe(renderNewsSources);
  await safe(renderPostsAccounts);
  await safe(renderPhotos);
  await safe(renderGdrivePhotos);
  await safe(renderServicesField);
  await safe(renderChartField);
  await safe(renderIptvField);
}

// Grouped checkbox HTML for the setup widget picker. `labels` is this page's
// WIDGET_LABELS (phone-length); `placed` is a Set of currently-placed ids.
// Exported for tests. Mirrors the board's widgetGroupsHtml.
export function widgetChecksHtml(labels, placed) {
  return WIDGET_GROUPS.map((g) => `
    <section class="wpick__group">
      <h3 class="wpick__title">${g.label}</h3>
      <div class="checks">${g.ids.filter((id) => placed.has(id) || (!isRetired(id) && isLaunched(id))).map((id) =>
        `<label><input type="checkbox" data-w="${id}" ${placed.has(id) ? 'checked' : ''}> ${labels[id]}</label>`,
      ).join('')}</div>
    </section>`).join('');
}

// Hide step-2 config sections + dividers that don't apply to the current picks.
function applyStepTwo() {
  const placed = new Set(cfg.layout.map((r) => r.id));
  const { sections, groups } = stepTwoVisibility(placed);
  for (const s of SETUP_SECTIONS) {
    const el = document.getElementById(s.id);
    if (el) el.hidden = !sections.has(s.id);
  }
  document.querySelectorAll('#step-2 [data-group]').forEach((d) => {
    d.hidden = !groups.has(d.dataset.group);
  });
}

// In-app notice replacing browser alert(): the native "…says" chrome broke
// the page's look, and its copy suggested actions (shrink) that aren't
// possible here. Tap or wait to dismiss.
let noticeTimer = null;
function notice(msg) {
  let t = document.getElementById('setup-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'setup-toast';
    t.className = 'toast';
    t.addEventListener('click', () => { t.hidden = true; });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { t.hidden = true; }, 6000);
}
function dismissNotice() {
  const t = document.getElementById('setup-toast');
  if (t) t.hidden = true;
  clearTimeout(noticeTimer);
}

function renderWidgets() {
  const placed = () => new Set(cfg.layout.map((r) => r.id));
  $('#widgets').innerHTML = widgetChecksHtml(WIDGET_LABELS, placed());
  $('#widgets').addEventListener('change', (e) => {
    const id = e.target.dataset.w;
    if (!id) return;
    // Acting on the picker makes any standing notice moot (a failed check
    // below re-raises it fresh).
    dismissNotice();
    if (!e.target.checked) {
      cfg.layout = cfg.layout.filter((r) => r.id !== id);
    } else {
      const rect = firstFitAny(cfg.layout, id);
      if (rect) cfg.layout = [...cfg.layout, rect];
      else {
        e.target.checked = false;
        // From here the only way to make space is deselecting (the board's
        // edit mode is where shrinking happens) — say exactly that.
        notice('No room left on the board for that widget — uncheck another widget to make space.');
      }
    }
  });
}

async function renderRailDest(selectId, dataUrl, group) {
  const stations = await (await fetch(dataUrl)).json();
  // No "Any station": a stops-at pick is required (the card prompts until one
  // is made). The placeholder keeps '' so skipping the section is possible.
  $('#' + selectId).innerHTML =
    `<option value="">Choose a station</option>` +
    stations.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  $('#' + selectId).value = cfg[group].dest;
  $('#' + selectId).addEventListener('change', (e) => (cfg[group].dest = e.target.value));
}

async function renderLirrDest() {
  $('#lirr-origin').value = cfg.lirr.origin ?? 'penn';
  $('#lirr-origin').addEventListener('change', (e) => (cfg.lirr.origin = e.target.value));
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

const M2HM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const HM2M = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function renderSchedule() {
  const sel = $('#mode'), editor = $('#schedule-editor'), rows = $('#schedule-rows');
  sel.value = cfg.mode;
  const paint = () => {
    editor.hidden = sel.value !== 'scheduled';
    rows.innerHTML = cfg.schedule.map((w, i) => `<div class="sched-row">
      <input type="time" step="900" data-i="${i}" data-t="start" value="${M2HM(w.start)}">
      <span>–</span>
      <input type="time" step="900" data-i="${i}" data-t="end" value="${M2HM(w.end)}">
      ${cfg.schedule.length > 1 ? `<button type="button" data-rm="${i}">✕</button>` : ''}
    </div>`).join('');
    rows.querySelectorAll('input[type="time"]').forEach((inp) =>
      inp.addEventListener('change', () => {
        if (!inp.value) return; // don't clobber on a cleared field
        cfg.schedule[Number(inp.dataset.i)][inp.dataset.t] = HM2M(inp.value);
      }));
    rows.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => { cfg.schedule = cfg.schedule.filter((_, i) => i !== Number(b.dataset.rm)); paint(); }));
  };
  sel.addEventListener('change', paint);
  $('#schedule-add').addEventListener('click', () => {
    if (cfg.schedule.length < 4) cfg.schedule = [...cfg.schedule, { start: 540, end: 1020 }];
    paint();
  });
  paint();
}

function renderLocation() {
  $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
  const paintUnits = () => $('#weather-field').querySelectorAll('[data-units]').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.units === (cfg.loc.units === 'C' ? 'C' : 'F')));
  $('#loc-go').addEventListener('click', async () => {
    const results = await locationSearch($('#loc-search').value);
    $('#loc-results').innerHTML = results.length
      ? results.map((r, i) => `<button type="button" class="btn" data-pick="${i}">${escapeHtml(r.label)}</button>`).join('')
      : '<span class="hint">No matches. Try a city name or a 5-digit US ZIP.</span>';
    $('#loc-results').querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = results[Number(b.dataset.pick)];
        // Picking sets units by region (US → °F, else °C); the toggle overrides.
        cfg.loc = { lat: r.lat, lon: r.lon, label: r.label, units: r.cc === 'US' ? 'F' : 'C' };
        $('#loc-results').innerHTML = '';
        $('#loc-search').value = '';
        $('#loc-current').textContent = `Current: ${cfg.loc.label}`;
        paintUnits();
      }));
  });
  paintUnits();
  $('#weather-field').querySelectorAll('[data-units]').forEach((b) =>
    b.addEventListener('click', () => { cfg.loc = { ...cfg.loc, units: b.dataset.units }; paintUnits(); }));
}

function renderWorldclockPrefs() {
  const has = (label, zone) => cfg.worldclock.cities.some((c) => c.label === label && c.zone === zone);
  const rerender = () => {
    $('#wc-chips').innerHTML = cfg.worldclock.cities
      .map((c, i) => `<button type="button" data-wc-rm="${i}">${escapeHtml(c.label)} ✕</button>`).join('');
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
  const byRegion = zonesByRegion(zones);
  const regions = Object.keys(byRegion);
  const fillZones = (region) => {
    $('#wc-zone').innerHTML = (byRegion[region] || [])
      .map((z) => `<option value="${z}">${zoneLabel(z)} — ${z}</option>`).join('');
  };
  $('#wc-region').innerHTML = regions.map((r) => `<option value="${r}">${r}</option>`).join('');
  if (regions.length) fillZones(regions[0]);
  $('#wc-region').addEventListener('change', () => fillZones($('#wc-region').value));
  if (!zones.length) { $('#wc-region').hidden = true; $('#wc-zone').hidden = true; $('#wc-add').hidden = true; }
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
    // Normalize BEFORE validating: "£CBG" used to fail the regex silently
    // (the £ never even produced a message) — now it becomes CBG.L.
    const t = normalizeSymbol($('#sym-code').value);
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
      const tip = /^[A-Z]{1,6}$/.test(t) ? ' If it trades outside the US, add the exchange suffix: London CBG.L, Frankfurt SAP.DE, Toronto SHOP.TO.' : '';
      $('#sym-status').textContent = `${t} isn't a known ticker. Check the symbol.${tip}`;
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
        return `<button type="button" data-team="${escapeHtml(sel.lg)}:${escapeHtml(sel.id)}">${escapeHtml(t ? t.name : sel.id)} ✕</button>`;
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

async function renderMarketsNewsSources() {
  const { MARKET_SOURCES } = await import('../widgets/marketsnews.js');
  $('#marketsnews-sources').innerHTML = MARKET_SOURCES.map(
    ([id, label]) => `<label><input type="checkbox" data-mn="${id}" ${cfg.marketsnews.sources.includes(id) ? 'checked' : ''}> ${label}</label>`,
  ).join('');
  $('#marketsnews-sources').addEventListener('change', (e) => {
    const id = e.target.dataset.mn;
    if (id) cfg.marketsnews.sources = toggleIn(cfg.marketsnews.sources, id);
  });
}

// Live Video: two plain inputs (URL + optional label) bound straight to cfg.
function renderIptvField() {
  const url = document.getElementById('iptv-url');
  const label = document.getElementById('iptv-label');
  const warn = document.getElementById('iptv-url-warn');
  url.value = cfg.iptv?.url ?? '';
  label.value = cfg.iptv?.label ?? '';
  url.addEventListener('input', () => {
    const v = url.value.trim();
    cfg.iptv = { ...cfg.iptv, url: v };
    // Mirror normalizeConfig's rule so a doomed URL isn't a silent surprise.
    warn.hidden = !v || /^https:\/\/\S+$/i.test(v);
  });
  label.addEventListener('input', () => { cfg.iptv = { ...cfg.iptv, label: label.value.trim() }; });
}

async function renderChartField() {
  const { CHART_TOPICS } = await import('../widgets/chart-topics.js');
  const allSlugs = CHART_TOPICS.map(([, slug]) => slug);
  const box = $('#chart-topics');
  box.innerHTML =
    `<label><input type="checkbox" id="chart-all-cb"> <b>Select all</b></label>` +
    CHART_TOPICS.map(
      ([label, slug]) => `<label><input type="checkbox" data-topic="${escapeHtml(slug)}"> ${escapeHtml(label)}</label>`,
    ).join('');
  const syncAll = () => { $('#chart-all-cb').checked = allSlugs.every((s) => cfg.chart.topics.includes(s)); };
  const syncTopics = () => box.querySelectorAll('[data-topic]').forEach((cb) => { cb.checked = cfg.chart.topics.includes(cb.dataset.topic); });
  syncTopics();
  syncAll();
  box.addEventListener('change', (e) => {
    if (e.target.id === 'chart-all-cb') {
      cfg.chart.topics = e.target.checked ? [...allSlugs] : [];
      syncTopics();
      return;
    }
    const slug = e.target.dataset.topic;
    if (slug) { cfg.chart.topics = toggleIn(cfg.chart.topics, slug); syncAll(); }
  });
  const pol = $('#chart-politics');
  pol.checked = cfg.chart.excludePolitics;
  pol.addEventListener('change', () => { cfg.chart.excludePolitics = pol.checked; });
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

let expressBusData = null;
function renderTflLines() {
  const paint = () => {
    $('#tfl-lines').innerHTML = TFL_MODES.map((g) => {
      const chips = TFL_LINES.filter((l) => l.mode === g).map((l) => {
        const on = cfg.tfl.lines.includes(l.id);
        return `<button type="button" class="tflchip ${on ? '' : 'tflchip--off'}" data-l="${l.id}" role="switch" aria-checked="${on}">
          <span class="tflchip__dot" style="background:${l.color}"></span>${escapeHtml(l.name)}</button>`;
      }).join('');
      return `<h3 class="setup__subhead">${g}</h3><div class="tflchips">${chips}</div>`;
    }).join('');
    $('#tfl-lines').querySelectorAll('[data-l]').forEach((b) =>
      b.addEventListener('click', () => { cfg.tfl.lines = toggleIn(cfg.tfl.lines, b.dataset.l); paint(); }));
  };
  paint();
}

let cbStations = null; // citibike station bundle, fetched once
async function renderCitibikeField() {
  cbStations ??= await fetch('data/citibike-stations.json').then((r) => r.json());
  const input = $('#citibike-search');
  const list = $('#citibike-matches');
  const chipsEl = $('#citibike-chips');
  const drawChips = () => {
    chipsEl.innerHTML = cfg.citibike.stations
      .map((s, i) => `<button type="button" class="chip" data-remove="${i}">${escapeHtml(s.name)} ✕</button>`).join('');
    chipsEl.querySelectorAll('[data-remove]').forEach((c) =>
      c.addEventListener('click', () => { cfg.citibike.stations = cfg.citibike.stations.filter((_, i) => i !== Number(c.dataset.remove)); drawChips(); }));
  };
  input.addEventListener('input', () => {
    const chosenIds = new Set(cfg.citibike.stations.map((s) => s.id));
    const matches = searchStations(cbStations, input.value, chosenIds, 15);
    list.innerHTML = matches.map((s) => (s.added
      ? `<span class="btn picklist__item--added">${escapeHtml(s.name)} ✓ Added</span>`
      : `<button type="button" class="btn" data-add="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button>`)).join('');
    list.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => {
        if (cfg.citibike.stations.length >= 6) return;
        cfg.citibike.stations = [...cfg.citibike.stations, { id: b.dataset.add, name: b.dataset.name }];
        input.value = ''; list.innerHTML = ''; drawChips();
      }));
  });
  drawChips();
}

async function renderBusStops() {
  const { expressRoutes, directionsForRoute, stopsForRouteDir } = await import('./pickers.js');
  expressBusData ??= await fetch('data/express-bus.json').then((r) => r.json());
  const chips = $('#bus-chips');
  const routeSel = $('#bus-route'), dirSel = $('#bus-dir'), stopSel = $('#bus-stop');
  const opt = (v, t) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`;
  const paintChips = () => {
    chips.innerHTML = cfg.bus.legs.map((l, i) => `<button type="button" class="chip" data-remove="${i}">${escapeHtml(l.route)} · ${escapeHtml(l.stopName)} ✕</button>`).join('');
    chips.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { cfg.bus.legs = cfg.bus.legs.filter((_, i) => i !== Number(b.dataset.remove)); paintChips(); }));
  };
  routeSel.innerHTML = expressRoutes(expressBusData).map((r) => opt(r.id, r.id)).join('');
  const paintDirs = () => { dirSel.innerHTML = directionsForRoute(expressBusData, routeSel.value).map((d) => opt(d.id, d.headsign || `Direction ${d.id}`)).join(''); paintStops(); };
  const paintStops = () => { stopSel.innerHTML = stopsForRouteDir(expressBusData, routeSel.value, Number(dirSel.value)).map((s) => opt(s.id, s.name)).join(''); };
  routeSel.addEventListener('change', paintDirs);
  dirSel.addEventListener('change', paintStops);
  paintDirs();
  $('#bus-add').addEventListener('click', () => {
    if (cfg.bus.legs.length >= 2) return;
    const route = expressRoutes(expressBusData).find((r) => r.id === routeSel.value);
    const name = stopsForRouteDir(expressBusData, routeSel.value, Number(dirSel.value)).find((s) => s.id === stopSel.value)?.name ?? '';
    cfg.bus.legs = [...cfg.bus.legs, { route: route.id, lineRef: route.lineRef, dir: Number(dirSel.value), stopId: stopSel.value, stopName: name }];
    paintChips();
  });
  paintChips();
}

// New York Penn is fixed (mirrors LIRR/Amtrak); the user filters by line. No
// selection = all lines. Modeled on the Markets News source checkboxes.
function renderNjt() {
  $('#njt-lines').innerHTML = NJT_LINES.map(
    (l) => `<label><input type="checkbox" data-njt="${escapeHtml(l)}" ${cfg.njt.lines.includes(l) ? 'checked' : ''}> ${escapeHtml(l)}</label>`,
  ).join('');
  $('#njt-lines').addEventListener('change', (e) => {
    const line = e.target.dataset.njt;
    if (line) cfg.njt.lines = toggleIn(cfg.njt.lines, line);
  });
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

const renderPhotos = () => renderPhotoField('icloud');
const renderGdrivePhotos = () => renderPhotoField('gdrive');

// One setup-form photo field, keyed by source. iCloud → cfg.photos, Drive →
// cfg.gdrivephotos; the two widgets are independent, so /setup can configure
// either or both. Screensaver is exclusive: turning one on clears the other's.
function renderPhotoField(src) {
  const gd = src === 'gdrive';
  const key = gd ? 'gdrivephotos' : 'photos';
  const otherKey = gd ? 'photos' : 'gdrivephotos';
  const pre = gd ? 'gdrivephotos' : 'photos';
  $(`#${pre}-ss`).checked = cfg[key].screensaver;
  $(`#${pre}-every`).value = String(cfg[key].every);
  $(`#${pre}-album`).value = cfg[key].album;
  $(`#${pre}-every`).addEventListener('change', (e) => (cfg[key].every = Number(e.target.value)));
  $(`#${pre}-ss`).addEventListener('change', (e) => {
    cfg[key].screensaver = e.target.checked;
    if (e.target.checked && cfg[otherKey].screensaver) {
      cfg[otherKey].screensaver = false; // screensaver is exclusive across the photo widgets
      const other = $(`#${otherKey}-ss`);
      if (other) other.checked = false;
    }
  });
  $(`#${pre}-add`).addEventListener('click', async () => {
    const id = gd ? parseDriveFolder($(`#${pre}-album`).value) : parseAlbumToken($(`#${pre}-album`).value);
    const status = $(`#${pre}-status`);
    if (!id) { status.textContent = `That doesn't look like a ${gd ? 'Drive folder' : 'album'} link.`; return; }
    status.textContent = 'Checking…';
    try {
      const endpoint = gd
        ? `${WORKER_URL}/gdrive/album?folder=${encodeURIComponent(id)}`
        : `${WORKER_URL}/icloud/album?token=${encodeURIComponent(id)}`;
      const res = await fetch(endpoint);
      if (res.status === 503) { status.textContent = 'The server needs a Google Drive key (GDRIVE_KEY).'; return; }
      const digest = await res.json();
      if (!digest.photos?.length) throw new Error('empty');
      cfg[key].album = id;
      status.textContent = `Found ${digest.photos.length} photos.`;
    } catch {
      status.textContent = gd
        ? "Couldn't open that folder. Make sure it's shared to Anyone with the link."
        : "Couldn't open that album. Check Public Website is on and the link is exact.";
    }
  });
}

async function renderServicesField() {
  const { SERVICE_CHOICES } = await import('../widgets/services.js');
  $('#services-list').innerHTML = SERVICE_CHOICES.map(
    ([id, label]) => `<label><input type="checkbox" data-svc="${id}" ${cfg.services.list.includes(id) ? 'checked' : ''}> ${label}</label>`,
  ).join('');
  $('#services-list').addEventListener('change', (e) => {
    const id = e.target.dataset?.svc;
    if (id) cfg.services.list = toggleIn(cfg.services.list, id);
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

// Cfg-only signage URL for non-touch devices (pasted into xConfiguration
// Standby Signage Url). NEVER includes auth — that fragment part is the
// macro's rotating bridge credential and must not leave its board.
export function signageUrlFor(host, encoded) {
  return `https://${host}/#cfg=${encoded}`;
}

// Copy the generated URL: clipboard API first, else select the text and try
// the legacy command so one tap still works on older phone browsers; worst
// case the URL is left selected for a manual copy.
async function copySignageUrl() {
  const input = $('#signage-url');
  try {
    await navigator.clipboard.writeText(input.value);
    $('#url-copied').textContent = 'Copied! ';
  } catch {
    input.focus();
    input.select();
    const ok = document.execCommand?.('copy');
    $('#url-copied').textContent = ok ? 'Copied! ' : 'Copy blocked: the URL is selected; copy it manually. ';
  }
}

async function getSignageUrl() {
  cfg.name = $('#name').value.trim();
  cfg.mode = $('#mode').value;
  cfg.t = Math.floor(Date.now() / 1000); // fresh t: a re-pasted URL always wins
  const url = signageUrlFor(location.host, await encodeConfig(normalizeConfig(cfg)));
  $('#url-out').hidden = false;
  $('#signage-url').value = url;
  await copySignageUrl();
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

if (document.getElementById('widgets')) boot();
