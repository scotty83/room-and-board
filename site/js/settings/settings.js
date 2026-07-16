// Full-screen, tap-only settings overlay for the board. Left rail of
// sections; every control is a ≥56px touch target; no typing anywhere
// (setup codes use the on-page keypad, names come from the companion page).

import { normalizeConfig, encodeConfig, decodeConfig, WIDGET_IDS, WIDGET_GROUPS, ART_CATS, NJT_LINES } from '../config.js';
import { saveConfig, loadCache } from '../store.js';
import { fetchJSON } from '../net.js';
import { TFL_LINES, TFL_MODES } from '../tfl-lines.js';
import { WORKER_URL } from '../env.js';
import { escapeHtml, parseAlbumToken, parseDriveFolder } from '../util.js';
import { locationSearch } from '../geo.js';
import { stepTime, fmtHM } from '../modes.js';
import { alphaSections, toggleIn, applyNameKey, nameAutoCap, searchStations } from './pickers.js';
import { MIN_SIZE, firstFit } from '../layout.js';

export const WIDGET_LABELS = {
  weather: 'Weather',
  subway: 'NYC Subway',
  lirr: 'LIRR (Penn Station)',
  mnr: 'Metro-North (Grand Central)',
  njt: 'NJ Transit',
  amtrak: 'Amtrak (Moynihan)',
  path: 'PATH',
  ferry: 'NYC Ferry',
  bus: 'Express Bus',
  markets: 'Markets',
  marketsnews: 'Markets News',
  art: 'Art slideshow',
  photos: 'Photos',
  history: 'This Day in History',
  aqi: 'Air & Sky',
  quote: 'Quote of the Day',
  wotd: 'Word of the Day',
  worldclock: 'World Clock',
  services: 'Cloud Services',
  apod: 'NASA Daily Photo',
  chart: 'Chart of the Day',
  citibike: 'Citi Bike',
  tfl: 'TfL Status',
  sports: 'My Teams (sports)',
  worldcup: 'World Cup 2026',
  f1: 'Formula 1',
  news: 'Headlines',
  substack: 'Substack',
  bsky: 'Bluesky',
};


import { SUBWAY_LINES } from '../widgets/subway.js';
import { PATH_STATIONS, PATH_DIRS } from '../widgets/path.js';
import { BSKY_API } from '../widgets/posts.js';
import { OFFICES, zoneLabel, zonesByRegion } from '../widgets/worldclock.js';
import { symbolKnown } from '../widgets/markets.js';


let state = null; // { cfg, root, section, stack }

export async function openSettings(cfg, { focus } = {}) {
  if (state) closeSettings();
  state = {
    cfg: structuredClone(cfg),
    root: document.querySelector('#settings-root'),
    // Land on the nav's first entry (Display) unless asked to focus elsewhere.
    section: focus === 'code' ? 'code' : NAV_MODEL[0].id,
    openGroup: navGroupForSection(focus === 'code' ? 'code' : NAV_MODEL[0].id),
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
          <img class="settings__lockup" src="assets/room-and-board-wordmark-dark.svg" alt="Room & Board" width="216" height="50">
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

// Collapsible nav model: pinned items + collapsible category groups (one open
// at a time). The nav source (replaces the old flat SECTIONS). Single-config
// categories are pinned items, not one-child groups. Its ids must equal
// SECTION_IDS (coverage-tested); grouping intentionally diverges from /setup.
// (Future: Markets and My Teams become groups once the Markets-news / Teams-news
// feed widgets land.)
export const NAV_MODEL = [
  { type: 'item', id: 'display', label: 'Display' },
  { type: 'item', id: 'widgets', label: 'Widgets' },
  { type: 'item', id: 'weather', label: 'Weather' },
  { type: 'item', id: 'worldclock', label: 'World Clock' },
  { type: 'group', label: 'Images', items: [['art', 'Art'], ['photos', 'Photos']] },
  { type: 'group', label: 'Commute', items: [
    ['subway', 'Subway'], ['lirr', 'LIRR'], ['mnr', 'Metro-North'], ['njt', 'NJ Transit'], ['amtrak', 'Amtrak'],
    ['path', 'PATH'], ['ferry', 'NYC Ferry'], ['bus', 'Express Bus'], ['citibike', 'Citi Bike'], ['tfl', 'TfL Status'] ] },
  { type: 'group', label: 'Markets', items: [['markets', 'Markets'], ['marketsnews', 'Markets News']] },
  { type: 'group', label: 'News & Social', items: [['news', 'Headlines'], ['substack', 'Substack'], ['bsky', 'Bluesky']] },
  { type: 'item', id: 'sports', label: 'My Teams' },
  { type: 'item', id: 'services', label: 'Cloud Services' },
  { type: 'item', id: 'chart', label: 'Chart of the Day' },
  { type: 'item', id: 'code', label: 'Setup code' },
  { type: 'item', id: 'diag', label: 'Diagnostics' },
];

// The category label containing a section id, or null if pinned/unknown.
export function navGroupForSection(id) {
  for (const e of NAV_MODEL) {
    if (e.type === 'group' && e.items.some(([sid]) => sid === id)) return e.label;
  }
  return null;
}

// Pure nav HTML: pinned items as nav buttons; groups as a toggle header (chevron
// + aria-expanded) followed by indented child buttons only when the group is open.
export function navHtml(section, openGroup) {
  return NAV_MODEL.map((e) => {
    if (e.type === 'item') {
      return `<button class="settings__navitem ${e.id === section ? 'is-active' : ''}" data-section="${e.id}">${e.label}</button>`;
    }
    const open = openGroup === e.label;
    const header = `<button class="settings__navgroup ${open ? 'is-open' : ''}" data-group="${e.label}" aria-expanded="${open}"><span class="settings__chev"></span>${e.label}</button>`;
    // Children always in the DOM inside a grid wrapper; toggling .is-open animates
    // grid-template-rows 0fr↔1fr (see main.css). Kept persistent so the transition plays.
    const children = e.items.map(([id, label]) =>
      `<button class="settings__navitem settings__navchild ${id === section ? 'is-active' : ''}" data-section="${id}">${label}</button>`).join('');
    return `${header}<div class="settings__navkids ${open ? 'is-open' : ''}"><div class="settings__navkids__inner">${children}</div></div>`;
  }).join('');
}

function renderNav() {
  const nav = state.root.querySelector('.settings__nav');
  nav.innerHTML = navHtml(state.section, state.openGroup);
  nav.querySelectorAll('[data-section]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.section = btn.dataset.section;
      state.stack = [];
      state.openGroup = navGroupForSection(state.section);
      renderNav();
      renderSection();
    }),
  );
  nav.querySelectorAll('[data-group]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.openGroup = state.openGroup === btn.dataset.group ? null : btn.dataset.group;
      // Toggle open state in place (no re-render) so the grid-rows transition animates.
      nav.querySelectorAll('.settings__navgroup').forEach((h) => {
        const on = h.dataset.group === state.openGroup;
        h.classList.toggle('is-open', on);
        h.setAttribute('aria-expanded', String(on));
        h.nextElementSibling.classList.toggle('is-open', on); // the .settings__navkids wrapper
      });
    }),
  );
}

function pane() {
  return state.root.querySelector('.settings__pane');
}

const SECTION_RENDERERS = {
  widgets: renderWidgets, subway: renderSubway, lirr: renderLirr, mnr: renderMnr, njt: renderNjt, amtrak: renderAmtrak,
  path: renderPath, ferry: renderFerry, bus: renderBus, citibike: renderCitibike, tfl: renderTfl, markets: renderMarkets, marketsnews: renderMarketsNews, sports: renderSports,
  news: renderNews, substack: renderSubstack, bsky: renderBsky, worldclock: renderWorldclock, services: renderServices, chart: renderChart,
  art: renderArt, photos: renderPhotos, weather: renderWeather, display: renderDisplay,
  code: renderCode, diag: renderDiag,
};
export const SECTION_IDS = Object.keys(SECTION_RENDERERS);

