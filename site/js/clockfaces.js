// Full-screen clock faces for ambient mode — the clock | worldclocks |
// clockrow screensaver sources (designs A / C / D from the 2026-07-19 design
// review). Pure HTML builders (Node-testable) plus a minute-aligned engine;
// no seconds anywhere by design, so everything repaints once per minute.

import { escapeHtml } from './util.js';

export const CLOCK_SOURCES = new Set(['clock', 'worldclocks', 'clockrow']);

// Hour/minute (24h) and day-of-month in a zone; zone undefined = local.
function zoneParts(now, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone || undefined, hour12: false,
    hour: 'numeric', minute: 'numeric', day: 'numeric',
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), day: get('day') };
}

const fmtTime = (h, m, clock24) => {
  if (clock24) return `${h}:${String(m).padStart(2, '0')}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
};
const ampm = (h) => (h < 12 ? 'AM' : 'PM');
const isNight = (h) => h < 6 || h >= 18;

// Current UTC offset of a zone in minutes (DST-correct for `now`), for
// chronological west→east ordering of the world faces.
function zoneOffsetMin(now, zone) {
  const z = zoneParts(now, zone);
  const u = zoneParts(now, 'UTC');
  const dayShift = z.day === u.day ? 0 : (z.day - u.day === 1 || u.day - z.day > 20 ? 1 : -1);
  return dayShift * 1440 + (z.h * 60 + z.m) - (u.h * 60 + u.m);
}

const localZoneName = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// World-face city list: always includes local time (Sean's rule — people omit
// their own city from the widget list to avoid seeing it twice on the
// dashboard). If a listed city IS the local zone it becomes the home entry
// (keeping the user's label); otherwise a 'Local' entry joins. Sorted
// west→east by current offset, capped at MAX_DIALS (so a full 10-city list
// with no local city drops its easternmost to make room for Local).
const MAX_DIALS = 10;

function worldCities(cfg, now, localZone) {
  const list = cities(cfg).map((c) => ({ ...c }));
  const home = list.find((c) => c.zone === localZone);
  if (home) home.home = true;
  const all = home ? list : [{ label: 'Local', zone: localZone, home: true }, ...list];
  return all
    .map((c) => ({ ...c, off: zoneOffsetMin(now, c.zone) }))
    .sort((a, b) => a.off - b.off)
    .slice(0, MAX_DIALS);
}

// Split n items into balanced rows so a wrapped grid is symmetric: one row up
// to `solo`, otherwise two rows with the extra on TOP for odd counts
// (9 -> [5,4], 7 -> [4,3], 10 -> [5,5]).
function planRows(n, solo) {
  if (n <= solo) return [n];
  const top = Math.ceil(n / 2);
  return [top, n - top];
}

// Dial diameter + column gap keyed to the BUSIEST row, so rows stay a
// consistent size and up to five dials fit a 1920px row.
function gridScale(perRow) {
  if (perRow <= 3) return { dial: 330, gap: 104 };
  if (perRow <= 4) return { dial: 285, gap: 78 };
  return { dial: 245, gap: 60 };
}

// Analog dial from the 2026-07 signage handoff (options 2a/2b): opaque tapered
// hands (no overlap-layering), no second hand (minute-aligned, calm for
// signage). showMarkers=true is 2a (twelve dot markers); false is 2b
// (markerless). Night dials dim the hands/ring so a world grid reads daylight
// at a glance. 200-unit viewBox lifted verbatim from the prototype.
export function dialSvg(h, m, { night = false, showMarkers = true } = {}) {
  // Day: the handoff's exact hexes (2a #ececec / #242424 / #4c4c4c, 2b
  // #f2f2f2 / #2c2c2c). Night: a LIMITED dim — still a clear "it's night there"
  // cue, but the hands stay legible (the old #5c5c5c nearly vanished, especially
  // over a photo backdrop). The city name/time below dim separately in CSS and
  // are intentionally left alone.
  const hand = night ? '#8c8c8c' : showMarkers ? '#ececec' : '#f2f2f2';
  const ring = night ? '#262626' : showMarkers ? '#242424' : '#2c2c2c';
  const markerFill = night ? '#3c3c3c' : '#4c4c4c';
  const hourPts = showMarkers ? '96.4,108 103.6,108 101.8,52 98.2,52' : '95.5,106 104.5,106 102,48 98,48';
  const minPts = showMarkers ? '97.2,110 102.8,110 101.4,30 98.6,30' : '96.5,106 103.5,106 101.5,24 98.5,24';
  const hub = showMarkers ? 5 : 6;
  const ha = (h % 12) * 30 + m * 0.5;
  const ma = m * 6;
  let markers = '';
  if (showMarkers) {
    for (let i = 0; i < 12; i++) {
      markers += `<circle cx="100" cy="22" r="3.2" fill="${markerFill}" transform="rotate(${i * 30} 100 100)"/>`;
    }
  }
  return `<svg class="cf-dial__svg" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="90" fill="none" stroke="${ring}" stroke-width="1.5"/>
    ${markers}
    <polygon points="${hourPts}" fill="${hand}" transform="rotate(${ha} 100 100)"/>
    <polygon points="${minPts}" fill="${hand}" transform="rotate(${ma} 100 100)"/>
    <circle cx="100" cy="100" r="${hub}" fill="${hand}"/>
  </svg>`;
}

const dateLine = (now) =>
  now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

// Up to five cities from the World Clock config (its own defaults when the
// widget was never configured — the faces must not require it to be placed).
const cities = (cfg) => (cfg?.worldclock?.cities ?? []).slice(0, 10);

// '+1d' when the city's calendar day is ahead of local, '-1d' behind —
// month-wrap safe (local 31st vs city 1st is +1d, not -30d).
const dayDiff = (cityDay, localDay) => {
  const d = cityDay - localDay;
  return d === 1 || d < -20 ? '+1' : '-1';
};

const heroHtml = (now, cfg, sizeClass) => {
  const { h, m } = zoneParts(now);
  return `
    <div class="cf-time ${sizeClass}">
      <span>${fmtTime(h, m, cfg?.clock24)}</span>
      ${cfg?.clock24 ? '' : `<span class="cf-ampm">${ampm(h)}</span>`}
    </div>
    <div class="cf-date">${escapeHtml(dateLine(now))}</div>`;
};

export function clockFaceHtml(source, cfg, now = new Date(), localZone = localZoneName()) {
  if (source === 'worldclocks') {
    const local = zoneParts(now, localZone);
    const list = worldCities(cfg, now, localZone);
    const rows = planRows(list.length, 5);
    const { dial, gap } = gridScale(Math.max(...rows));
    const showMarkers = cfg?.screensaver?.markers !== false; // 2a dots by default; false = 2b markerless
    const dialCell = ({ label, zone, home }) => {
      const t = zoneParts(now, zone);
      const night = isNight(t.h);
      return `<div class="cf-dial ${night ? 'cf-dial--night' : ''}${home ? ' cf-dial--home' : ''}">
        ${dialSvg(t.h, t.m, { night, showMarkers })}
        <div class="cf-dial__name">${escapeHtml(label)}</div>
        <div class="cf-dial__time">${fmtTime(t.h, t.m, cfg?.clock24)}${cfg?.clock24 ? '' : ` ${ampm(t.h)}`}${t.day !== local.day ? `<span class="cf-dial__sub"> ${dayDiff(t.day, local.day)}d</span>` : ''}</div>
      </div>`;
    };
    let i = 0;
    const rowsHtml = rows.map((count) => {
      const cells = list.slice(i, i + count).map(dialCell).join('');
      i += count;
      return `<div class="cf-drow">${cells}</div>`;
    }).join('');
    return `<div class="cf cf--world"><div class="cf-dials" style="--dial:${dial}px;--dgap:${gap}px">${rowsHtml}</div></div>`;
  }
  if (source === 'clockrow') {
    const local = zoneParts(now, localZone);
    // The hero IS local time, so the row skips local-zone cities and runs
    // west→east like the dials.
    const list = cities(cfg)
      .filter((c) => c.zone !== localZone)
      .map((c) => ({ ...c, off: zoneOffsetMin(now, c.zone) }))
      .sort((a, b) => a.off - b.off)
      .slice(0, 9); // hero is local; up to 9 other cities
    const cityCell = ({ label, zone }) => {
      const t = zoneParts(now, zone);
      const night = isNight(t.h);
      return `<div class="cf-city ${night ? 'cf-city--night' : ''}">
        <div class="cf-city__name">${escapeHtml(label)}</div>
        <div class="cf-city__time">${fmtTime(t.h, t.m, cfg?.clock24)}${cfg?.clock24 ? '' : ` ${ampm(t.h)}`}</div>
        ${t.day !== local.day ? `<div class="cf-city__sub">${dayDiff(t.day, local.day)} day</div>` : ''}
      </div>`;
    };
    let j = 0;
    const rowsHtml = planRows(list.length, 5).map((count) => {
      const cells = list.slice(j, j + count).map(cityCell).join('');
      j += count;
      return `<div class="cf-crow">${cells}</div>`;
    }).join('');
    return `<div class="cf cf--row">${heroHtml(now, cfg, 'cf-time--row')}<div class="cf-cities">${rowsHtml}</div></div>`;
  }
  // 'clock' — the digital hero (also the universal fallback face).
  return `<div class="cf">${heroHtml(now, cfg, '')}</div>`;
}

// Paints now, then repaints on each minute boundary (aligned, +80ms of slack
// so the new minute has definitely arrived).
export function startClockFace(host, source, cfg) {
  let timer = 0;
  const paint = () => { host.innerHTML = clockFaceHtml(source, cfg, new Date()); };
  const arm = () => {
    timer = setTimeout(() => { paint(); arm(); }, 60000 - (Date.now() % 60000) + 80);
  };
  paint();
  arm();
  return {
    stop() {
      clearTimeout(timer);
      host.innerHTML = '';
    },
  };
}
