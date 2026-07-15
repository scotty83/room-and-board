// Statista Chart of the Day — an image-forward card mirroring the NASA Daily
// Photo (reuses the .artwork card styles + the shared full-screen viewer).
// One infographic per day from the worker's /chart digest; tap opens the
// viewer with the title, description, and Statista credit (their charts are
// CC BY-ND — attribution required, and the branding is baked into the image).

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { openImageViewer } from '../imageshow.js';

export const meta = { id: 'chart', title: 'Chart of the Day', refreshMs: 30 * 60 * 1000 };

// Built-in politics/Trump terms, gated by cfg.chart.excludePolitics. Matched
// against title+desc case-insensitively (see pickChart). Kept conservative so
// an on-topic economics chart isn't dropped for a passing mention.
const POLITICS_TERMS = [
  'trump', 'biden', 'election', 'congress', 'senate', 'republican', 'democrat',
  'gop', 'white house', 'campaign', 'poll', 'ballot', 'voter',
];

// From the newest-first charts[], pick the first whose title+desc mentions no
// politics terms (when the hide-politics filter is on); fall back to charts[0]
// if every card matches (a filtered-to-empty card is worse than one off-topic).
export function pickChart(charts, cfg) {
  const list = Array.isArray(charts) ? charts : [];
  if (!list.length) return null;
  const c = cfg?.chart ?? {};
  const terms = (c.excludePolitics === false ? [] : POLITICS_TERMS)
    .map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!terms.length) return list[0];
  const clean = list.find((ch) => {
    const hay = `${ch.title ?? ''} ${ch.desc ?? ''}`.toLowerCase();
    return !terms.some((t) => hay.includes(t));
  });
  return clean ?? list[0];
}

export function render(el, vm, cfg) {
  // Worker now returns charts[] (newest-first); pick the first non-excluded.
  // Legacy `chart` singular kept as a fallback for a stale cached payload.
  const c = pickChart(vm.charts, cfg) ?? vm.chart;
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

export async function fetchData(cfg, net) {
  // A configured topic re-points the scrape at the per-topic Statista page; the
  // worker validates the slug and caches it under `chart:<topic>` (the global
  // default stays one fleet-wide entry). Client-side filtering picks the card.
  const topic = cfg?.chart?.topic;
  const qs = topic ? `?topic=${encodeURIComponent(topic)}` : '';
  return net.fetchJSON(`${WORKER_URL}/chart${qs}`);
}
