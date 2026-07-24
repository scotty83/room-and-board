// Full-screen reader for truncated text: tap any clamped/ellipsized message on
// a card to see the whole thing at glance-legible size (mirrors the art card's
// tap-to-view). News headlines get a richer view: the summary plus a QR to the
// full article, so a viewer reads it on their phone (the board is a shared
// kiosk and the finance sources are paywalled — we never navigate it away).
// Tap anywhere to dismiss; a 20s idle timer returns an abandoned board home.

import { escapeHtml } from './util.js';

// Every card text that CSS may clamp or ellipsize. Headlines are handled
// separately (rich story view), but stay here as the fallback for a link-less,
// summary-less item so an overflowing title still expands.
const EXPANDABLE =
  '.linestatus__text, .talert__text, .headline__title, .quote__text, .history__text, .wc-row__city';

const defaultTruncated = (el) =>
  el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1;

const DISMISS_MS = 20 * 1000;
let timer = null;

// Shared overlay element: created once, wired to close on any tap.
function viewerEl() {
  let viewer = document.querySelector('#text-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'text-viewer';
    viewer.className = 'text-viewer';
    viewer.addEventListener('click', closeTextViewer);
    document.body.appendChild(viewer);
  }
  return viewer;
}

function show(viewer, html) {
  viewer.innerHTML = html;
  viewer.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(closeTextViewer, DISMISS_MS);
}

export function openTextViewer(title, text) {
  show(viewerEl(), `
    <div class="text-viewer__panel">
      ${title ? `<h2 class="text-viewer__title">${escapeHtml(title)}</h2>` : ''}
      <p class="text-viewer__body">${escapeHtml(text)}</p>
      <p class="text-viewer__hint">Tap anywhere to close</p>
    </div>`);
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// The headline's summary at reading size, plus a QR to the full article. The
// QR renders async (the generator is a lazy chunk); the destination host is
// shown regardless, so a failed/slow load still tells you where it goes.
export function openStoryViewer({ title, source, age, desc, link }) {
  const viewer = viewerEl();
  show(viewer, `
    <div class="text-viewer__panel story">
      <div class="story__meta">
        <span class="story__src">${escapeHtml(source)}</span>
        ${age ? `<span class="story__age">${escapeHtml(age)}</span>` : ''}
      </div>
      <h2 class="story__title">${escapeHtml(title)}</h2>
      ${desc ? `<p class="story__desc">${escapeHtml(desc)}</p>` : ''}
      ${link ? `<div class="story__more">
        <div class="story__qr"></div>
        <div class="story__more-text">
          <span class="story__more-label">Read the full story</span>
          <span class="story__more-host">${escapeHtml(hostOf(link))}</span>
          <span class="story__more-hint">Scan with your phone</span>
        </div>
      </div>` : ''}
      <p class="text-viewer__hint">Tap anywhere to close</p>
    </div>`);
  if (link) renderQr(viewer.querySelector('.story__qr'), link);
}

function renderQr(container, url) {
  if (!container) return;
  import('./vendor/qrcode.js')
    .then(({ default: qrcode }) => {
      if (viewerEl().hidden) return; // closed before the chunk loaded
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 3 });
    })
    .catch(() => { /* the host text still names the destination */ });
}

export function closeTextViewer() {
  const viewer = document.querySelector('#text-viewer');
  if (viewer) viewer.hidden = true;
  clearTimeout(timer);
  timer = null;
}

// Delegated: one listener on the grid covers every card, surviving re-renders.
export function initTextViewer(host, { truncated = defaultTruncated } = {}) {
  host.addEventListener('click', (e) => {
    // A news headline opens the rich story view (summary + QR) whether or not
    // its title is truncated — the value is the story behind it, not just the
    // full headline.
    const headline = e.target.closest?.('.headline');
    if (headline && (headline.dataset.link || headline.dataset.desc)) {
      openStoryViewer({
        title: headline.querySelector('.headline__title')?.textContent.trim() ?? '',
        source: headline.querySelector('.headline__src')?.textContent.trim() ?? '',
        age: headline.querySelector('.headline__age')?.textContent.trim() ?? '',
        desc: headline.dataset.desc ?? '',
        link: headline.dataset.link ?? '',
      });
      return;
    }
    // Everything else: expand only when the text is actually overflowing.
    const el = e.target.closest?.(EXPANDABLE);
    if (!el || !truncated(el)) return;
    // First text node only: card titles may carry extra spans (e.g. "as of").
    const title = el.closest('.card')?.querySelector('.card__title')?.childNodes[0]?.textContent?.trim() ?? '';
    openTextViewer(title, el.textContent.trim());
  });
}