// Bumped on every section navigation. An async renderer captures it before its
// await and bails if it changed meanwhile, so a slow fetch can't overwrite the
// pane the user has since navigated to (`navStale()` below).
let navToken = 0;
export function navStale(token) {
  return token !== navToken;
}
function renderSection() {
  navToken += 1;
  SECTION_RENDERERS[state.section]();
}

/* ---------- widgets ---------- */

// Pure HTML for the Widgets picker: one .wgroup section per WIDGET_GROUPS entry,
// each with a small-caps header and the (unchanged) toggle rows. Exported for tests.
export function widgetGroupsHtml(layout) {
  const placed = new Set(layout.map((r) => r.id));
  return WIDGET_GROUPS.map((g) => `
    <section class="wgroup">
      <h3 class="wgroup__title">${g.label}</h3>
      <div class="wgroup__rows">${g.ids.map((id) => {
        const on = placed.has(id);
        const canAdd = on || firstFit(layout, id, MIN_SIZE[id]) !== null;
        return `<div class="row">
          <button class="toggle ${on ? 'is-on' : ''}" data-toggle="${id}" role="switch"
            aria-checked="${on}" ${canAdd ? '' : 'disabled'}>
            <span class="toggle__knob"></span>
          </button>
          <span class="row__label">${WIDGET_LABELS[id]}${canAdd ? '' : ' <small>(no room — resize others first)</small>'}</span>
        </div>`;
      }).join('')}</div>
    </section>`).join('');
}

function renderWidgets() {
  const layout = state.cfg.layout;
  const placed = new Set(layout.map((r) => r.id));
  pane().innerHTML = `
    <h2 class="pane__title">Widgets</h2>
    <p class="pane__hint">Toggle what appears on your dashboard. To move or resize widgets, close settings and tap the ✎ pencil button.</p>
    <div class="wgroups">${widgetGroupsHtml(layout)}</div>`;
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

/* ---------- shared: service-alerts toggle ---------- */

// Full-width tap-row for pick-a-value settings: label left, value + chevron
// right; the ENTIRE row is the touch target (replaces the old .kv container
// with a small Change button marooned at the end).
function navRow(label, value, attr) {
  return `<button class="row row--nav" ${attr}>
    <span class="row__label row__label--dim">${label}</span>
    <span class="row__value">${value} <span class="row__chev">›</span></span>
  </button>`;
}

function alertsToggleHtml(group) {
  const on = state.cfg[group].alerts;
  return `<div class="row">
    <button class="toggle ${on ? 'is-on' : ''}" data-alerts="${group}" role="switch" aria-checked="${on}">
      <span class="toggle__knob"></span>
    </button>
    <span class="row__label">Show service alerts</span>
  </div>`;
}

function bindAlertsToggle(rerender) {
  pane().querySelectorAll('[data-alerts]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const group = btn.dataset.alerts;
      state.cfg[group].alerts = !state.cfg[group].alerts;
      rerender();
    }),
  );
}

/* ---------- art ---------- */

const ART_INTERVALS = [5, 15, 30, 60, 120];
// Compact label for the interval segmented control: 5m · 15m · 30m · 1h · 2h.
const intervalLabel = (m) => (m >= 60 ? `${m / 60}h` : `${m}m`);

function renderArt() {
  pane().innerHTML = `
    <h2 class="pane__title">Art</h2>
    <p class="pane__label">Rotation</p>
    <p class="pane__hint">Applies to the slideshow and the dashboard card.</p>
    <div class="segmented" role="group" aria-label="How often the artwork changes">${ART_INTERVALS.map(
      (m) => `<button class="seg ${state.cfg.art.every === m ? 'is-active' : ''}" data-every="${m}">${intervalLabel(m)}</button>`,
    ).join('')}</div>
    <p class="pane__label">Collections</p>
    <p class="pane__hint">None selected means every collection shows.</p>
    <div class="rows">${ART_CATS.map(([id, label]) => {
      const on = state.cfg.art.cats.includes(id);
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-cat="${id}" role="switch" aria-checked="${on}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${label}</span>
      </div>`;
    }).join('')}</div>`;
  pane().querySelectorAll('[data-every]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.art.every = Number(btn.dataset.every);
      renderArt();
    }),
  );
  pane().querySelectorAll('[data-cat]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.art.cats = toggleIn(state.cfg.art.cats, btn.dataset.cat);
      renderArt();
    }),
  );
}

/* ---------- photos ---------- */

function renderPhotos() {
  const p = state.cfg.photos;
  const src = p.source === 'gdrive' ? 'gdrive' : 'icloud';
  const set = p.album
    ? `<div class="row"><span class="row__label row__label--dim">Album</span><span class="row__value">Configured</span>
        <button class="btn btn--ghost" data-clear-album>Remove</button></div>`
    : '';
  const guide = src === 'gdrive'
    ? `Show a <b>Google Drive folder</b> shared to anyone. In Drive: right-click the folder →
      <b>Share</b> → set access to <b>Anyone with the link</b> → <b>Copy link</b>, then paste it here.`
    : `Show an iCloud <b>Shared Album</b> with its <b>Public Website</b> turned on.
      In the Photos app: open the album → its settings → enable <b>Public Website</b> → <b>Copy Link</b>,
      then enter it here.`;
  pane().innerHTML = `
    <h2 class="pane__title">Photos</h2>
    <p class="pane__label">Source</p>
    <div class="segmented" role="group" aria-label="Photo source">
      <button class="seg ${src === 'icloud' ? 'is-active' : ''}" data-photo-src="icloud">iCloud Shared Album</button>
      <button class="seg ${src === 'gdrive' ? 'is-active' : ''}" data-photo-src="gdrive">Google Drive Folder</button>
    </div>
    <p class="pane__hint">${guide} <b>This is a public link — anyone who has it can view the photos, so add
      only photos appropriate for a shared office display.</b></p>
    ${set}
    <div class="row">
      <button class="toggle ${p.screensaver ? 'is-on' : ''}" data-ss role="switch" aria-checked="${p.screensaver}"><span class="toggle__knob"></span></button>
      <span class="row__label">Use these photos as the screensaver (replaces art)</span>
    </div>
    <p class="pane__label">Rotation</p>
    <p class="pane__hint">Applies to the slideshow and the dashboard card.</p>
    <div class="segmented" role="group" aria-label="How often the photo changes">${ART_INTERVALS.map(
      (m) => `<button class="seg ${p.every === m ? 'is-active' : ''}" data-every="${m}">${intervalLabel(m)}</button>`,
    ).join('')}</div>
    ${src === 'gdrive'
      ? `<p class="pane__label">Folder link</p>
         <p class="pane__hint">Folder ids use characters the on-screen keyboard can't type — paste the
           link here, or enter it at <b>${location.host}/setup</b> from your phone.</p>
         <button class="btn" data-paste>Paste link</button>`
      : `<p class="pane__label">Album link</p>
         <p class="pane__hint">Paste the link, or type just the token after the <code>#</code>.</p>
         <div class="btnrow">
           <button class="btn" data-paste>Paste link</button>
           <button class="btn btn--ghost" data-type>Type it instead</button>
         </div>
         <div class="photo-kb" hidden></div>`}
    <p class="code__status"></p>
    <div class="photo-preview"></div>`;
  pane().querySelectorAll('[data-photo-src]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.photoSrc === src) return;
      state.cfg.photos = { ...state.cfg.photos, source: btn.dataset.photoSrc, album: '' };
      renderPhotos();
    }),
  );
  pane().querySelector('[data-clear-album]')?.addEventListener('click', () => { state.cfg.photos.album = ''; renderPhotos(); });
  pane().querySelector('[data-ss]').addEventListener('click', () => { state.cfg.photos.screensaver = !state.cfg.photos.screensaver; renderPhotos(); });
  pane().querySelectorAll('[data-every]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.photos.every = Number(btn.dataset.every);
      renderPhotos();
    }),
  );
  const status = pane().querySelector('.code__status');
  const preview = pane().querySelector('.photo-preview');
  const validate = async (raw) => {
    const id = src === 'gdrive' ? parseDriveFolder(raw) : parseAlbumToken(raw);
    if (!id) { status.textContent = `That doesn't look like a ${src === 'gdrive' ? 'Drive folder' : 'album'} link — check it and try again.`; return; }
    status.textContent = 'Checking…';
    preview.innerHTML = '';
    try {
      const endpoint = src === 'gdrive'
        ? `${WORKER_URL}/gdrive/album?folder=${encodeURIComponent(id)}`
        : `${WORKER_URL}/icloud/album?token=${encodeURIComponent(id)}`;
      const res = await fetch(endpoint);
      if (res.status === 503) { status.textContent = 'The server needs a Google Drive key (GDRIVE_KEY) — ask whoever runs it.'; return; }
      const digest = await res.json();
      if (!digest.photos?.length) throw new Error('empty');
      state.cfg.photos = { ...state.cfg.photos, source: src, album: id };
      status.textContent = `Found ${digest.photos.length} photo${digest.photos.length > 1 ? 's' : ''}.`;
      preview.innerHTML = `<img class="photo-preview__img" src="${escapeHtml(digest.photos[0].url)}" alt="">`;
    } catch {
      status.textContent = src === 'gdrive'
        ? "Couldn't open that folder — make sure it's shared to Anyone with the link."
        : "Couldn't open that album — check Public Website is on and the link/token is exact (it's case-sensitive).";
      preview.innerHTML = '';
    }
  };
  // The keyboard reveals on demand: mounted eagerly it pushed its own action
  // row (with ⌫/Check) below the 1080 fold with no hint it existed. Revealing
  // on tap + scrolling it fully into view keeps every key on screen. It's the
  // shared qwertyKeypad (shiftable variant) — the bespoke keyboard.js path is
  // retired (settings review Batch 3).
  let kbValue = '';
  let kbShift = false;
  const kbHost = src === 'icloud' ? pane().querySelector('.photo-kb') : null;
  const paintKb = () => {
    kbHost.innerHTML = `<output class="osk__display" aria-live="polite">${escapeHtml(kbValue) || '·'}</output>`
      + qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', [],
        '<button class="key osk__key osk__key--wide" data-key="Clear">Clear</button><button class="key osk__key osk__key--primary osk__key--wide" data-key="Check">Check</button>',
        { shift: kbShift });
    kbHost.querySelectorAll('[data-key]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (k === 'Check') { validate(kbValue); return; }
        if (k === 'Shift') kbShift = !kbShift;
        else if (k === 'Clear') kbValue = '';
        else if (k === '⌫') kbValue = kbValue.slice(0, -1);
        else { kbValue += k; kbShift = false; }
        paintKb();
      }));
  };
  const revealKb = () => {
    if (!kbHost) return;
    paintKb();
    kbHost.hidden = false;
    kbHost.scrollIntoView({ block: 'end' });
  };
  pane().querySelector('[data-type]')?.addEventListener('click', (e) => {
    e.currentTarget.hidden = true;
    revealKb();
  });
  pane().querySelector('[data-paste]').addEventListener('click', async () => {
    const parse = src === 'gdrive' ? parseDriveFolder : parseAlbumToken;
    try { const t = await navigator.clipboard.readText(); const id = parse(t); if (id) { kbValue = id; if (kbHost && !kbHost.hidden) paintKb(); validate(id); } else { status.textContent = `That clipboard text isn't a ${src === 'gdrive' ? 'folder' : 'album'} link.`; } }
    catch { status.textContent = src === 'gdrive' ? `Paste unavailable on this display — use ${location.host}/setup from your phone.` : 'Paste unavailable on this display — type the link instead.'; }
  });
}

