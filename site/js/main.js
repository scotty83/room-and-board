// Boot and runtime orchestration for the signage dashboard.

import { normalizeConfig, decodeConfig } from './config.js';
import { loadConfig, saveConfig, loadCache, saveCache } from './store.js';
import { fetchJSON, fetchBuffer, fetchText } from './net.js';
import { fmtClock } from './util.js';
import { schedule } from './scheduler.js';
import { resolveMode, ambientSource } from './modes.js';
import { registerWidget, getWidget } from './registry.js';
import { chooseBootConfig } from './boot.js';
import { parseFragment } from './bridge.js';
import { stripData, stripHtml } from './ambient.js';
import { createSlideshow, swipeAction } from './imageshow.js';
import { startBeacon } from './fleet.js';
import { DEMO_VMS } from '../demo/fixtures.js';
import { initTextViewer } from './textviewer.js';
import { icon } from './icons.js';

import * as clock from './widgets/clock.js';
import * as weather from './widgets/weather.js';
import * as subway from './widgets/subway.js';
import * as lirr from './widgets/lirr.js';
import * as mnr from './widgets/mnr.js';
import * as bus from './widgets/bus.js';
import * as njt from './widgets/njt.js';
import * as amtrak from './widgets/amtrak.js';
import * as pathw from './widgets/path.js';
import * as ferry from './widgets/ferry.js';
import * as art from './widgets/art.js';
import * as history from './widgets/history.js';
import * as aqi from './widgets/aqi.js';
import * as quote from './widgets/quote.js';
import * as wotd from './widgets/wotd.js';
import * as markets from './widgets/markets.js';
import * as marketsnews from './widgets/marketsnews.js';
import * as worldclock from './widgets/worldclock.js';
import * as sports from './widgets/sports.js';
import * as worldcup from './widgets/worldcup.js';
import * as f1 from './widgets/f1.js';
import * as golf from './widgets/golf.js';
import * as tennis from './widgets/tennis.js';
import * as iptv from './widgets/iptv.js';
import * as news from './widgets/news.js';
import * as substack from './widgets/substack.js';
import * as bsky from './widgets/bsky.js';
import * as photos from './widgets/photos.js';
import * as gdrivephotos from './widgets/gdrivephotos.js';
import * as services from './widgets/services.js';
import * as apod from './widgets/apod.js';
import * as chart from './widgets/chart.js';
import * as citibike from './widgets/citibike.js';
import * as tfl from './widgets/tfl.js';
import { resolvePhotosManifest } from './photos-manifest.js';

const MODULES = [weather, subway, lirr, mnr, njt, amtrak, pathw, ferry, bus, art, history, aqi, quote, wotd, markets, marketsnews, worldclock, sports, worldcup, news, substack, bsky, photos, gdrivephotos, services, apod, chart, citibike, tfl, f1, golf, tennis, iptv];
for (const m of MODULES) registerWidget(m);

const net = { fetchJSON, fetchBuffer, fetchText };
const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';

let cfg = null;
// Liveness heartbeat for the watchdog: bumped on every clock tick, NOT on
// widget freshness. A board showing only stale data (upstream outage) or only
// daily-refresh widgets is still alive — the clock proves the page isn't
// wedged, so it must not trigger a reload loop.
let lastRender = Date.now();
let slideshow = null;
let slideshowStarting = false; // guards the await gap in startSlideshow
const cancels = [];

function cardFor(mod, rect) {
  let card = document.querySelector(`[data-widget="${mod.meta.id}"]`);
  if (!card) {
    card = document.createElement('article');
    card.className = `card card--${mod.meta.id}`;
    card.setAttribute('data-widget', mod.meta.id);
    card.innerHTML = `
      <h2 class="card__title">${mod.meta.title}</h2>
      <div class="card__body"></div>
      <div class="card__stamp" hidden></div>`;
    // Unconfigured cards tap straight into their Settings section — the
    // prompt names the destination; the tap saves the trip. Card-level and
    // inert unless a data-setup prompt is currently showing.
    card.addEventListener('click', async () => {
      // Retired-card prompt: straight into edit mode to swap the widget.
      if (card.querySelector('[data-edit]')) { $('#edit').click(); return; }
      const prompt = card.querySelector('[data-setup]');
      if (!prompt) return;
      const settings = await import('./settings/settings.js');
      settings.openSettings(cfg ?? normalizeConfig({}), { focus: prompt.dataset.setup });
    });
    $('#grid').appendChild(card);
  }
  if (rect) {
    card.style.gridColumn = `${rect.x + 1} / span ${rect.w}`;
    card.style.gridRow = `${rect.y + 1} / span ${rect.h}`;
    // Size hooks for per-size compact styling (container queries need a newer
    // Chromium than gen1 boards have). Tier classes: t-s/t-m/t-l by height,
    // t-narrow when 4 or fewer columns wide.
    card.dataset.w = rect.w;
    card.dataset.h = rect.h;
    card.classList.remove('t-s', 't-m', 't-l', 't-narrow');
    card.classList.add(`t-${rect.h <= 2 ? 's' : rect.h <= 4 ? 'm' : 'l'}`);
    if (rect.w <= 4) card.classList.add('t-narrow');
  }
  return card;
}

