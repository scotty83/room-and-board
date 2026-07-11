// Cloud Service Status: subway-board-style rows for the cloud services the office
// depends on, from their public status pages via the Worker's whitelisted
// /services/status proxy. Degraded rows are tappable — the existing
// full-screen text viewer shows the incident detail.

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { openTextViewer } from '../textviewer.js';

export const meta = { id: 'services', title: 'Cloud Service Status', refreshMs: 5 * 60 * 1000 };

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
  const [w, h] = cardSize(el, [3, 4]);
  const cap = itemCapacity('services', w, h) ?? 5;
  const all = vm.services ?? [];
  const shown = all.slice(0, cap);
  const hidden = all.length - shown.length;
  if (!shown.length) {
    el.innerHTML = '<div class="empty">Pick services in Settings → Cloud Service Status</div>';
    return;
  }
  el.innerHTML = shown
    .map(
      (s, i) => `<div class="svc ${s.state !== 'ok' ? 'svc--tap' : ''}" data-svc="${i}">
        <div class="svc__row">
          <span class="svc__name">${escapeHtml(s.label)}</span>
          <span class="svc__state svc__state--${escapeHtml(s.state)}">${STATE_LABEL[s.state] ?? escapeHtml(s.state)}</span>
        </div>
        ${s.state !== 'ok' && s.note ? `<div class="svc__note">${escapeHtml(s.note)}</div>` : ''}
      </div>`,
    )
    .join('') + (hidden > 0 ? `<div class="more-hint">+${hidden} more — enlarge the card</div>` : '');
  // Tap a degraded row for the full incident picture (existing text viewer;
  // 20s idle auto-dismiss keeps an abandoned board on the dashboard).
  el.querySelectorAll('.svc--tap').forEach((row) =>
    row.addEventListener('click', () => {
      const s = shown[Number(row.dataset.svc)];
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
