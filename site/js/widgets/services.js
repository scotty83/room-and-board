// Cloud Services: subway-board-style rows for the cloud services the office
// depends on, from their public status pages via the Worker's whitelisted
// /services/status proxy. Degraded rows are tappable — the existing
// full-screen text viewer shows the incident detail.

import { escapeHtml, fmtTime, setCardNote } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { openTextViewer } from '../textviewer.js';

export const meta = { id: 'services', title: 'Cloud Services', refreshMs: 5 * 60 * 1000 };

// [id, label] pairs for the settings pickers; ids mirror the Worker registry.
export const SERVICE_CHOICES = [
  ['webex', 'Webex'],
  ['zoom', 'Zoom'],
  ['slack', 'Slack'],
  ['ubiquiti', 'Ubiquiti'],
  ['cloudflare', 'Cloudflare'],
  ['github', 'GitHub'],
  ['m365', 'Microsoft 365'],
  ['gworkspace', 'Google Workspace'],
  ['aws', 'AWS'],
];
export const DEFAULT_SERVICES = SERVICE_CHOICES.map(([id]) => id);

const STATE_LABEL = { ok: 'Operational', minor: 'Minor issue', major: 'Major outage', unknown: 'Unknown' };

const sinceLabel = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? ` — since ${new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : '';
};

export function render(el, vm, _cfg) {
  // Freshness note in the card header (worker check time, not render time).
  if (vm.updatedAt) setCardNote(el, `as of ${fmtTime(vm.updatedAt)}`);
  const all = vm.services ?? [];
  if (!all.length) {
    el.innerHTML = '<div class="empty">Pick services in Settings → Cloud Services</div>';
    return;
  }
  const rowHtml = (s, i, dropNote) => `<div class="svc ${s.state !== 'ok' ? 'svc--tap' : ''}" data-svc="${i}">
        <div class="svc__row">
          <span class="svc__name">${escapeHtml(s.label)}</span>
          <span class="svc__state svc__state--${escapeHtml(s.state)}">${STATE_LABEL[s.state] ?? escapeHtml(s.state)}</span>
        </div>
        ${!dropNote && s.state !== 'ok' && s.note ? `<div class="svc__note">${escapeHtml(s.note)}</div>` : ''}
      </div>`;
  // Markup for the first n rows + a "+N more" hint when some are hidden (the
  // hint costs a row, so it's measured too). dropLastNote drops the final
  // row's incident note to spend leftover slack (the note is one line taller).
  const build = (n, dropLastNote = false) => {
    const hidden = all.length - n;
    return all.slice(0, n).map((s, i) => rowHtml(s, i, dropLastNote && i === n - 1)).join('')
      + (hidden > 0 ? `<div class="more-hint">+${hidden} more — enlarge the card</div>` : '');
  };
  // Static estimate from the capacity model — the final answer when there's no
  // rendered box to measure (happy-dom tests). Reserves a hint row on overflow.
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('services', w, h) ?? 5;
  let n = all.length > cap ? Math.max(1, cap - 1) : all.length;
  el.innerHTML = build(n);
  // Fill-to-fit: the static estimate reserves worst-case (two-line degraded)
  // height per row, but most rows are one-line "Operational", so the card
  // usually has room for more. Grow/shrink to what actually fits.
  if (el.clientHeight > 0) {
    while (n > 1 && el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); }
    while (n < all.length) {
      n += 1;
      el.innerHTML = build(n);
      if (el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); break; }
    }
    // Rows fit whole, so a degraded row's note-line of slack can sit empty.
    // Spend it: show one more service without its note (tap still reveals it).
    if (n < all.length) {
      n += 1;
      el.innerHTML = build(n, true);
      if (el.scrollHeight > el.clientHeight) { n -= 1; el.innerHTML = build(n); }
    }
  }
  // Tap a degraded row for the full incident picture (existing text viewer;
  // 20s idle auto-dismiss keeps an abandoned board on the dashboard). Attached
  // once on the settled DOM; data-svc indexes into the full services array.
  el.querySelectorAll('.svc--tap').forEach((row) =>
    row.addEventListener('click', () => {
      const s = all[Number(row.dataset.svc)];
      const items = s.incidents?.length ? s.incidents : [{ title: s.note, since: '', update: '' }];
      const body = items
        .map((i) => `${i.title}${sinceLabel(i.since)}${i.update ? `\n${i.update}` : ''}`)
        .join('\n\n');
      openTextViewer(`${s.label} — ${STATE_LABEL[s.state] ?? s.state}`, body);
    }),
  );
}

export async function fetchData(cfg, net) {
  const ids = cfg.services?.list?.length ? cfg.services.list : DEFAULT_SERVICES;
  return net.fetchJSON(`${WORKER_URL}/services/status?ids=${ids.join(',')}`);
}
