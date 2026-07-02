// Public-domain art from the bundled manifest (built from The Met + Art
// Institute of Chicago open-access APIs). Images load via <img>, so no CORS
// involvement; the slideshow crossfades two stacked layers with an opacity
// transition only (gen1-safe) and preloads the next image before switching.

import { escapeHtml } from '../util.js';

export const meta = { id: 'art', title: 'Art', refreshMs: 6 * 60 * 60 * 1000 };

export function render(el, vm, _cfg) {
  el.innerHTML = `
    <figure class="artwork">
      <img class="artwork__img" src="${escapeHtml(vm.img)}" alt="${escapeHtml(vm.title)}" loading="lazy">
      <figcaption class="artwork__caption">
        <span class="artwork__title">${escapeHtml(vm.title)}</span>
        <span class="artwork__artist">${escapeHtml(vm.artist)}${vm.year ? ` (${escapeHtml(vm.year)})` : ''}</span>
      </figcaption>
    </figure>`;
}

export async function fetchData(cfg, net) {
  const manifest = await net.fetchJSON('data/art-manifest.json');
  // Rotate deterministically so refreshes don't repeat the same piece.
  const idx = Math.floor(Date.now() / meta.refreshMs) % manifest.length;
  return manifest[idx];
}

// Ambient slideshow engine: two stacked layers, crossfade via [data-active].
// deps.now/random are injectable for tests.
export function createSlideshow(manifest, host, { intervalMs = 75000, random = Math.random } = {}) {
  let order = shuffle([...manifest.keys()], random);
  let pos = 0;
  let timer = null;
  let active = 0;

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
    next.setAttribute('data-active', '');
    layers[active].removeAttribute('data-active');
    active = 1 - active;
    caption.innerHTML = `<span class="slide-caption__title">${escapeHtml(item.title)}</span>
      <span class="slide-caption__meta">${escapeHtml(item.artist)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</span>`;
  }

  function preload(item, done) {
    const img = new Image();
    img.onload = () => done();
    img.onerror = () => done(); // show anyway; background-image will retry
    img.src = item.img;
  }

  function advance() {
    const item = itemAt(pos);
    pos += 1;
    preload(item, () => {
      show(item);
      timer = setTimeout(advance, intervalMs);
    });
  }

  return {
    start() {
      if (!manifest.length) return;
      advance();
    },
    stop() {
      clearTimeout(timer);
    },
    current() {
      return manifest[order[Math.max(pos - 1, 0)]] ?? null;
    },
  };
}
