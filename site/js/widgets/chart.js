// Statista Chart of the Day — an image-forward card mirroring the NASA Daily
// Photo (reuses the .artwork card styles + the shared full-screen viewer).
// One infographic per day from the worker's /chart digest; tap opens the
// viewer with the title, description, and Statista credit (their charts are
// CC BY-ND — attribution required, and the branding is baked into the image).

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

export const meta = { id: 'chart', title: 'Chart of the Day', refreshMs: 30 * 60 * 1000 };

export function render(el, vm, cfg) {
  const c = vm.chart;
  if (!c || !c.url) {
    el.innerHTML = '<div class="empty">Chart unavailable</div>';
    return;
  }
  // No card caption: the infographic embeds its own title and the Statista
  // branding — a caption would just repeat both (Sean flagged the duplicate).
  // The tap viewer still shows title/description/credit.
  el.innerHTML = `
    <figure class="artwork artwork--contain" role="button" tabindex="0" aria-label="View chart full screen">
      <img class="artwork__img" src="${escapeHtml(c.url)}" alt="${escapeHtml(c.title)}" loading="lazy">
    </figure>`;
  el.querySelector('.artwork').addEventListener('click', () =>
    openImageViewer({ img: c.url, title: c.title, artist: 'Statista', desc: c.desc }, cfg, { list: [] }));
}

export async function fetchData(_cfg, net) {
  return net.fetchJSON(`${WORKER_URL}/chart`);
}
