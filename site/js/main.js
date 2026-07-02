// Boot and runtime orchestration for the signage dashboard.

import { normalizeConfig, decodeConfig, DEFAULT_CONFIG } from './config.js';
import { loadConfig, saveConfig, loadCache, saveCache } from './store.js';
import { fetchJSON, fetchBuffer } from './net.js';
import { schedule } from './scheduler.js';
import { resolveMode } from './modes.js';
import { registerWidget, activeWidgets, getWidget } from './registry.js';
import { chooseBootConfig } from './boot.js';
import { parseFragment } from './bridge.js';
import { stripData } from './ambient.js';
import { DEMO_VMS } from '../demo/fixtures.js';

import * as clock from './widgets/clock.js';
import * as weather from './widgets/weather.js';
import * as subway from './widgets/subway.js';
import * as lirr from './widgets/lirr.js';
import * as njt from './widgets/njt.js';
import * as art from './widgets/art.js';
import * as history from './widgets/history.js';
import * as aqi from './widgets/aqi.js';
import * as quote from './widgets/quote.js';
import * as markets from './widgets/markets.js';

const MODULES = [weather, subway, lirr, njt, art, history, aqi, quote, markets];
for (const m of MODULES) registerWidget(m);

const net = { fetchJSON, fetchBuffer };
const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';

let cfg = null;
let lastFreshRender = Date.now();
let slideshow = null;
const cancels = [];

function cardFor(mod) {
  let card = document.querySelector(`[data-widget="${mod.meta.id}"]`);
  if (!card) {
    card = document.createElement('article');
    card.className = `card card--${mod.meta.id}`;
    card.setAttribute('data-widget', mod.meta.id);
    card.innerHTML = `
      <h2 class="card__title">${mod.meta.title}</h2>
      <div class="card__body"></div>
      <div class="card__stamp" hidden></div>`;
    $('#grid').appendChild(card);
  }
  return card;
}

function stampOf(card) {
  return card.querySelector('.card__stamp');
}

function markFresh(card) {
  card.classList.remove('is-stale');
  stampOf(card).hidden = true;
  lastFreshRender = Date.now();
}

function markStale(card, cachedAtSec) {
  card.classList.add('is-stale');
  const stamp = stampOf(card);
  if (cachedAtSec) {
    const t = new Date(cachedAtSec * 1000);
    stamp.textContent = `as of ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    stamp.hidden = false;
  }
}

function renderWidget(mod, vm) {
  const card = cardFor(mod);
  try {
    mod.render(card.querySelector('.card__body'), vm, cfg);
  } catch (err) {
    console.error(`[signage] render failed: ${mod.meta.id}`, err);
  }
}

function startWidget(mod) {
  const card = cardFor(mod);
  const cached = loadCache(mod.meta.id);
  if (cached) {
    renderWidget(mod, cached.data);
    markStale(card, cached.t);
  }
  const cancel = schedule(async () => {
    const deps = mod.meta.id === 'aqi' ? { weatherVm: loadCache('weather')?.data } : undefined;
    try {
      const vm = await mod.fetchData(cfg, net, deps);
      saveCache(mod.meta.id, vm);
      renderWidget(mod, vm);
      markFresh(card);
    } catch (err) {
      markStale(card, loadCache(mod.meta.id)?.t);
      throw err; // let the scheduler back off
    }
  }, mod.meta.refreshMs);
  cancels.push(cancel);
}

function renderStrip() {
  const caches = {};
  for (const id of ['weather', 'subway', 'lirr', 'njt']) caches[id] = loadCache(id)?.data;
  const data = DEMO
    ? stripData(
        { weather: DEMO_VMS.weather, subway: DEMO_VMS.subway, lirr: DEMO_VMS.lirr, njt: DEMO_VMS.njt },
        cfg,
      )
    : stripData(caches, cfg);
  const now = new Date();
  $('#strip').innerHTML = `
    <span class="strip__time">${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    ${data.temp !== null ? `<span class="strip__temp">${data.temp}°</span>` : ''}
    ${data.transit
      .map((t) => `<span class="strip__transit">${t.label} <b>${t.min} min</b></span>`)
      .join('')}`;
}

async function startSlideshow() {
  if (slideshow) return;
  try {
    const manifest = DEMO ? [DEMO_VMS.art] : await fetchJSON('data/art-manifest.json');
    slideshow = art.createSlideshow(manifest, $('#slideshow'));
    slideshow.start();
  } catch (err) {
    console.error('[signage] slideshow unavailable', err);
  }
}

function applyMode() {
  const forced = params.get('mode');
  const mode = forced === 'ambient' || forced === 'dashboard' ? forced : resolveMode(cfg, new Date());
  const ambient = mode === 'ambient' && cfg.widgets.includes('art');
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
  const tick = () => clock.render($('#topbar'), null, cfg);
  tick();
  cancels.push(schedule(tick, clock.meta.refreshMs, { jitter: 0 }));
}

function showWelcome() {
  const welcome = $('#welcome');
  welcome.hidden = false;
  $('#grid').hidden = true;
  welcome.innerHTML = `
    <div class="welcome__inner">
      <h1>Welcome to your office display</h1>
      <p>Set it up from your phone or laptop, or start with sensible defaults and fine-tune later.</p>
      <div class="welcome__actions">
        <button class="btn btn--primary" data-action="quick-start">Quick start</button>
        <button class="btn" data-action="enter-code">I have a setup code</button>
      </div>
      <p class="welcome__hint">Build a setup code at <b>/setup</b> on this site from any device.</p>
    </div>`;
  welcome.querySelector('[data-action="quick-start"]').addEventListener('click', async () => {
    cfg = normalizeConfig({ ...DEFAULT_CONFIG, t: Math.floor(Date.now() / 1000) });
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
    if (navigator.onLine !== false && Date.now() - lastFreshRender > 15 * 60 * 1000) {
      location.reload();
    }
  }, 60 * 1000);
}

function startRuntime() {
  startClock();
  for (const mod of activeWidgets(cfg)) startWidget(mod);
  applyMode();
  cancels.push(schedule(applyMode, 60 * 1000, { jitter: 0 }));
  cancels.push(schedule(renderStrip, 30 * 1000, { jitter: 0 }));
  if (!DEMO) startSelfHealing();
}

async function boot() {
  document.body.classList.add('theme-dark');
  const fragment = parseFragment(location.hash);
  window.__signage = { fragment, source: null }; // diagnostics surface

  if (DEMO) {
    cfg = normalizeConfig({
      name: 'Sean',
      widgets: ['weather', 'subway', 'lirr', 'njt', 'markets', 'art', 'history', 'aqi', 'quote'],
      mode: 'dashboard',
    });
    startClock();
    for (const mod of activeWidgets(cfg)) {
      renderWidget(mod, DEMO_VMS[mod.meta.id]);
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

$('#gear').addEventListener('click', async () => {
  const settings = await import('./settings/settings.js');
  settings.openSettings(cfg ?? normalizeConfig({}), {});
});

boot();
