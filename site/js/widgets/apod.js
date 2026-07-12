// NASA Astronomy Picture of the Day — an image-forward card mirroring Art
// (reuses the .artwork card styles + the shared full-screen viewer). One image
// per day from the worker's /apod digest; tap opens the viewer with the
// title, credit, and explanation.

import { escapeHtml, setCardNote } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

export const meta = { id: 'apod', title: 'NASA Daily Photo', refreshMs: 30 * 60 * 1000 };

// "2026-07-11" -> "Jul 11" for the header note; blank on a bad/absent date.
function fmtDay(iso) {
  const t = Date.parse(`${iso}T00:00:00`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

export function render(el, vm, cfg) {
  const p = vm.photo;
  if (!p || !p.url) {
    el.innerHTML = '<div class="empty">NASA photo unavailable</div>';
    return;
  }
  setCardNote(el, fmtDay(p.date));
  const credit = p.credit ? `© ${p.credit}` : '';
  el.innerHTML = `
    <figure class="artwork" role="button" tabindex="0" aria-label="View photo full screen">
      <img class="artwork__img" src="${escapeHtml(p.url)}" alt="${escapeHtml(p.title)}" loading="lazy">
      <figcaption class="artwork__caption">
        <span class="artwork__title">${escapeHtml(p.title)}</span>
        ${credit ? `<span class="artwork__artist">${escapeHtml(credit)}</span>` : ''}
      </figcaption>
    </figure>`;
  el.querySelector('.artwork').addEventListener('click', () =>
    openImageViewer({ img: p.url, title: p.title, artist: credit, desc: p.explanation }, cfg, { list: [] }));
}

export async function fetchData(_cfg, net) {
  return net.fetchJSON(`${WORKER_URL}/apod`);
}