function stampOf(card) {
  return card.querySelector('.card__stamp');
}

function markFresh(card) {
  card.classList.remove('is-stale');
  stampOf(card).hidden = true;
}

function markStale(card, cachedAtSec) {
  card.classList.add('is-stale');
  const stamp = stampOf(card);
  if (cachedAtSec) {
    // Freshness stamp is a clock reading, so it follows cfg.clock24 (unlike
    // the transit schedule times in the card body).
    stamp.textContent = `as of ${fmtClock(cachedAtSec, cfg?.clock24)}`;
    stamp.hidden = false;
  }
}

function renderWidget(mod, vm, rect) {
  const card = cardFor(mod, rect);
  try {
    mod.render(card.querySelector('.card__body'), vm, cfg);
  } catch (err) {
    console.error(`[signage] render failed: ${mod.meta.id}`, err);
  }
}

function startWidget(mod, rect) {
  const card = cardFor(mod, rect);
  const cached = loadCache(mod.meta.id);
  if (cached) {
    renderWidget(mod, cached.data);
    markStale(card, cached.t);
  }
  const cancel = schedule(async () => {
    try {
      const vm = await mod.fetchData(cfg, net);
      saveCache(mod.meta.id, vm);
      renderWidget(mod, vm);
      // A worker-served stale fallback (up to 24h old) must not read as fresh:
      // dim the card and stamp its age instead of clearing the stale mark.
      if (vm?.stale) markStale(card, vm.updatedAt);
      else markFresh(card);
    } catch (err) {
      markStale(card, loadCache(mod.meta.id)?.t);
      throw err; // let the scheduler back off
    }
  }, mod.meta.refreshMs);
  cancels.push(cancel);
}

function renderStrip() {
  // The strip only shows in ambient mode; skip the cache reads + DOM rebuild
  // on the 30 s schedule while the dashboard grid is up.
  if (!DEMO && !document.body.classList.contains('mode-ambient')) return;
  const caches = {};
  for (const id of ['weather', 'lirr', 'mnr', 'njt']) caches[id] = loadCache(id)?.data;
  const data = DEMO
    ? stripData(
        { weather: DEMO_VMS.weather, lirr: DEMO_VMS.lirr, mnr: DEMO_VMS.mnr, njt: DEMO_VMS.njt },
        cfg,
      )
    : stripData(caches, cfg);
  $('#strip').innerHTML = stripHtml(data, new Date());
}

async function startSlideshow() {
  // `slideshow` is only assigned after the manifest await, so two near-
  // simultaneous calls (applyMode runs once directly + once from schedule's
  // immediate first tick) would both pass a `slideshow`-only guard and spawn a
  // second, un-stoppable engine. The synchronous in-flight flag closes that gap.
  if (slideshow || slideshowStarting) return;
  slideshowStarting = true;
  try {
    const src = ambientSource(cfg);
    let manifest;
    if (DEMO) manifest = [DEMO_VMS.art];
    else if (src === 'photos') manifest = await resolvePhotosManifest(cfg, net, photos);
    else if (src === 'gdrivephotos') manifest = await resolvePhotosManifest(cfg, net, gdrivephotos);
    else manifest = art.filterByCats(await fetchJSON('data/art-manifest.json'), cfg.art?.cats);
    if (!manifest.length) return; // don't lock an empty slideshow; retry next applyMode
    // Each ambient source owns its interval: the chosen photo widget's every for
    // its slideshow, art.every for art (art's setting used to leak into photos).
    const everyMin = (src === 'photos' ? cfg.photos?.every : src === 'gdrivephotos' ? cfg.gdrivephotos?.every : cfg.art?.every) ?? 30;
    slideshow = createSlideshow(manifest, $('#slideshow'), { intervalMs: everyMin * 60 * 1000 });
    slideshow.start();
  } catch (err) { console.error('[signage] slideshow unavailable', err); }
  finally { slideshowStarting = false; }
}