/* ---------- subway ---------- */

function renderSubway() {
  const lineChips = SUBWAY_LINES.map((l) => {
    const on = state.cfg.subway.lines.includes(l);
    return `<button class="bullet bullet--${l} linechip ${on ? '' : 'linechip--off'}" data-line="${l}"
      role="switch" aria-checked="${on}">${l}</button>`;
  }).join('');
  pane().innerHTML = `
    <h2 class="pane__title">Subway status</h2>
    <p class="pane__hint">The card shows Good Service or the current alert for each line you pick.</p>
    <div class="linechips">${lineChips}</div>`;
  pane().querySelectorAll('[data-line]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.subway.lines = toggleIn(state.cfg.subway.lines, chip.dataset.line);
      renderSubway();
    }),
  );
}

/* ---------- drill-down list (shared by LIRR / NJT pickers) ---------- */

function drillList(title, items, onPick) {
  const drill = pane().querySelector('.drill');
  if (!drill) return; // navigated away mid-flight — the pane no longer has a .drill
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

/* ---------- LIRR / NJT ---------- */

let lirrStations = null;
async function renderLirr() {
  const _nav = navToken;
  lirrStations ??= await fetchJSON('data/stations-lirr.json');
  if (navStale(_nav)) return;
  const byId = Object.fromEntries(lirrStations.map((s) => [s.id, s]));
  pane().innerHTML = `
    <h2 class="pane__title">LIRR — Penn Station departures</h2>
    <p class="pane__hint">Shows trains leaving Penn Station (Grand Central trains are excluded). Filter to trains that stop at your station — the branch shows per train, so multi-branch destinations just work.</p>
    <div class="rows">
      ${navRow('Trains stopping at', escapeHtml(byId[state.cfg.lirr.dest]?.name ?? 'Any station'), 'data-pick-dest')}
      ${alertsToggleHtml('lirr')}
    </div>
    <div class="drill"></div>`;
  bindAlertsToggle(renderLirr);
  pane().querySelector('[data-pick-dest]').addEventListener('click', () => {
    drillList(
      'Destination station',
      // "Any station" leads the list — it replaces the old separate
      // "Show all trains" button beside the row.
      [{ html: 'Any station <small>(show all trains)</small>', value: null },
        ...alphaSections(lirrStations).flatMap((sec) =>
          sec.stations.map((s) => ({ html: escapeHtml(s.name), value: s })),
        )],
      (pick) => {
        state.cfg.lirr.dest = pick.value?.id ?? '';
        renderLirr();
      },
    );
  });
}

let amtrakStations = null;
async function renderAmtrak() {
  const _nav = navToken;
  amtrakStations ??= await fetchJSON('data/stations-amtrak.json');
  if (navStale(_nav)) return;
  const byId = Object.fromEntries(amtrakStations.map((s) => [s.id, s]));
  pane().innerHTML = `
    <h2 class="pane__title">Amtrak — Moynihan / Penn departures</h2>
    <p class="pane__hint">Shows Amtrak trains leaving Moynihan Train Hall (New York Penn). Filter to trains that stop at your destination — the arrival time there shows per train.</p>
    <div class="rows">
      ${navRow('Trains stopping at', escapeHtml(byId[state.cfg.amtrak.dest]?.name ?? 'Any station'), 'data-pick-dest')}
      ${alertsToggleHtml('amtrak')}
    </div>
    <div class="drill"></div>`;
  bindAlertsToggle(renderAmtrak);
  pane().querySelector('[data-pick-dest]').addEventListener('click', () => {
    drillList(
      'Destination station',
      [{ html: 'Any station <small>(show all trains)</small>', value: null },
        ...alphaSections(amtrakStations).flatMap((sec) =>
          sec.stations.map((s) => ({ html: escapeHtml(s.name), value: s })),
        )],
      (pick) => {
        state.cfg.amtrak.dest = pick.value?.id ?? '';
        renderAmtrak();
      },
    );
  });
}

let mnrStations = null;
async function renderMnr() {
  const _nav = navToken;
  mnrStations ??= await fetchJSON('data/stations-mnr.json');
  if (navStale(_nav)) return;
  const byId = Object.fromEntries(mnrStations.map((s) => [s.id, s]));
  pane().innerHTML = `
    <h2 class="pane__title">Metro-North — Grand Central departures</h2>
    <p class="pane__hint">Shows trains leaving Grand Central. Filter to trains that stop at your station — the line shows per train.</p>
    <div class="rows">
      ${navRow('Trains stopping at', escapeHtml(byId[state.cfg.mnr.dest]?.name ?? 'Any station'), 'data-pick-dest')}
      ${alertsToggleHtml('mnr')}
    </div>
    <div class="drill"></div>`;
  bindAlertsToggle(renderMnr);
  pane().querySelector('[data-pick-dest]').addEventListener('click', () => {
    drillList(
      'Destination station',
      [{ html: 'Any station <small>(show all trains)</small>', value: null },
        ...alphaSections(mnrStations).flatMap((sec) =>
          sec.stations.map((s) => ({ html: escapeHtml(s.name), value: s })),
        )],
      (pick) => {
        state.cfg.mnr.dest = pick.value?.id ?? '';
        renderMnr();
      },
    );
  });
}

// The board is pinned to New York Penn Station (mirrors LIRR/Amtrak); the user
// filters departures by line. Empty selection = all lines. Modeled on the
// subway/TfL line multi-selects — no station fetch, so no flicker or getToken burst.
function renderNjt() {
  const chosen = state.cfg.njt.lines;
  const lineChips = NJT_LINES.map((l) => {
    const on = chosen.includes(l);
    return `<button class="chip ${on ? 'chip--on' : ''}" data-line="${escapeHtml(l)}"
      role="switch" aria-checked="${on}">${escapeHtml(l)}</button>`;
  }).join('');
  pane().innerHTML = `
    <h2 class="pane__title">NJ Transit — Penn Station departures</h2>
    <p class="pane__hint">Departures from New York Penn Station. Pick the lines to show — leave all off to show every line.</p>
    <div class="chips">${lineChips}</div>
    ${alertsToggleHtml('njt')}`;
  bindAlertsToggle(renderNjt);
  pane().querySelectorAll('[data-line]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.njt.lines = toggleIn(state.cfg.njt.lines, chip.dataset.line);
      renderNjt();
    }),
  );
}

