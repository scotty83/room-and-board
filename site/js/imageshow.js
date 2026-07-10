// Shared image viewer + ambient slideshow engine, used by both the Art widget
// and the Photos widget.  The viewer takes a pre-built photo list; callers are
// responsible for fetching/building that list before opening.

import { escapeHtml } from './util.js';
import { stripData, stripHtml } from './ambient.js';
import { loadCache } from './store.js';

// Caption metadata line: artist [· year] for art; empty when absent (e.g. photos).
function captionMeta(item) {
  if (!item.artist) return '';
  return `${escapeHtml(item.artist)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}`;
}

// Pointer-gesture classifier for the viewer: horizontal drags navigate,
// small movements are taps (close), anything ambiguous is ignored.
export function swipeAction(dx, dy) {
  if (Math.abs(dx) >= 60 && Math.abs(dx) >= 2 * Math.abs(dy)) return dx < 0 ? 'next' : 'prev';
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return 'tap';
  return null;
}

let stripTimer = null;
let viewerList = null; // photo list for the open viewer session
let viewerIndex = -1;
let viewerGen = 0; // bumped per open; kept for session identity
let userStepped = false; // guards against clobbering a swipe with deferred state

// Full-screen viewer: tap the dashboard card to open, tap anywhere to close,
// swipe left/right to browse the supplied photo list.  Shows the ambient info
// strip so the clock stays visible.  Stays up indefinitely (mode changes don't
// touch it).
export function openImageViewer(current, cfg, { list = [] } = {}) {
  // Reset session state synchronously.
  ++viewerGen;
  userStepped = false;
  let viewer = document.querySelector('#art-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'art-viewer';
    viewer.className = 'art-viewer';
    // Close on tap, navigate on swipe.  The trailing click is classified by
    // its own coordinates against the gesture origin — no suppression state,
    // so a swipe that never produces a click can't swallow the next tap.
    let downX = 0;
    let downY = 0;
    viewer.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    viewer.addEventListener('pointerup', (e) => {
      const action = swipeAction(e.clientX - downX, e.clientY - downY);
      if (action === 'next' || action === 'prev') step(viewer, action === 'next' ? 1 : -1);
    });
    viewer.addEventListener('click', (e) => {
      if (swipeAction(e.clientX - downX, e.clientY - downY) !== 'tap') return;
      viewer.hidden = true;
      clearInterval(stripTimer);
    });
    document.body.appendChild(viewer);
  }
  viewer.innerHTML = `
    <img class="art-viewer__img" src="${escapeHtml(current.img)}" alt="${escapeHtml(current.title)}">
    <div class="slide-caption">
      <span class="slide-caption__title">${escapeHtml(current.title)}</span>
      <span class="slide-caption__meta">${captionMeta(current)}</span>
    </div>
    <div class="strip"></div>`;
  const strip = viewer.querySelector('.strip');
  const refreshStrip = () => {
    const caches = {};
    for (const id of ['weather', 'lirr', 'mnr', 'njt']) caches[id] = loadCache(id)?.data;
    strip.innerHTML = stripHtml(stripData(caches, cfg ?? { widgets: [] }), new Date());
  };
  refreshStrip();
  clearInterval(stripTimer);
  stripTimer = setInterval(refreshStrip, 30 * 1000);
  // Seed the session list synchronously — no fetch here; callers pass the list.
  viewerList = Array.isArray(list) ? list : [];
  viewerIndex = viewerList.findIndex((a) => a.img === current.img);
  viewer.hidden = false;
}

// Swap in place: preload first (slideshow pattern), then update img + caption.
function step(viewer, dir) {
  if (!viewerList?.length) return;
  userStepped = true;
  viewerIndex = (viewerIndex + dir + viewerList.length) % viewerList.length;
  const item = viewerList[viewerIndex];
  const img = new Image();
  const swap = () => {
    const imgEl = viewer.querySelector('.art-viewer__img');
    imgEl.src = item.img;
    imgEl.alt = item.title;
    viewer.querySelector('.slide-caption').innerHTML = `
      <span class="slide-caption__title">${escapeHtml(item.title)}</span>
      <span class="slide-caption__meta">${captionMeta(item)}</span>`;
  };
  img.onload = swap;
  img.onerror = swap; // show anyway; <img> will retry like the slideshow does
  img.src = item.img;
}

// Ambient slideshow engine: two stacked layers, crossfade via [data-active].
// deps.now/random are injectable for tests.
export function createSlideshow(manifest, host, { intervalMs = 75000, random = Math.random } = {}) {
  let order = shuffle([...manifest.keys()], random);
  let pos = 0;
  let timer = null;
  let active = 0;
  let stopped = false;

  host.innerHTML = `
    <div class="slide" data-layer="0"></div>
    <div class="slide" data-layer="1"></div>
    <div class="slide-caption"></div>`;
  const layers = [...host.querySelectorAll('.slide')];
  const caption = host.querySelector('.slide-caption');

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function itemAt(p) {
    if (p >= order.length) {
      order = shuffle(order, random);
      pos = 0;
    }
    return manifest[order[pos]];
  }

  function show(item) {
    const next = layers[1 - active];
    next.style.backgroundImage = `url("${item.img}")`;
    // Near-16:9 works fill the screen; anything else letterboxes on black
    // rather than losing large parts of the canvas to a cover crop.
    const nearScreen = item.ar && item.ar >= 1.55 && item.ar <= 2.1;
    next.style.backgroundSize = nearScreen ? 'cover' : 'contain';
    next.setAttribute('data-active', '');
    layers[active].removeAttribute('data-active');
    active = 1 - active;
    caption.innerHTML = `<span class="slide-caption__title">${escapeHtml(item.title)}</span>
      <span class="slide-caption__meta">${captionMeta(item)}</span>`;
  }

  function preload(item, done) {
    const img = new Image();
    img.onload = () => done();
    img.onerror = () => done(); // show anyway; background-image will retry
    img.src = item.img;
  }

  function advance() {
    if (stopped) return;
    const item = itemAt(pos);
    pos += 1;
    preload(item, () => {
      // stop() during an in-flight preload must not resurrect the loop: the
      // pending onload/onerror would otherwise schedule an uncancellable chain.
      if (stopped) return;
      show(item);
      timer = setTimeout(advance, intervalMs);
    });
  }

  return {
    start() {
      if (!manifest.length) return;
      stopped = false;
      advance();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    // Manual navigation (ambient swipe): next reuses the natural advance,
    // prev re-shows the previously shown item within the current order. Both
    // reset the auto-advance cadence so a swipe isn't followed moments later
    // by a scheduled change.
    step(dir) {
      if (stopped || !manifest.length) return;
      clearTimeout(timer);
      if (dir > 0) {
        advance();
        return;
      }
      pos = (pos - 2 + order.length) % order.length;
      const item = manifest[order[pos]];
      pos += 1;
      preload(item, () => {
        if (stopped) return;
        show(item);
        timer = setTimeout(advance, intervalMs);
      });
    },
    current() {
      return manifest[order[Math.max(pos - 1, 0)]] ?? null;
    },
  };
}
