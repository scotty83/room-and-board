// PATH departure board from the Worker's RidePATH digest. PATH has no line
// letters — line identity is the official line color, shown as 1-2 dots
// (two colors = a train serving a joint line, e.g. HOB-33 via JSQ). The
// direction filter 'both' renders two labeled sections.

import { escapeHtml, fmtTime, setCardNote } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize, sizeTier } from '../capacity.js';

export const meta = { id: 'path', title: 'PATH', refreshMs: 60 * 1000 };

// ridepath.json consideredStation codes, NY -> NJ order for the settings list.
export const PATH_STATIONS = {
  '33S': '33rd Street',
  '23S': '23rd Street',
  '14S': '14th Street',
  '09S': '9th Street',
  CHR: 'Christopher St',
  WTC: 'World Trade Center',
  HOB: 'Hoboken',
  NEW: 'Newport',
  EXP: 'Exchange Place',
  GRV: 'Grove St',
  JSQ: 'Journal Square',
  HAR: 'Harrison',
  NWK: 'Newark',
};

export const PATH_DIRS = [
  ['both', 'Both directions'],
  ['ToNY', 'To New York'],
  ['ToNJ', 'To New Jersey'],
];

const DIR_LABELS = { ToNY: 'To New York', ToNJ: 'To New Jersey' };

export function mapPath(digest, cfgPath, nowSec) {
  const st = digest?.stations?.[cfgPath.station] ?? {};
  const dirs = cfgPath.dir === 'both' ? ['ToNY', 'ToNJ'] : [cfgPath.dir];
  const sections = dirs.map((dir) => ({
    dir,
    label: DIR_LABELS[dir],
    rows: (st[dir] ?? [])
      .filter((m) => m.t > nowSec)
      .map((m) => ({
        min: Math.max(1, Math.round((m.t - nowSec) / 60)),
        t: m.t,
        dest: m.headSign,
        colors: (m.lineColors ?? []).filter((c) => /^[0-9A-Fa-f]{6}$/.test(c)),
      }))
      .slice(0, 12),
  }));
  return { station: cfgPath.station, sections };
}

export function render(el, vm, _cfg) {
  setCardNote(el, PATH_STATIONS[vm.station] ?? null);
  const [w, h] = cardSize(el, [4, 4]);
  const sections = vm.sections ?? [];
  const both = sections.length > 1;
  const shallow = sizeTier(h) === 's';
  const row = (r, dirShort) => `<div class="train train--path">
      <div class="train__min"><span>${r.min}</span><small>min</small></div>
      <div class="train__info">
        <span class="train__dest">${r.colors
          .map((c) => `<i class="pathdot" style="background:#${c}"></i>`)
          .join('')}${escapeHtml(r.dest)}</span>
        <span class="train__line">${dirShort ? `${dirShort} · ` : ''}${fmtTime(r.t)}</span>
      </div>
    </div>`;
  // Shallow cards can't afford section headers: flatten both directions into
  // one time-sorted list with the direction inline on each row instead.
  if (both && shallow) {
    const cap = Math.max(1, itemCapacity('path', w, h) ?? 2);
    const flat = sections
      .flatMap((s) => s.rows.map((r) => ({ ...r, dirShort: s.dir === 'ToNY' ? 'To NY' : 'To NJ' })))
      .sort((a, b) => a.t - b.t)
      .slice(0, cap);
    el.innerHTML = flat.length
      ? flat.map((r) => row(r, r.dirShort)).join('')
      : '<div class="empty">No trains</div>';
    return;
  }
  // The two direction labels together cost roughly one train row.
  const cap = Math.max(both ? 2 : 1, (itemCapacity('path', w, h) ?? 4) - (both ? 1 : 0));
  const per = both ? Math.max(1, Math.floor(cap / 2)) : cap;
  el.innerHTML = sections
    .map((s) => `<div class="path-section">
      ${both ? `<div class="path-section__label">${escapeHtml(s.label)}</div>` : ''}
      ${s.rows.length ? s.rows.slice(0, per).map((r) => row(r)).join('') : '<div class="empty">No trains</div>'}
    </div>`)
    .join('');
}

export async function fetchData(cfg, net) {
  const digest = await net.fetchJSON(`${WORKER_URL}/path/realtime`);
  const vm = mapPath(digest, cfg.path, Math.floor(Date.now() / 1000));
  vm.stale = Boolean(digest.stale);
  vm.updatedAt = digest.updatedAt;
  return vm;
}
