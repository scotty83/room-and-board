// Full-screen reader for truncated text: tap any clamped/ellipsized message on
// a card to see the whole thing at glance-legible size (mirrors the art
// card's tap-to-view). Tap anywhere to dismiss; a 20s idle timer dismisses
// too, so a tapped-and-abandoned board always returns to the dashboard.

import { escapeHtml } from './util.js';

// Every card text that CSS may clamp or ellipsize.
const EXPANDABLE =
  '.linestatus__text, .talert__text, .headline__title, .quote__text, .history__text, .wc-row__city';

const defaultTruncated = (el) =>
  el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1;

const DISMISS_MS = 20 * 1000;
let timer = null;

export function openTextViewer(title, text) {
  let viewer = document.querySelector('#text-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'text-viewer';
    viewer.className = 'text-viewer';
    viewer.addEventListener('click', closeTextViewer);
    document.body.appendChild(viewer);
  }
  viewer.innerHTML = `
    <div class="text-viewer__panel">
      ${title ? `<h2 class="text-viewer__title">${escapeHtml(title)}</h2>` : ''}
      <p class="text-viewer__body">${escapeHtml(text)}</p>
      <p class="text-viewer__hint">Tap anywhere to close</p>
    </div>`;
  viewer.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(closeTextViewer, DISMISS_MS);
}

export function closeTextViewer() {
  const viewer = document.querySelector('#text-viewer');
  if (viewer) viewer.hidden = true;
  clearTimeout(timer);
  timer = null;
}

// Delegated: one listener on the grid covers every card, surviving re-renders.
// Only fires when the text is actually overflowing its box.
export function initTextViewer(host, { truncated = defaultTruncated } = {}) {
  host.addEventListener('click', (e) => {
    const el = e.target.closest?.(EXPANDABLE);
    if (!el || !truncated(el)) return;
    // First text node only: card titles may carry extra spans (e.g. "as of").
    const title = el.closest('.card')?.querySelector('.card__title')?.childNodes[0]?.textContent?.trim() ?? '';
    openTextViewer(title, el.textContent.trim());
  });
}