function renderPath() {
  pane().innerHTML = `
    <h2 class="pane__title">PATH</h2>
    <p class="pane__label">Direction</p>
    <div class="rows">${PATH_DIRS.map(([id, label]) =>
      `<button class="row row--tap ${state.cfg.path.dir === id ? 'is-selected' : ''}" data-dir="${id}">${label}</button>`,
    ).join('')}</div>
    <p class="pane__label">Station</p>
    <div class="rows rows--grid">${Object.entries(PATH_STATIONS).map(([code, name]) =>
      `<button class="row row--tap ${state.cfg.path.station === code ? 'is-selected' : ''}" data-station="${code}">${name}</button>`,
    ).join('')}</div>`;
  pane().querySelectorAll('[data-station]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.path.station = btn.dataset.station;
      renderPath();
    }),
  );
  pane().querySelectorAll('[data-dir]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.path.dir = btn.dataset.dir;
      renderPath();
    }),
  );
}

let ferryStops = null;
async function renderFerry() {
  const _nav = navToken;
  pane().innerHTML = `
    <h2 class="pane__title">NYC Ferry</h2>
    <div class="row"><span class="row__label row__label--dim">Landing</span><span class="row__value" data-landing>Loading…</span></div>
    <div class="drill"></div>`;
  try {
    ferryStops ??= (await fetchJSON('data/ferry.json')).stops;
    const byId = Object.fromEntries(ferryStops.map((s) => [s.id, s]));
    pane().querySelector('[data-landing]').textContent =
      byId[state.cfg.ferry.landing]?.name ?? state.cfg.ferry.landing;
    drillList(
      'Choose a landing',
      ferryStops.map((s) => ({ html: escapeHtml(s.name), value: s })),
      (pick) => {
        state.cfg.ferry.landing = pick.value.id;
        renderFerry();
      },
    );
  } catch {
    const d = pane().querySelector('.drill');
    if (d) d.innerHTML = '<p class="pane__empty">Landing list unavailable — redeploy the site data.</p>';
  }
}

let expressBus = null;
async function renderBus() {
  const _nav = navToken;
  expressBus ??= await fetchJSON('data/express-bus.json');
  if (navStale(_nav)) return;
  const { expressRoutes, directionsForRoute, stopsForRouteDir } = await import('./pickers.js');
  const legs = state.cfg.bus.legs;
  const chips = legs
    .map((l, i) => `<button class="chip" data-remove="${i}"><b class="buspill">${escapeHtml(l.route)}</b> ${escapeHtml(l.stopName)} ✕</button>`)
    .join('');
  pane().innerHTML = `
    <h2 class="pane__title">Express Bus</h2>
    <p class="pane__hint">Pick your express route, direction, then stop. Add up to two.</p>
    <div class="chips">${chips || '<span class="pane__empty">No routes yet</span>'}</div>
    ${legs.length < 2 ? '<button class="btn" data-add>Add a route</button>' : ''}
    <div class="drill"></div>`;
  pane().querySelectorAll('[data-remove]').forEach((c) =>
    c.addEventListener('click', () => { state.cfg.bus.legs = legs.filter((_, i) => i !== Number(c.dataset.remove)); renderBus(); }));
  pane().querySelector('[data-add]')?.addEventListener('click', () => {
    state.stack = [];
    const pickRoute = () => drillList('Express route',
      expressRoutes(expressBus).map((r) => ({ html: `<b class="buspill">${escapeHtml(r.id)}</b>`, value: r })),
      (r) => { state.stack.push(pickRoute); pickDir(r.value); });
    const pickDir = (route) => drillList(`${route.id} — direction`,
      directionsForRoute(expressBus, route.id).map((d) => ({ html: escapeHtml(d.headsign || `Direction ${d.id}`), value: d })),
      (d) => { state.stack.push(() => pickDir(route)); pickStop(route, d.value); });
    const pickStop = (route, dir) => drillList(`${route.id} ${dir.headsign} — stop`,
      stopsForRouteDir(expressBus, route.id, dir.id).map((s) => ({ html: escapeHtml(s.name), value: s })),
      (s) => {
        state.cfg.bus.legs = [...state.cfg.bus.legs, { route: route.id, lineRef: route.lineRef, dir: dir.id, stopId: s.value.id, stopName: s.value.name }];
        renderBus();
      });
    pickRoute();
  });
}

function renderTfl() {
  const chosen = state.cfg.tfl.lines;
  const groups = TFL_MODES.map((g) => {
    const chips = TFL_LINES.filter((l) => l.mode === g).map((l) => {
      const on = chosen.includes(l.id);
      return `<button class="tflchip ${on ? '' : 'tflchip--off'}" data-line="${l.id}" role="switch" aria-checked="${on}">
        <span class="tflchip__dot" style="background:${l.color}"></span>${escapeHtml(l.name)}</button>`;
    }).join('');
    return `<h3 class="pane__subhead">${g}</h3><div class="tflchips">${chips}</div>`;
  }).join('');
  pane().innerHTML = `
    <h2 class="pane__title">TfL Status</h2>
    <p class="pane__hint">Pick the London lines to watch — each shows Good Service or the current disruption.</p>
    ${groups}`;
  pane().querySelectorAll('[data-line]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.tfl.lines = toggleIn(state.cfg.tfl.lines, chip.dataset.line);
      renderTfl();
    }));
}

