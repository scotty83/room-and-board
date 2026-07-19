// London TfL line status — a Subway-style board for the lines you pick, from
// the worker's /tfl/status digest. Colour dot + name + status; tap a disrupted
// line for the full reason.

import { escapeHtml, setMoreBadge, setupPrompt } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { openTextViewer } from '../textviewer.js';
import { TFL_LINES } from '../tfl-lines.js';

export const meta = { id: 'tfl', title: 'TfL Status', refreshMs: 2 * 60 * 1000 };
const LINE_META = new Map(TFL_LINES.map((l) => [l.id, l]));

export function render(el, vm, cfg) {
  const chosen = cfg.tfl?.lines ?? [];
  if (!chosen.length) {
    el.innerHTML = setupPrompt('tfl', 'pick lines', 'TfL Status');
    return;
  }
  const byId = new Map((vm.lines ?? []).map((l) => [l.id, l]));
  const rows = chosen.map((id) => {
    const m = LINE_META.get(id);
    const live = byId.get(id);
    return {
      name: m?.name ?? id, color: m?.color ?? '#888',
      ok: live ? live.ok : true, status: live ? live.status : '—', reason: live?.reason ?? '',
    };
  });
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('tfl', w, h) ?? 4;
  // Alerting lines take priority when truncating (Subway's rule).
  const ordered = rows.length > cap
    ? [...rows].sort((a, b) => Number(a.ok) - Number(b.ok)).slice(0, cap)
    : rows;
  const hidden = rows.length - ordered.length;
  el.style.setProperty('--n', String(ordered.length)); // elastic row-gap divisor
  el.innerHTML = ordered
    .map((r, i) => `<div class="tfl ${r.ok ? '' : 'tfl--alert'}${!r.ok && r.reason ? ' tfl--tap' : ''}" data-i="${i}">
        <span class="tfl__dot" style="background:${r.color}"></span>
        <span class="tfl__name">${escapeHtml(r.name)}</span>
        <span class="tfl__status">${escapeHtml(r.status)}</span>
      </div>`)
    .join('');
  setMoreBadge(el, hidden);
  el.querySelectorAll('.tfl--tap').forEach((row) =>
    row.addEventListener('click', () => {
      const r = ordered[Number(row.dataset.i)];
      openTextViewer(`${r.name} — ${r.status}`, r.reason);
    }),
  );
}

export async function fetchData(_cfg, net) {
  return net.fetchJSON(`${WORKER_URL}/tfl/status`);
}
