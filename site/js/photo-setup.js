// Dedicated photo-setup page. Validates a public iCloud album and/or Google
// Drive folder link against the Worker, then mints a photos-only setup code the
// user types on their board (Settings → Photos → Have a code?). That code merges
// ONLY the photo blocks — never the rest of the board's config — so it's safe to
// run against an already-configured board.

import { WORKER_URL } from './env.js';
import { parseAlbumToken, parseDriveFolder } from './util.js';
import { encodePhotosCode } from './config.js';

const $ = (sel) => document.querySelector(sel);
// Validated ids, ready to encode into the code. Cleared when an input fails.
const valid = { icloud: '', gdrive: '' };

function refreshCode() {
  $('#ps-getcode').disabled = !(valid.icloud || valid.gdrive);
  // A changed/invalidated input stales any shown code; hide it until re-minted.
  $('#ps-code').hidden = true;
}

function wireSource(src) {
  const gd = src === 'gdrive';
  const parse = gd ? parseDriveFolder : parseAlbumToken;
  const path = gd ? '/gdrive/album?folder=' : '/icloud/album?token=';
  const input = $(`#ps-${src}-link`);
  const status = $(`#ps-${src}-status`);
  const fail = (msg) => { valid[src] = ''; status.textContent = msg; status.className = 'hint ps-bad'; refreshCode(); };

  $(`#ps-${src}-check`).addEventListener('click', async () => {
    const id = parse(input.value);
    if (!id) { fail(`That doesn't look like a ${gd ? 'Drive folder' : 'album'} link.`); return; }
    status.textContent = 'Checking…';
    status.className = 'hint';
    try {
      const res = await fetch(`${WORKER_URL}${path}${encodeURIComponent(id)}`);
      if (res.status === 503) { fail('The server needs a Google Drive key (GDRIVE_KEY). Ask whoever runs it.'); return; }
      const digest = await res.json();
      if (!digest.photos?.length) throw new Error('empty');
      valid[src] = id;
      status.textContent = `✓ Found ${digest.photos.length} photo${digest.photos.length > 1 ? 's' : ''}.`;
      status.className = 'hint ps-ok';
      refreshCode();
    } catch {
      fail(gd
        ? "Couldn't open that folder. Make sure it's shared to Anyone with the link."
        : "Couldn't open that album. Check Public Website is on and the link is exact.");
    }
  });

  // Editing a validated link clears its OK state so a stale id can't be minted.
  input.addEventListener('input', () => {
    if (valid[src]) { valid[src] = ''; status.textContent = ''; status.className = 'hint'; refreshCode(); }
  });
}

async function getCode() {
  const btn = $('#ps-getcode');
  btn.disabled = true;
  btn.textContent = 'Getting code…';
  try {
    const encoded = await encodePhotosCode({ icloud: valid.icloud, gdrive: valid.gdrive });
    const res = await fetch(`${WORKER_URL}/code`, { method: 'POST', body: JSON.stringify({ cfg: encoded }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { code } = await res.json();
    const which = [valid.icloud && 'iCloud', valid.gdrive && 'Google Drive'].filter(Boolean).join(' + ');
    $('#ps-code-out').textContent = code;
    $('#ps-code-note').textContent = `Covers ${which}. On your board, open Settings → Photos, tap Enter code, and type this in. Press Save. The code expires in 1 hour.`;
    $('#ps-code').hidden = false;
    $('#ps-code').scrollIntoView({ block: 'end' });
  } catch (err) {
    $('#ps-code-out').textContent = '—';
    $('#ps-code-note').textContent = `Couldn't reach the code service (${err.message}). Try again in a moment.`;
    $('#ps-code').hidden = false;
  } finally {
    btn.textContent = 'Get board code';
    btn.disabled = !(valid.icloud || valid.gdrive);
  }
}

wireSource('icloud');
wireSource('gdrive');
$('#ps-getcode').addEventListener('click', getCode);