function applyMode() {
  const forced = params.get('mode');
  const mode = forced === 'ambient' || forced === 'dashboard' ? forced : resolveMode(cfg, new Date());
  const ambient = mode === 'ambient' && ambientSource(cfg) !== null;
  document.body.classList.toggle('mode-ambient', ambient);
  $('#ambient').hidden = !ambient;
  $('#grid').hidden = ambient;
  if (ambient) {
    startSlideshow();
    renderStrip();
  } else if (slideshow) {
    slideshow.stop();
    slideshow = null;
  }
}

function startClock() {
  const tick = () => {
    clock.render($('#topbar'), null, cfg);
    lastRender = Date.now(); // heartbeat: the clock ticking proves the page is alive
  };
  tick();
  cancels.push(schedule(tick, clock.meta.refreshMs, { jitter: 0 }));
}

function showWelcome() {
  const welcome = $('#welcome');
  welcome.hidden = false;
  $('#grid').hidden = true;
  welcome.innerHTML = `
    <div class="welcome__inner">
      <img class="welcome__logo" src="assets/room-and-board-lockup-dark.svg" alt="Room & Board" width="340" height="88">
      <h1>Welcome to your office display</h1>
      <p>Set it up from your phone or desktop, or start with sensible defaults and fine-tune later.</p>
      <div class="qr welcome__qr"></div>
      <p class="welcome__hint">Scan to build a setup code on your phone, or visit <b>${location.host}/setup</b>.</p>
      <div class="welcome__actions">
        <button class="btn btn--primary" data-action="enter-code">I have a setup code</button>
        <button class="btn" data-action="quick-start">Quick start</button>
      </div>
    </div>`;
  // The board's URL isn't visible to the person standing in front of it, so a
  // /setup hint alone can't get them there — the QR carries the full address.
  // Best-effort: if the QR module fails to load, the text hint still names the host.
  import('./vendor/qrcode.js')
    .then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(`https://${location.host}/setup`);
      qr.make();
      welcome.querySelector('.welcome__qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3 });
    })
    .catch(() => {});
  welcome.querySelector('[data-action="quick-start"]').addEventListener('click', async () => {
    const { QUICKSTART_CONFIG } = await import('./quickstart.js');
    cfg = normalizeConfig({ ...QUICKSTART_CONFIG, t: Math.floor(Date.now() / 1000) });
    await saveConfig(cfg);
    welcome.hidden = true;
    $('#grid').hidden = false;
    startRuntime();
  });
  welcome.querySelector('[data-action="enter-code"]').addEventListener('click', async () => {
    const settings = await import('./settings/settings.js');
    settings.openSettings(cfg ?? normalizeConfig({}), { focus: 'code' });
  });
}

function startSelfHealing() {
  // Reload nightly at ~4 AM to pick up deploys and clear any memory creep.
  const now = new Date();
  const next4 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0);
  if (next4 <= now) next4.setDate(next4.getDate() + 1);
  setTimeout(() => location.reload(), next4 - now);

  // Hourly version check → reload when the site is redeployed.
  let bootVersion = null;
  cancels.push(
    schedule(async () => {
      const v = await fetchJSON(`version.json?bust=${Date.now()}`);
      if (bootVersion === null) bootVersion = v.version;
      else if (v.version !== bootVersion) location.reload();
    }, 60 * 60 * 1000),
  );

  // Watchdog: if nothing has rendered fresh data for 15 minutes while the
  // browser thinks it is online, reload the page.
  setInterval(() => {
    if (navigator.onLine !== false && Date.now() - lastRender > 15 * 60 * 1000) {
      location.reload();
    }
  }, 60 * 1000);
}

function startRuntime() {
  startClock();
  for (const rect of cfg.layout) {
    const mod = getWidget(rect.id);
    if (mod) startWidget(mod, rect);
  }
  applyMode();
  cancels.push(schedule(applyMode, 60 * 1000, { jitter: 0 }));
  cancels.push(schedule(renderStrip, 30 * 1000, { jitter: 0 }));
  if (!DEMO) {
    startSelfHealing();
    cancels.push(startBeacon(() => cfg));
  }
}

