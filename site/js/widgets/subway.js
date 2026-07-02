// NYC Subway line-status board: one row per selected line showing Good
// Service or the current alert (per Sean: no departure times, just alerts
// for the lines you pick). Data is the Worker's cached digest of the MTA
// alert feed — the raw feed runs ~800 KB, the digest ~2 KB.

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';

export const meta = { id: 'subway', title: 'Subway Status', refreshMs: 2 * 60 * 1000 };

// Kept for the settings line chips.
export const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', 'SI'];

// digest alerts: [{routes, header}]. Returns one row per selected line.
export function mapSubwayStatus(alerts, lines) {
  return lines.map((line) => {
    const hits = (alerts ?? []).filter((a) => a.routes.includes(line));
    return {
      line,
      ok: hits.length === 0,
      headers: hits.slice(0, 2).map((a) => a.header),
    };
  });
}

export function render(el, vm, _cfg) {
  if (!vm.lines?.length) {
    el.innerHTML = '<div class="empty">Pick your lines in Settings → Subway</div>';
    return;
  }
  el.innerHTML = vm.lines
    .map(
      (row) => `<div class="linestatus ${row.ok ? '' : 'linestatus--alert'}">
        <span class="bullet bullet--${escapeHtml(row.line)}">${escapeHtml(row.line)}</span>
        <span class="linestatus__text">${
          row.ok ? 'Good Service' : escapeHtml(row.headers[0])
        }</span>
        ${row.ok ? '' : '<span class="linestatus__icon" aria-hidden="true">⚠</span>'}
      </div>`,
    )
    .join('');
}

export async function fetchData(cfg, net) {
  const digest = await net.fetchJSON(`${WORKER_URL}/alerts/subway`);
  return { updatedAt: digest.updatedAt, lines: mapSubwayStatus(digest.alerts, cfg.subway.lines) };
}