let cbStations = null; // citibike station bundle [{id,name}], fetched once
async function renderCitibike() {
  const _nav = navToken;
  cbStations ??= await fetchJSON('data/citibike-stations.json');
  if (navStale(_nav)) return;
  let query = '';
  const draw = () => {
    const chosen = state.cfg.citibike.stations;
    const chips = chosen
      .map((s, i) => `<button class="chip" data-remove="${i}">${escapeHtml(s.name)} ✕</button>`).join('');
    const chosenIds = new Set(chosen.map((s) => s.id));
    // Cap at 8: on the 860px spine 20 matches wrap into ~10 rows and shove the
    // keyboard below the fold mid-search — keep typing to narrow instead.
    const matches = searchStations(cbStations, query, chosenIds, 8);
    pane().innerHTML = `
      <h2 class="pane__title">Citi Bike</h2>
      <p class="pane__hint">Search a station by its cross-streets. Add up to 6.</p>
      <div class="chips">${chips || '<span class="pane__empty">No stations — defaults return on save</span>'}</div>
      <output class="code__display">${escapeHtml(query) || '&nbsp;'}</output>
      <div class="picklist">${matches
        .map((s) => (s.added
          ? `<span class="btn picklist__item picklist__item--added">${escapeHtml(s.name)} ✓ Added</span>`
          : `<button class="btn picklist__item" data-add="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button>`))
        .join('') || (query.trim().length >= 2 ? '<span class="pane__empty">No matches</span>' : '')}</div>
      ${chosen.length < 6
        ? qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', [' ', '-', '/'],
          '<button class="key osk__key" data-key="⌫">⌫</button>')
        : '<p class="pane__hint">Max 6 — remove one to add another.</p>'}`;
    pane().querySelectorAll('[data-remove]').forEach((c) =>
      c.addEventListener('click', () => { state.cfg.citibike.stations = chosen.filter((_, i) => i !== Number(c.dataset.remove)); draw(); }));
    pane().querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => {
        if (chosen.length >= 6) return;
        state.cfg.citibike.stations = [...chosen, { id: b.dataset.add, name: b.dataset.name }];
        query = ''; draw();
      }));
    pane().querySelectorAll('[data-key]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (k === '⌫') query = query.slice(0, -1);
        else if (query.length < 30) query += k;
        draw();
      }));
  };
  draw();
}

const INDEX_NAMES = { '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq', '^GSPC': 'S&P 500' };

// QWERTY-ordered keypad rows filtered to the field's alphabet: keys keep their
// familiar positions, and characters the field doesn't accept simply don't
// appear (setup codes have no I/L/O/U on purpose). Reuses the photos
// keyboard's .osk row/key styles so every on-board keyboard reads the same.
const QWERTY_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
export function qwertyKeypad(alphabet, extraKeys, actionsHtml, { lower = false, shift = null } = {}) {
  const allowed = new Set(alphabet);
  const rows = QWERTY_ROWS.map((r) => [...r].filter((k) => allowed.has(k)))
    .filter((r) => r.length); // digit-less alphabets (the name pad) drop the empty digits row
  rows[rows.length - 1].push(...extraKeys.filter((k) => k !== ' ')); // symbols ride the short bottom row
  // shift === null keeps the classic fixed-case pad (`lower` picks the case).
  // A boolean makes the pad SHIFTABLE: letters render/emit in the shift case
  // and the bottom letter row gains ⇧ (head) and ⌫ (tail) — the name-pad
  // layout. Callers own the state and re-render on the Shift key.
  const upper = shift === null ? !lower : shift;
  const cased = (k) => (upper ? k : k.toLowerCase());
  const keyHtml = (k) => `<button class="key osk__key" data-key="${cased(k)}">${cased(k)}</button>`;
  const shiftKey = shift === null ? ''
    : `<button class="key osk__key ${shift ? 'is-on' : ''}" data-key="Shift">⇧</button>`;
  const backKey = shift === null ? '' : '<button class="key osk__key" data-key="⌫">⌫</button>';
  // The space bar is a wide, labeled key (a bare ' ' renders as a blank
  // key-sized button — Sean hit this in the Citi Bike search) and sits on the
  // bottom actions row, the same spot as the greeting-name pad's space bar.
  const space = extraKeys.includes(' ')
    ? '<button class="key osk__key osk__key--space" data-key=" ">space</button>'
    : '';
  return `<div class="osk">${rows
    .map((row, i) => `<div class="osk__row">${i === rows.length - 1 ? shiftKey : ''}${row.map(keyHtml).join('')}${i === rows.length - 1 ? backKey : ''}</div>`)
    .join('')}<div class="osk__row">${space}${actionsHtml}</div></div>`;
}

function renderMarkets() {
  const symbols = state.cfg.markets.symbols;
  const chips = symbols
    .map((t) => `<button class="chip" data-remove-sym="${t}">${INDEX_NAMES[t] ?? t} ✕</button>`)
    .join('');
  pane().innerHTML = `
    <h2 class="pane__title">Markets</h2>
    <p class="pane__hint">Add up to 10 tickers (indexes start with ^). Non-US listings use the exchange suffix — London CBG.L, Frankfurt SAP.DE, Tokyo 7203.T. Remove any you don't want — the defaults are just entries like the rest.</p>
    <div class="chips">${chips || '<span class="pane__empty">No tickers — defaults return on save</span>'}</div>
    <output class="code__display" aria-live="polite"></output>
    ${qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ['^', '.', '-'],
      '<button class="key osk__key" data-key="⌫">⌫</button><button class="key osk__key osk__key--primary osk__key--wide" data-key="Add">Add</button>')}
    <p class="code__status"></p>`;
  pane().querySelectorAll('[data-remove-sym]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg.markets.symbols = symbols.filter((t) => t !== chip.dataset.removeSym);
      renderMarkets();
    }),
  );
  let ticker = '';
  const display = pane().querySelector('.code__display');
  const status = pane().querySelector('.code__status');
  pane().querySelectorAll('[data-key]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const k = btn.dataset.key;
      if (k === '⌫') ticker = ticker.slice(0, -1);
      else if (k === 'Add') {
        if (!(/^[\^A-Z0-9.\-]{1,10}$/.test(ticker) && symbols.length < 10 && !symbols.includes(ticker))) return;
        status.textContent = 'Checking…';
        if (await symbolKnown(ticker)) {
          state.cfg.markets.symbols = [...symbols, ticker];
          renderMarkets();
          return;
        }
        status.textContent = `${ticker} isn't a known ticker — check the symbol.${/^[A-Z]{1,6}$/.test(ticker) ? ' Non-US listings need the exchange suffix — e.g. CBG.L for London.' : ''}`;
      } else if (ticker.length < 10) ticker += k;
      display.textContent = ticker;
    }),
  );
}

let teamsData = null;
async function renderSports() {
  const _nav = navToken;
  teamsData ??= await fetchJSON('data/teams.json');
  if (navStale(_nav)) return;
  const byKey = {};
  for (const l of teamsData.leagues) for (const t of l.teams) byKey[`${l.lg}:${t.id}`] = { ...t, label: l.label };
  const chips = state.cfg.sports.teams
    .map((sel) => {
      const t = byKey[`${sel.lg}:${sel.id}`];
      return `<button class="chip" data-remove-team="${escapeHtml(sel.lg)}:${escapeHtml(sel.id)}">${t ? `${escapeHtml(t.name)} (${escapeHtml(t.label)})` : escapeHtml(sel.id)} ✕</button>`;
    })
    .join('');
  pane().innerHTML = `
    <h2 class="pane__title">My Teams</h2>
    <p class="pane__hint">Follow up to 6 teams — one glanceable row each: live score, final, or next game.</p>
    <div class="chips">${chips || '<span class="pane__empty">No teams yet</span>'}</div>
    <button class="btn btn--primary" data-add-team>Add a team</button>
    <div class="drill"></div>`;
  pane().querySelectorAll('[data-remove-team]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const [lg, id] = chip.dataset.removeTeam.split(':');
      state.cfg.sports.teams = state.cfg.sports.teams.filter((t) => !(t.lg === lg && t.id === id));
      renderSports();
    }),
  );
  pane().querySelector('[data-add-team]').addEventListener('click', () => {
    drillList(
      'Choose a league',
      teamsData.leagues.map((l) => ({ html: escapeHtml(l.label), value: l })),
      (pick) => {
        state.stack.push(() => renderSports());
        drillList(
          `${pick.value.label} — choose a team`,
          pick.value.teams.map((t) => ({ html: escapeHtml(t.name), value: { lg: pick.value.lg, id: t.id } })),
          (teamPick) => {
            const sel = teamPick.value;
            const exists = state.cfg.sports.teams.some((t) => t.lg === sel.lg && t.id === sel.id);
            if (!exists && state.cfg.sports.teams.length < 6) {
              state.cfg.sports.teams = [...state.cfg.sports.teams, sel];
            }
            state.stack = [];
            renderSports();
          },
        );
      },
    );
  });
}

