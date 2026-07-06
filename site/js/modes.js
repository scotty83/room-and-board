// Display-mode resolution. Auto mode: dashboard during commute windows
// (06:00-10:00 and 15:00-20:00 local — fixed v1 defaults), ambient otherwise.

const WINDOWS = [
  [6 * 60, 10 * 60],
  [15 * 60, 20 * 60],
];

// Which source drives ambient/screensaver: photos when explicitly chosen and
// configured, else art when either art or photos widget is enabled, else nothing.
export function ambientSource(cfg) {
  const has = new Set(cfg.widgets ?? []);
  if (has.has('photos') && cfg.photos?.screensaver && cfg.photos?.album) return 'photos';
  if (has.has('art') || has.has('photos')) return 'art';
  return null;
}

export function resolveMode(cfg, date) {
  if (cfg.mode === 'dashboard' || cfg.mode === 'ambient') return cfg.mode;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const inWindow = WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
  return inWindow ? 'dashboard' : 'ambient';
}
