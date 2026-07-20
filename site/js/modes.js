// Display-mode resolution. Scheduled mode shows the dashboard during the
// configured windows (cfg.schedule, minutes since local midnight) and art
// otherwise. DEFAULT_SCHEDULE is the old commute-window default (06:00-10:00,
// 15:00-20:00) so a board that picks Scheduled unedited behaves as Auto did.

export const DEFAULT_SCHEDULE = [
  { start: 360, end: 600 },   // 06:00–10:00
  { start: 900, end: 1200 },  // 15:00–20:00
];

// Step a minutes-since-midnight value by ±15 min, wrapping 0..1439.
export function stepTime(min, delta) {
  return (((min + delta * 15) % 1440) + 1440) % 1440;
}

// 480 -> "8:00 AM"; 0 or 1440 -> "12:00 AM"; 720 -> "12:00 PM".
export function fmtHM(min) {
  const t = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60), m = t % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Which source drives ambient/screensaver, from the dedicated cfg.screensaver
// picker. Slideshow sources degrade gracefully: a photo source whose album is
// gone falls back to art (if any ambient widget is placed), and art without
// any ambient widget falls back to the big clock — a screensaver can always
// render. Clock faces need no widgets or data, so they pass through as-is.
export function ambientSource(cfg) {
  const has = new Set(cfg.widgets ?? []);
  const want = cfg.screensaver?.source ?? 'art';
  if (want === 'off') return null;
  if (want === 'photos' && has.has('photos') && cfg.photos?.album) return 'photos';
  if (want === 'gdrivephotos' && has.has('gdrivephotos') && cfg.gdrivephotos?.album) return 'gdrivephotos';
  if (want === 'art' || want === 'photos' || want === 'gdrivephotos') {
    if (has.has('art') || has.has('photos') || has.has('gdrivephotos')) return 'art';
    return 'clock';
  }
  return want; // clock | worldclocks | clockrow
}

export function resolveMode(cfg, date) {
  if (cfg.mode === 'dashboard' || cfg.mode === 'ambient') return cfg.mode;
  // scheduled (and any unknown value, defensively): dashboard inside a window.
  const minutes = date.getHours() * 60 + date.getMinutes();
  const wins = Array.isArray(cfg.schedule) ? cfg.schedule : DEFAULT_SCHEDULE;
  return wins.some((w) => minutes >= w.start && minutes < w.end) ? 'dashboard' : 'ambient';
}