async function renderNews() {
  const _nav = navToken;
  const { NEWS_SOURCES } = await import('../widgets/news.js');
  if (navStale(_nav)) return;
  const groups = ['National', 'Local NYC'];
  pane().innerHTML = `
    <h2 class="pane__title">Headlines</h2>
    <p class="pane__hint">Pick your sources — newest stories across all of them, merged.</p>
    ${groups.map((g) => `
      <p class="pane__label">${g}</p>
      <div class="rows">${NEWS_SOURCES.filter((s) => s[4] === g).map(([id, label]) => {
        const on = state.cfg.news.sources.includes(id);
        return `<div class="row">
          <button class="toggle ${on ? 'is-on' : ''}" data-src="${id}" role="switch" aria-checked="${on}">
            <span class="toggle__knob"></span>
          </button>
          <span class="row__label">${label}</span>
        </div>`;
      }).join('')}</div>`).join('')}`;
  pane().querySelectorAll('[data-src]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.news.sources = toggleIn(state.cfg.news.sources, btn.dataset.src);
      renderNews();
    }),
  );
}

async function renderMarketsNews() {
  const _nav = navToken;
  const { MARKET_SOURCES } = await import('../widgets/marketsnews.js');
  if (navStale(_nav)) return;
  pane().innerHTML = `
    <h2 class="pane__title">Markets News</h2>
    <p class="pane__hint">Pick your finance sources — newest stories across all of them, merged.</p>
    <div class="rows">${MARKET_SOURCES.map(([id, label]) => {
      const on = state.cfg.marketsnews.sources.includes(id);
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-src="${id}" role="switch" aria-checked="${on}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${label}</span>
      </div>`;
    }).join('')}</div>`;
  pane().querySelectorAll('[data-src]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.marketsnews.sources = toggleIn(state.cfg.marketsnews.sources, btn.dataset.src);
      renderMarketsNews();
    }),
  );
}

async function renderChart() {
  const _nav = navToken;
  const { CHART_TOPICS } = await import('../widgets/chart-topics.js');
  if (navStale(_nav)) return;
  const c = state.cfg.chart;
  const allSlugs = CHART_TOPICS.map(([, slug]) => slug);
  const allOn = allSlugs.every((slug) => c.topics.includes(slug));
  pane().innerHTML = `
    <h2 class="pane__title">Chart of the Day</h2>
    <p class="pane__hint">A daily Statista infographic. Turn on the topics you want and the card cycles through them on each refresh. With none on, it shows the newest chart across every topic.</p>
    <div class="row row--control">
      <button class="toggle ${allOn ? 'is-on' : ''}" data-topic-all role="switch" aria-checked="${allOn}">
        <span class="toggle__knob"></span>
      </button>
      <span class="row__label">Select all</span>
    </div>
    <div class="rows rows--grid">${CHART_TOPICS.map(([label, slug]) => {
      const on = c.topics.includes(slug);
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-topic="${escapeHtml(slug)}" role="switch" aria-checked="${on}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${escapeHtml(label)}</span>
      </div>`;
    }).join('')}</div>
    <div class="pane__section">
      <div class="row">
        <button class="toggle ${c.excludePolitics ? 'is-on' : ''}" data-chart-politics role="switch" aria-checked="${c.excludePolitics}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">Hide political charts</span>
      </div>
    </div>`;
  pane().querySelector('[data-topic-all]').addEventListener('click', () => {
    state.cfg.chart.topics = allOn ? [] : [...allSlugs];
    renderChart();
  });
  pane().querySelectorAll('[data-topic]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.chart.topics = toggleIn(state.cfg.chart.topics, btn.dataset.topic);
      renderChart();
    }),
  );
  pane().querySelector('[data-chart-politics]').addEventListener('click', () => {
    state.cfg.chart.excludePolitics = !state.cfg.chart.excludePolitics;
    renderChart();
  });
}

async function renderServices() {
  const _nav = navToken;
  const { SERVICE_CHOICES } = await import('../widgets/services.js');
  if (navStale(_nav)) return;
  pane().innerHTML = `
    <h2 class="pane__title">Cloud Services</h2>
    <p class="pane__hint">Pick the cloud services to watch — each shows Operational or its current incident. Tap a degraded service on the card for the full picture.</p>
    <div class="rows">${SERVICE_CHOICES.map(([id, label]) => {
      const on = state.cfg.services.list.includes(id);
      return `<div class="row">
        <button class="toggle ${on ? 'is-on' : ''}" data-svc="${id}" role="switch" aria-checked="${on}">
          <span class="toggle__knob"></span>
        </button>
        <span class="row__label">${label}</span>
      </div>`;
    }).join('')}</div>`;
  pane().querySelectorAll('[data-svc]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.services.list = toggleIn(state.cfg.services.list, btn.dataset.svc);
      renderServices();
    }),
  );
}

/* ---------- newsletters (substack) + bluesky ---------- */

// Shared follow-list pane: chips + one add flow on the code keypad. Short
// identifiers only — never URLs (the board keyboard requirement).
function renderFollowPane(opts) {
  const list = state.cfg[opts.cfgKey][opts.listKey];
  const chips = list
    .map((a, i) => `<button class="chip" data-rm-acct="${i}">${escapeHtml(a.label)} ✕</button>`)
    .join('');
  pane().innerHTML = `
    <h2 class="pane__title">${opts.title}</h2>
    <p class="pane__hint">${opts.hint} Tap a clipped post on the card to read it full screen.</p>
    <div class="chips">${chips || '<span class="pane__empty">Nothing followed yet</span>'}</div>
    <button class="btn btn--primary" data-add>${opts.addLabel}</button>
    <div class="acct-pad" hidden>
      <output class="code__display" aria-live="polite"></output>
      <div class="acct-pad__keys"></div>
      <p class="code__status"></p>
    </div>`;
  pane().querySelectorAll('[data-rm-acct]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.cfg[opts.cfgKey][opts.listKey] = list.filter((_, i) => i !== Number(chip.dataset.rmAcct));
      opts.rerender();
    }),
  );
  const pad = pane().querySelector('.acct-pad');
  const display = pad.querySelector('.code__display');
  const status = pad.querySelector('.code__status');
  const keys = pad.querySelector('.acct-pad__keys');
  let id = '';
  pane().querySelector('[data-add]').addEventListener('click', () => {
    id = '';
    keys.innerHTML = qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ['.', '-'],
      (opts.suffixKey ? `<button class="key osk__key osk__key--wide" data-key="${opts.suffixKey}">·${opts.suffixKey.slice(1)}</button>` : '') +
      '<button class="key osk__key" data-key="⌫">⌫</button><button class="key osk__key osk__key--wide osk__key--primary" data-key="Check">Check</button>',
      { lower: true }); // handles/slugs are lowercase — keys type what they show
    pad.hidden = false;
    display.textContent = '';
    status.textContent = '';
    keys.querySelectorAll('[data-key]').forEach((k) =>
      k.addEventListener('click', async () => {
        const key = k.dataset.key;
        if (key === '⌫') id = id.slice(0, -1);
        else if (key === 'Check') {
          if (list.length >= 6 || list.some((a) => a.id === id)) {
            status.textContent = 'Already following that one (or the list is full).';
            return;
          }
          status.textContent = 'Checking…';
          try {
            const label = await opts.validate(id);
            state.cfg[opts.cfgKey][opts.listKey] = [...list, { id, label }];
            opts.rerender();
          } catch {
            status.textContent = `Couldn't find "${id}" — ${opts.notFoundHint}`;
          }
          return;
        } else if (id.length < 60) id += key;
        display.textContent = id;
      }),
    );
  });
}

function renderSubstack() {
  renderFollowPane({
    cfgKey: 'substack',
    listKey: 'pubs',
    title: 'Substack',
    hint: 'Follow up to 6 publications — newest essays across all of them.',
    addLabel: 'Add a publication — type the name before .substack.com',
    suffixKey: null,
    notFoundHint: 'check the publication name.',
    rerender: renderSubstack,
    validate: async (id) => {
      const digest = await fetchJSON(`${WORKER_URL}/posts/substack?pub=${encodeURIComponent(id)}`);
      if (!digest.posts?.length) throw new Error('no posts');
      return id.slice(0, 30);
    },
  });
}

