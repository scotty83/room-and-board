// NYC Subway line-status board: one row per selected line showing Good
// Service or the current alert (per Sean: no departure times, just alerts
// for the lines you pick). Data is the Worker's cached digest of the MTA
// alert feed — the raw feed runs ~800 KB, the digest ~2 KB.

import { escapeHtml, setMoreBadge } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';

export const meta = { id: 'subway', title: 'Subway Status', refreshMs: 2 * 60 * 1000 };

// Kept for the settings line chips.
export const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', 'SI'];

// A picked line can carry alerts under sibling feed route ids: shuttles are
// tagged GS/FS/H (never 'S'), and express variants 6X/7X/FX. Match any.
const LINE_ALIASES = {
  S: ['S', 'GS', 'FS', 'H'],
  6: ['6', '6X'],
  7: ['7', '7X'],
  F: ['F', 'FX'],
};

// digest alerts: [{routes, header}]. Returns one row per selected line.
export function mapSubwayStatus(alerts, lines) {
  return lines.map((line) => {
    const ids = LINE_ALIASES[line] ?? [line];
    const hits = (alerts ?? []).filter((a) => a.routes.some((r) => ids.includes(r)));
    return {
      line,
      ok: hits.length === 0,
      headers: hits.slice(0, 2).map((a) => a.header),
    };
  });
}

export function render(el, vm, _cfg) {
  if (!vm.lines?.length) {
    el.innerHTML = '<div class="empty" data-setup="subway">Pick your lines in Settings → Subway</div>';
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('subway', w, h);
  // When truncating, alerting lines take priority over Good Service rows.
  // The overflow count rides the title badge, so it costs no row.
  const rows = vm.lines.length > cap
    ? [...vm.lines].sort((a, b) => Number(a.ok) - Number(b.ok)).slice(0, cap)
    : vm.lines;
  const rowHtml = (row) => `<div class="linestatus ${row.ok ? '' : 'linestatus--alert'}">
        <span class="bullet bullet--${escapeHtml(row.line)}">${escapeHtml(row.line)}</span>
        <span class="linestatus__text">${
          row.ok ? 'Good Service' : escapeHtml(row.headers[0])
        }</span>
        ${row.ok ? '' : '<span class="linestatus__icon" aria-hidden="true">⚠</span>'}
      </div>`;
  const build = (n) => rows.slice(0, n).map(rowHtml).join('');
  // Stamp the elastic row-gap divisor with every rebuild so the gap math
  // tracks the rows actually shown as the trim loop moves n.
  const apply = (n) => {
    el.style.setProperty('--n', String(n));
    el.innerHTML = build(n);
  };
  let shown = rows.length;
  apply(shown);
  // Alert rows wrap taller than the capacity pitch budgets; when they push
  // past the body, shed rows to the corner badge (services-style trim) rather
  // than clipping — the capacity model and height caps assume this backstop.
  if (el.clientHeight > 0) {
    while (shown > 1 && el.scrollHeight > el.clientHeight) { shown -= 1; apply(shown); }
  }
  setMoreBadge(el, vm.lines.length - shown);
}

export async function fetchData(cfg, net) {
  const digest = await net.fetchJSON(`${WORKER_URL}/alerts/subway`);
  return {
    updatedAt: digest.updatedAt,
    stale: Boolean(digest.stale),
    lines: mapSubwayStatus(digest.alerts, cfg.subway.lines),
  };
}
