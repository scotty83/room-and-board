// Word of the day from the bundled curated list — zero API dependency, and
// the same deterministic day index as the quote widget (shared dailyPick).

import { escapeHtml, dailyPick } from '../util.js';
import { cardSize, sizeTier } from '../capacity.js';

export const meta = { id: 'wotd', title: 'Word of the Day', refreshMs: 24 * 60 * 60 * 1000 };

export function render(el, vm, _cfg) {
  const [, h] = cardSize(el, [3, 3]);
  const showExample = sizeTier(h) !== 's' && vm.ex;
  el.innerHTML = `
    <div class="wotd">
      <div class="wotd__word">${escapeHtml(vm.w)}</div>
      <div class="wotd__meta">${escapeHtml(vm.pr)} · <i>${escapeHtml(vm.pos)}</i></div>
      <div class="wotd__def">${escapeHtml(vm.def)}</div>
      ${showExample ? `<div class="wotd__ex">“${escapeHtml(vm.ex)}”</div>` : ''}
    </div>`;
}

export async function fetchData(cfg, net) {
  const words = await net.fetchJSON('data/words.json');
  return dailyPick(words, new Date());
}