function renderBsky() {
  renderFollowPane({
    cfgKey: 'bsky',
    listKey: 'handles',
    title: 'Bluesky',
    hint: 'Follow up to 6 accounts — newest posts across all of them.',
    addLabel: 'Add an account — type the handle',
    suffixKey: '.bsky.social',
    notFoundHint: 'check the handle.',
    rerender: renderBsky,
    validate: async (id) => {
      const prof = await fetchJSON(`${BSKY_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(id)}`);
      if (!prof.handle) throw new Error('not found');
      return (prof.displayName || prof.handle).slice(0, 30);
    },
  });
}

/* ---------- weather / display ---------- */

// Shared 12/24-hour toggle. One board-wide setting (cfg.clock24) surfaced in
// both the Display and World Clock panes; governs the topbar Clock + World
// Clock widget only (transit departures keep fmtTime's 12h).
function clockFormatMarkup() {
  return `
    <p class="pane__label">Time format</p>
    <div class="segmented" role="group" aria-label="Clock time format">
      <button class="seg ${!state.cfg.clock24 ? 'is-active' : ''}" data-clock24="12">12-hour</button>
      <button class="seg ${state.cfg.clock24 ? 'is-active' : ''}" data-clock24="24">24-hour</button>
    </div>`;
}
function wireClockFormat(rerender) {
  pane().querySelectorAll('[data-clock24]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.clock24 = btn.dataset.clock24 === '24';
      rerender();
    }));
}

function renderWorldclock() {
  const cities = () => state.cfg.worldclock.cities;
  const has = (label, zone) => cities().some((c) => c.label === label && c.zone === zone);
  const zonesApi = typeof Intl.supportedValuesOf === 'function';
  pane().innerHTML = `
    <h2 class="pane__title">World Clock</h2>
    <p class="pane__hint">Cities display in order of their current time. Tap an office to add or remove it (up to 10).</p>
    <div class="chips">${cities().map((c, i) => `<button class="chip" data-rm="${i}">${escapeHtml(c.label)} ✕</button>`).join('')}</div>
    <p class="pane__label">Offices</p>
    <div class="chips">${OFFICES.map(([label, zone], i) =>
      `<button class="chip ${has(label, zone) ? 'chip--on' : ''}" data-office="${i}">${label}</button>`).join('')}</div>
    ${zonesApi ? `<p class="pane__label">Any time zone</p>
    <button class="btn" data-add-zone>Add any time zone</button>
    <div class="drill"></div>` : ''}
    ${clockFormatMarkup()}`;
  wireClockFormat(renderWorldclock);
  const set = (list) => { state.cfg.worldclock.cities = list.slice(0, 10); renderWorldclock(); };
  pane().querySelectorAll('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => set(cities().filter((_, i) => i !== Number(b.dataset.rm)))));
  pane().querySelectorAll('[data-office]').forEach((b) =>
    b.addEventListener('click', () => {
      const [label, zone] = OFFICES[Number(b.dataset.office)];
      set(has(label, zone) ? cities().filter((c) => !(c.label === label && c.zone === zone)) : [...cities(), { label, zone }]);
    }));
  pane().querySelector('[data-add-zone]')?.addEventListener('click', () => {
    state.stack = [];
    const byRegion = zonesByRegion(Intl.supportedValuesOf('timeZone'));
    const pickRegion = () => drillList('Region',
      Object.keys(byRegion).map((r) => ({ html: escapeHtml(r), value: r })),
      (r) => { state.stack.push(pickRegion); pickZone(r.value); });
    const pickZone = (region) => drillList(region,
      byRegion[region].map((z) => {
        // The region is already chosen, so drop the redundant prefix: show the
        // city, plus any middle segment (e.g. Argentina) that disambiguates it.
        const rest = z.includes('/') ? z.slice(z.indexOf('/') + 1) : '';
        const mid = rest.includes('/') ? rest.slice(0, rest.lastIndexOf('/')).replace(/_/g, ' ') : '';
        return {
          html: `${escapeHtml(zoneLabel(z))}${mid ? ` <small>${escapeHtml(mid)}</small>` : ''}`,
          value: z,
        };
      }),
      (it) => {
        const zone = it.value;
        const label = zoneLabel(zone);
        if (!has(label, zone)) set([...cities(), { label, zone }]);
      });
    pickRegion();
  });
}

function renderWeather() {
  let query = '';
  let results = [];
  let status = '';
  const draw = () => {
    pane().innerHTML = `
      <h2 class="pane__title">Weather</h2>
      <p class="pane__label">Temperature unit</p>
      <div class="segmented" role="group" aria-label="Temperature unit">
        <button class="seg ${state.cfg.loc.units !== 'C' ? 'is-active' : ''}" data-units="F">°F</button>
        <button class="seg ${state.cfg.loc.units === 'C' ? 'is-active' : ''}" data-units="C">°C</button>
      </div>
      <div class="row"><span class="row__label row__label--dim">Current</span><span class="row__value">${escapeHtml(state.cfg.loc.label)}</span></div>
      <p class="pane__label">Location</p>
      <p class="pane__hint">Search a city anywhere, or a 5-digit US ZIP.</p>
      <output class="code__display" aria-live="polite">${escapeHtml(query) || '&nbsp;'}</output>
      <div class="picklist">${results
        .map((r, i) => `<button class="btn picklist__item" data-pick="${i}">${escapeHtml(r.label)}</button>`)
        .join('')}</div>
      ${qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', [' ', '-'],
        '<button class="key osk__key" data-key="⌫">⌫</button><button class="key osk__key osk__key--primary osk__key--wide" data-key="Search">Search</button>')}
      <p class="code__status">${escapeHtml(status)}</p>`;
    pane().querySelectorAll('[data-units]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.cfg.loc = { ...state.cfg.loc, units: btn.dataset.units };
        draw();
      }));
    pane().querySelectorAll('[data-pick]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const r = results[Number(btn.dataset.pick)];
        // Picking sets units by region (US → °F, else °C); the toggle overrides.
        state.cfg.loc = { lat: r.lat, lon: r.lon, label: r.label, units: r.cc === 'US' ? 'F' : 'C' };
        query = ''; results = []; status = '';
        draw();
      }));
    pane().querySelectorAll('[data-key]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const k = btn.dataset.key;
        if (k === '⌫') query = query.slice(0, -1);
        else if (k === 'Search') {
          status = 'Searching…'; draw();
          results = await locationSearch(query);
          status = results.length ? '' : 'No matches — try a city name or a 5-digit US ZIP.';
          draw();
          return;
        } else if (query.length < 30) query += k;
        draw();
      }));
  };
  draw();
}

