// Quote of the day from the bundled curated list — zero API dependency.

import { escapeHtml, dailyPick } from '../util.js';

export const meta = { id: 'quote', title: 'Quote of the Day', refreshMs: 24 * 60 * 60 * 1000 };

export function render(el, vm, _cfg) {
  el.innerHTML = `
    <blockquote class="quote">
      <p class="quote__text">“${escapeHtml(vm.text)}”</p>
      <footer class="quote__author">— ${escapeHtml(vm.author)}</footer>
    </blockquote>`;
}

// The shared day index keeps quote and word-of-the-day on one calendar.
export const quoteOfDay = dailyPick;

export async function fetchData(cfg, net) {
  const quotes = await net.fetchJSON('data/quotes.json');
  return quoteOfDay(quotes, new Date());
}
