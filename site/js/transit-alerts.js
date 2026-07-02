// Shared rendering for transit service-alert rows (subway, LIRR, NJT cards).

import { escapeHtml } from './util.js';

export function renderAlertRows(alerts) {
  if (!alerts?.length) return '';
  return alerts
    .slice(0, 2)
    .map(
      (a) => `<div class="talert">
        <span class="talert__icon" aria-hidden="true">⚠</span>
        ${a.routes?.length ? a.routes.slice(0, 4).map((r) => `<span class="bullet bullet--${escapeHtml(r)} bullet--sm">${escapeHtml(r)}</span>`).join('') : ''}
        <span class="talert__text">${escapeHtml(a.header)}</span>
      </div>`,
    )
    .join('');
}