function renderDisplay() {
  const seg = (value, label) => `
    <button class="seg ${state.cfg.mode === value ? 'is-active' : ''}" data-set="mode:${value}">${label}</button>`;
  pane().innerHTML = `
    <h2 class="pane__title">Display</h2>
    <p class="pane__label">Mode</p>
    <div class="segmented" role="group" aria-label="Display mode">
      ${seg('dashboard', 'Always dashboard')}
      ${seg('ambient', 'Always screensaver')}
      ${seg('scheduled', 'Scheduled')}
    </div>
    ${state.cfg.mode === 'scheduled' ? `<p class="pane__hint">Dashboard shows during these windows; the screensaver shows the rest of the time.</p>
    <div class="sched">${state.cfg.schedule.map((w, i) => `
      <div class="sched__win">
        <button class="btn sched__step" data-i="${i}" data-t="start" data-d="-1">▼</button>
        <span class="sched__time">${fmtHM(w.start)}</span>
        <button class="btn sched__step" data-i="${i}" data-t="start" data-d="1">▲</button>
        <span class="sched__dash">–</span>
        <button class="btn sched__step" data-i="${i}" data-t="end" data-d="-1">▼</button>
        <span class="sched__time">${fmtHM(w.end)}</span>
        <button class="btn sched__step" data-i="${i}" data-t="end" data-d="1">▲</button>
        ${state.cfg.schedule.length > 1 ? `<button class="btn sched__rm" data-rm="${i}">✕</button>` : ''}
        ${w.start >= w.end ? '<span class="sched__warn">end must be after start</span>' : ''}
      </div>`).join('')}
      ${state.cfg.schedule.length < 4 ? '<button class="btn" data-add-win>Add window</button>' : ''}
    </div>` : ''}
    ${clockFormatMarkup()}
    <p class="pane__label">Greeting name</p>
    ${navRow('Shown as', escapeHtml(state.cfg.name || 'not set'), 'data-edit-name')}
    ${state.cfg.name ? '<button class="btn btn--ghost" data-clear-name>Remove name</button>' : ''}
    <div class="namepad" hidden>
      <output class="code__display" aria-live="polite">·</output>
      <div class="namepad__keys"></div>
    </div>`;
  pane().querySelectorAll('[data-set]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [group, value] = btn.dataset.set.split(':');
      state.cfg[group] = value;
      renderDisplay();
    }),
  );
  wireClockFormat(renderDisplay);
  pane().querySelectorAll('[data-t]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i), key = btn.dataset.t, d = Number(btn.dataset.d);
      state.cfg.schedule[i][key] = stepTime(state.cfg.schedule[i][key], d);
      renderDisplay();
    }),
  );
  pane().querySelector('[data-add-win]')?.addEventListener('click', () => {
    state.cfg.schedule = [...state.cfg.schedule, { start: 540, end: 1020 }]; // 9:00 AM–5:00 PM
    renderDisplay();
  });
  pane().querySelectorAll('[data-rm]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.cfg.schedule = state.cfg.schedule.filter((_, i) => i !== Number(btn.dataset.rm));
      renderDisplay();
    }),
  );
  pane().querySelector('[data-clear-name]')?.addEventListener('click', () => {
    state.cfg.name = '';
    renderDisplay();
  });
  const pad = pane().querySelector('.namepad');
  const display = pad.querySelector('.code__display');
  const keys = pad.querySelector('.namepad__keys');
  // Explicit case, saved verbatim (see applyNameKey): auto-caps the first
  // letter of each word, Shift overrides for camelCase, '-' for hyphenated.
  // QWERTY layout in the shared .osk styles; labels follow the shift state.
  let nameState = { value: state.cfg.name, shift: nameAutoCap(state.cfg.name) };
  function paintPad() {
    const { value, shift } = nameState;
    display.textContent = value || '·';
    // The shared qwertyKeypad (shiftable variant) renders the keys;
    // applyNameKey still owns the state — its auto-caps logic expects
    // UPPERCASE letters and named action keys, so normalize what the pad
    // emits (cased letters, ' ', '⌫') before handing over.
    keys.innerHTML = qwertyKeypad('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [' ', '-'],
      '<button class="key osk__key osk__key--wide" data-key="Done">Done</button>', { shift });
    keys.querySelectorAll('[data-key]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const raw = btn.dataset.key;
        if (raw === 'Done') { state.cfg.name = nameState.value.trim(); renderDisplay(); return; }
        const k = raw === '⌫' ? 'Backspace' : raw === ' ' ? 'Space' : raw.length === 1 ? raw.toUpperCase() : raw;
        nameState = applyNameKey(nameState, k);
        paintPad();
      }),
    );
  }
  pane().querySelector('[data-edit-name]').addEventListener('click', () => {
    pad.hidden = !pad.hidden;
    if (!pad.hidden) paintPad();
  });
}

/* ---------- setup code + QR export ---------- */

function renderCode() {
  pane().innerHTML = `
    <h2 class="pane__title">Setup code</h2>
    <p class="pane__hint">Build your configuration at <b>${location.host}/setup</b> on any device, then enter the 6-character code here.</p>
    <output class="code__display code__display--pin" aria-live="polite">······</output>
    ${qwertyKeypad('ABCDEFGHJKMNPQRSTVWXYZ0123456789', [],
      '<button class="key osk__key osk__key--wide" data-key="⌫">⌫</button>')}
    <p class="code__status"></p>
    <hr class="pane__rule">
    <p class="pane__hint">Share this board's setup: get a code to write down, then enter it on another board (Settings → Setup code) or at <b>${location.host}/setup</b>.</p>
    <button class="btn" data-export>Get a code for this board</button>
    <div class="code-export" hidden>
      <output class="code__display code__display--pin" aria-live="polite"></output>
      <p class="pane__hint code-export__note"></p>
    </div>
    <hr class="pane__rule">
    <p class="pane__hint">Or move this board's setup to your phone.</p>
    <button class="btn" data-qr>Show QR of current config</button>
    <div class="qr"></div>
    <p class="pane__hint">Setting up a non-touch device? Scan the QR code, click through the options to get a pre-configured <b>signage URL</b>.</p>`;
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
    // cellSize 3 (was 6): the config QR is dense (~25-version for the full
    // encoded cfg), and at 6 it dominated the pane. ~350 logical px ≈ 22cm on
    // the 55" panel — still an easy phone scan. Margin stays 4 (QR quiet zone).
    pane().querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 4 });
  });
  pane().querySelector('[data-export]').addEventListener('click', async () => {
    const btn = pane().querySelector('[data-export]');
    const box = pane().querySelector('.code-export');
    const codeEl = box.querySelector('.code__display');
    const note = box.querySelector('.code-export__note');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Getting code…';
    try {
      const encoded = await encodeConfig(normalizeConfig(state.cfg));
      const res = await fetch(`${WORKER_URL}/code`, { method: 'POST', body: JSON.stringify({ cfg: encoded }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { code } = await res.json();
      codeEl.textContent = code;
      note.textContent = `Write it down. Enter it on another board (Settings → Setup code) or at ${location.host}/setup — expires in 1 hour.`;
    } catch (err) {
      codeEl.textContent = '—';
      note.textContent = `Couldn't reach the code service (${err.message}). Check that the Worker is deployed.`;
    } finally {
      box.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

/* ---------- diagnostics ---------- */

function renderDiag() {
  const rows = state.cfg.layout.map(({ id }) => {
    const cache = loadCache(id);
    const age = cache ? Math.round((Date.now() / 1000 - cache.t) / 60) : null;
    return `<span>${WIDGET_LABELS[id]}</span>
      <b>${age === null ? 'no data yet' : age < 1 ? 'fresh' : `${age} min ago`}</b>`;
  });
  pane().innerHTML = `
    <h2 class="pane__title">Diagnostics</h2>
    <div class="kv-grid">
      <span>Config source</span><b>${window.__signage?.source ?? '—'}</b>
      <span>Vault sync</span><b>${window.__signage?.vault ?? 'not connected'}</b>
      ${rows.join('')}
      <span>User agent</span><b class="kv__small">${escapeHtml(navigator.userAgent)}</b>
    </div>
    <div class="row">
      <button class="toggle ${state.cfg.beacon ? 'is-on' : ''}" data-beacon role="switch" aria-checked="${state.cfg.beacon}">
        <span class="toggle__knob"></span>
      </button>
      <span class="row__label">Anonymous usage ping</span>
    </div>
    <p class="pane__hint">Once an hour the board sends a random device id, its widget list, display mode, version, and timezone — nothing personal. Helps the operator count active boards.</p>
    <p class="pane__label">Display</p>
    <div class="btnrow"><button class="btn btn--primary" data-reload>Reload display now</button></div>
    <p class="pane__label">Storage</p>
    <div class="btnrow">
      <button class="btn" data-clear>Clear web storage (test vault recovery)</button>
      <button class="btn" data-reset>Reset this display</button>
    </div>
    <p class="pane__hint">Clear wipes this page's saved data — on a board with the macro, your setup should return by itself within seconds. Reset also erases the macro vault and returns to the welcome screen.</p>`;
  pane().querySelector('[data-beacon]').addEventListener('click', () => {
    state.cfg.beacon = !state.cfg.beacon;
    renderDiag();
  });
  pane().querySelector('[data-reload]').addEventListener('click', () => location.reload());
  const confirmThen = (btn, action) => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.armed) {
        await action();
        return;
      }
      btn.dataset.armed = '1';
      const original = btn.textContent;
      btn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = original;
      }, 4000);
    });
  };
  confirmThen(pane().querySelector('[data-clear]'), async () => {
    window.localStorage.clear();
    location.reload();
  });
  confirmThen(pane().querySelector('[data-reset]'), async () => {
    try {
      await window.__signage?.bridge?.sendReset();
    } catch {
      // no bridge: local reset only
    }
    window.localStorage.clear();
    location.reload();
  });
}
