// Dedicated video-setup page. Takes an HLS stream URL (plus an optional card
// label), offers a muted preview (native HLS on iPhone Safari, hls.js light
// elsewhere), and mints a video-only setup code the user types on their board
// (Settings → Live Video → Enter code). The code merges ONLY the Live Video
// block — never the rest of the board's config.

import { WORKER_URL } from './env.js';
import { encodeVideoCode } from './config.js';

const $ = (sel) => document.querySelector(sel);
const STREAM_RE = /^https:\/\/\S+$/i;

const urlInput = $('#vs-url');
const status = $('#vs-status');
const video = $('#vs-video');
let hls = null;

function currentUrl() {
  const u = urlInput.value.trim();
  return STREAM_RE.test(u) ? u : '';
}

function refresh() {
  const u = urlInput.value.trim();
  $('#vs-getcode').disabled = !currentUrl();
  $('#vs-code').hidden = true; // an edited link stales any shown code
  status.textContent = u && !STREAM_RE.test(u)
    ? 'Must be an https link (usually ending in .m3u8).'
    : '';
  status.className = u && !STREAM_RE.test(u) ? 'hint ps-bad' : 'hint';
}
urlInput.addEventListener('input', refresh);
refresh();

async function preview() {
  const url = currentUrl();
  if (!url) { refresh(); return; }
  hls?.destroy();
  hls = null;
  video.hidden = false;
  status.textContent = 'Loading preview…';
  status.className = 'hint';
  const ok = () => { status.textContent = '✓ Playing.'; status.className = 'hint ps-ok'; };
  const bad = () => {
    status.textContent = "Couldn't play it here. If the stream is network-restricted it may still work on your board.";
    status.className = 'hint ps-bad';
  };
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.onplaying = ok;
    video.onerror = bad;
    video.play().catch(bad);
    return;
  }
  try {
    await import('./vendor/hls.light.min.js');
    if (!window.Hls?.isSupported()) { bad(); return; }
    hls = new window.Hls({ capLevelToPlayerSize: true, backBufferLength: 90, maxBufferLength: 30 });
    hls.on(window.Hls.Events.ERROR, (_e, d) => { if (d.fatal) bad(); });
    hls.loadSource(url);
    hls.attachMedia(video);
    video.onplaying = ok;
    video.play?.().catch(() => {});
  } catch {
    bad();
  }
}
$('#vs-preview').addEventListener('click', preview);

async function getCode() {
  const btn = $('#vs-getcode');
  btn.disabled = true;
  btn.textContent = 'Getting code…';
  try {
    const encoded = await encodeVideoCode({ url: currentUrl(), label: $('#vs-label').value });
    const res = await fetch(`${WORKER_URL}/code`, { method: 'POST', body: JSON.stringify({ cfg: encoded }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { code } = await res.json();
    $('#vs-code-out').textContent = code;
    $('#vs-code-note').textContent = 'On your board, open Settings → Live Video, tap Enter code, and type this in. Press Save. The code expires in 1 hour.';
    $('#vs-code').hidden = false;
    $('#vs-code').scrollIntoView({ block: 'end' });
  } catch (err) {
    $('#vs-code-out').textContent = '—';
    $('#vs-code-note').textContent = `Couldn't reach the code service (${err.message}). Try again in a moment.`;
    $('#vs-code').hidden = false;
  } finally {
    btn.textContent = 'Get board code';
    btn.disabled = !currentUrl();
  }
}
$('#vs-getcode').addEventListener('click', getCode);