async function boot() {
  $('#gear').innerHTML = icon('settings', 'icon--btn');
  $('#edit').innerHTML = icon('pencil', 'icon--btn');
  initTextViewer($('#grid'));
  const fragment = parseFragment(location.hash);
  // Diagnostics surface — but the bridge passphrase (auth.p) must NOT sit on a
  // global where injected script could read it. Expose only non-secret fields;
  // connectBridge below uses the local `fragment` (with the passphrase) instead.
  window.__signage = {
    fragment: { cfg: fragment.cfg, auth: fragment.auth ? { u: fragment.auth.u, ip: fragment.auth.ip } : null },
    source: null,
  };

  if (DEMO) {
    cfg = normalizeConfig({
      v: 3,
      name: 'User',
      mode: 'dashboard',
      layout: [
        { id: 'weather', x: 0, y: 0, w: 4, h: 4 },
        { id: 'subway', x: 4, y: 0, w: 4, h: 4 },
        { id: 'lirr', x: 8, y: 0, w: 4, h: 4 },
        { id: 'art', x: 0, y: 4, w: 2, h: 4 },
        { id: 'worldclock', x: 2, y: 4, w: 2, h: 4 },
        { id: 'history', x: 4, y: 4, w: 6, h: 2 },
        { id: 'quote', x: 4, y: 6, w: 6, h: 2 },
        { id: 'aqi', x: 10, y: 4, w: 2, h: 4 },
      ],
    });
    startClock();
    for (const rect of cfg.layout) {
      const mod = getWidget(rect.id);
      if (mod) renderWidget(mod, DEMO_VMS[mod.meta.id], rect);
    }
    applyMode();
    return;
  }

  let fragmentCfg = null;
  if (fragment.cfg) {
    try {
      fragmentCfg = await decodeConfig(fragment.cfg);
    } catch {
      fragmentCfg = null;
    }
  }
  const stored = await loadConfig();
  const { cfg: chosen, source } = chooseBootConfig(fragmentCfg, stored);
  window.__signage.source = source;

  if (!chosen) {
    showWelcome();
    return;
  }
  cfg = chosen;
  if (source === 'fragment') await saveConfig(cfg); // repair wiped storage
  startRuntime();

  // Vault sync runs opportunistically after first paint; settings uses the
  // connection to mirror saves into the macro vault.
  if (fragment.auth) {
    import('./bridge.js').then(async ({ connectBridge }) => {
      try {
        window.__signage.bridge = await connectBridge(fragment.auth);
        window.__signage.vault = 'connected';
      } catch {
        window.__signage.vault = 'offline';
      }
    });
  }
}

// Ambient slideshow swipe: left/right steps the photo/art slideshow using the
// same gesture classifier as the full-screen viewer. Handlers live on the
// static #slideshow host (they survive createSlideshow re-rendering its
// innerHTML) and read the module-level `slideshow`, so every ambient session
// is covered without re-wiring.
{
  const host = $('#slideshow');
  let downX = 0;
  let downY = 0;
  host.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  host.addEventListener('pointerup', (e) => {
    const action = swipeAction(e.clientX - downX, e.clientY - downY);
    if (action === 'next' || action === 'prev') slideshow?.step(action === 'next' ? 1 : -1);
  });
}

$('#gear').addEventListener('click', async () => {
  const settings = await import('./settings/settings.js');
  settings.openSettings(cfg ?? normalizeConfig({}), {});
});

$('#edit').addEventListener('click', async () => {
  if (!cfg) return;
  const { openEditMode } = await import('./edit.js');
  openEditMode(cfg, {
    async onDone(layout) {
      cfg = normalizeConfig({ ...cfg, layout, t: Math.floor(Date.now() / 1000) });
      if (DEMO) return location.reload(); // demo sessions never persist
      await saveConfig(cfg);
      try {
        if (window.__signage?.bridge) {
          const { encodeConfig } = await import('./config.js');
          await window.__signage.bridge.sendConfig(await encodeConfig(cfg));
          window.__signage.vault = 'synced';
        }
      } catch {
        window.__signage.vault = 'offline';
      }
      location.reload();
    },
  });
});

// A boot crash means no runtime and therefore no watchdog — reload is the
// only recovery path on an unattended board.
boot().catch((err) => {
  console.error('[signage] boot failed', err);
  setTimeout(() => location.reload(), 60 * 1000);
});
