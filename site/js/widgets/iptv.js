// Live Video: streams a user-supplied HLS (.m3u8) feed. RoomOS WebEngine is
// Chromium without native HLS, so playback rides hls.js (light build,
// vendored, loaded on demand only when a stream is configured) over MSE.
// Muted always — signage never makes sound, and muted is what allows
// autoplay. No stream is bundled or defaulted; the URL is the user's.

import { setupPrompt, setCardNote } from '../util.js';

export const meta = { id: 'iptv', title: 'Live Video', refreshMs: 60 * 1000 };

let hlsLoader = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsLoader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const fail = (msg) => {
      clearTimeout(guard);
      hlsLoader = null; // allow a later render to retry the load
      reject(new Error(msg));
    };
    // A network black hole can fire neither onload nor onerror; without the
    // guard every future render would await a dead promise until 4 AM.
    const guard = setTimeout(() => fail('hls.js load timed out'), 20000);
    s.src = 'js/vendor/hls.light.min.js';
    s.onload = () => { clearTimeout(guard); resolve(window.Hls); };
    s.onerror = () => fail('hls.js failed to load');
    document.head.appendChild(s);
  });
  return hlsLoader;
}

// One live mount per card body. The runtime re-renders every refreshMs and on
// layout/settings changes; a stream must survive re-renders untouched (same
// URL → no-op) but be torn down when the card goes away or the URL changes.
const mounts = new Map(); // el -> { url, hls, video, retryTimer, gen }

function destroyMount(el) {
  const m = mounts.get(el);
  if (!m) return;
  clearTimeout(m.retryTimer);
  m.gen++; // invalidates any in-flight async attach
  try { m.hls?.destroy(); } catch { /* already torn down */ }
  mounts.delete(el);
}

function sweep() {
  for (const el of [...mounts.keys()]) if (!el.isConnected) destroyMount(el);
}

function showError(el, m, msg) {
  el.innerHTML = `<div class="empty">${msg}</div>`;
  // Live feeds drop and come back; signage should self-heal unattended.
  m.retryTimer = setTimeout(() => {
    if (el.isConnected && mounts.get(el) === m) {
      destroyMount(el);
      mount(el, m.url);
    }
  }, 60 * 1000);
}

function mount(el, url) {
  el.innerHTML = '<div class="iptv"><video class="iptv__video" muted autoplay playsinline></video></div>';
  const video = el.querySelector('video');
  // Belt and suspenders for autoplay policy: some Chromium builds only honor
  // the muted IDL property (not the parsed attribute) when deciding whether
  // a gesture-less play() is allowed.
  video.muted = true;
  video.autoplay = true;
  const m = { url, hls: null, video, retryTimer: 0, gen: 0 };
  mounts.set(el, m);
  const gen = m.gen;

  // Native HLS first (covers phone-side previews); Chromium boards use MSE.
  if (typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('error', () => { if (m.gen === gen) showError(el, m, 'Stream unavailable'); });
    video.play?.().catch(() => { /* autoplay policy; muted should allow it */ });
    return;
  }

  loadHls().then((Hls) => {
    if (m.gen !== gen || !el.isConnected) return;
    if (!Hls?.isSupported()) {
      showError(el, m, 'This device cannot play HLS video');
      return;
    }
    // Cap quality to the card's rendered size — a 3x3 card never needs 1080p.
    // backBufferLength defaults to Infinity: on a live stream between nightly
    // reloads that grows MSE buffers unbounded on a memory-tight SoC.
    const h = new Hls({ capLevelToPlayerSize: true, backBufferLength: 90, maxBufferLength: 30 });
    m.hls = h;
    let mediaRecoveries = 0;
    h.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal || m.gen !== gen) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        showError(el, m, 'Stream unavailable');
      } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries++;
        h.recoverMediaError(); // hls.js-recommended first response
      } else {
        showError(el, m, 'Stream error');
      }
    });
    h.loadSource(url);
    h.attachMedia(video);
    h.on(Hls.Events.MANIFEST_PARSED, () => video.play?.().catch(() => {}));
    // If the policy rejected that early play(), retry once frames exist.
    video.addEventListener('canplay', () => { if (video.paused) video.play?.().catch(() => {}); });
  }).catch(() => {
    if (m.gen === gen) showError(el, m, 'Video player failed to load');
  });
}

export function render(el, vm, _cfg) {
  sweep();
  // Ambient mode hides the grid but schedules keep ticking — don't stream and
  // decode video behind the slideshow all night. The next tick after the
  // dashboard returns remounts automatically.
  if (document.body.classList.contains('mode-ambient')) {
    destroyMount(el);
    el.innerHTML = '';
    return;
  }
  setCardNote(el, vm.label || null);
  if (!vm.url) {
    destroyMount(el);
    el.innerHTML = setupPrompt('iptv', 'add a stream', 'Live Video');
    return;
  }
  const cur = mounts.get(el);
  if (cur && cur.url === vm.url) return; // stream already up — never restart it
  destroyMount(el);
  mount(el, vm.url);
}

// No polling: the "data" is the config itself; the video element streams.
export async function fetchData(cfg, _net) {
  return { url: cfg?.iptv?.url ?? '', label: cfg?.iptv?.label ?? '' };
}
