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

// Dial diameter + column gap shrink as the grid grows so up to ten dials wrap
// into two clean rows (five per row) instead of overflowing 1920px.
function gridScale(n) {
  if (n <= 4) return { dial: 330, gap: 110 };
  if (n <= 6) return { dial: 280, gap: 80 };
  if (n <= 8) return { dial: 235, gap: 64 };
  return { dial: 200, gap: 52 };
}

// Minimal analog dial, no second hand. Night dials dim their ink and drop the
// face tint so daylight is readable across a world grid at a glance.
export function dialSvg(h, m, { night = false } = {}) {
  const ink = night ? 0.38 : 0.92;
  const ring = night ? 0.1 : 0.16;
  let dots = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const cardinal = i % 3 === 0;
    const r = cardinal ? 3.4 : 2.6;
    const op = cardinal ? (night ? 0.35 : 0.8) : (night ? 0.22 : 0.5);
    dots += `<circle cx="${(50 + 41 * Math.sin(a)).toFixed(2)}" cy="${(50 - 41 * Math.cos(a)).toFixed(2)}" r="${r}" fill="rgba(255,255,255,${op})"/>`;
  }
  const ha = (h % 12) * 30 + m * 0.5;
  const ma = m * 6;
  return `<svg class="cf-dial__svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,${ring})" stroke-width="1.1"/>
    ${night ? '' : '<circle cx="50" cy="50" r="46" fill="rgba(255,255,255,0.028)"/>'}${dots}
    <line x1="50" y1="50" x2="50" y2="27" stroke="rgba(255,255,255,${ink})" stroke-width="5.5" stroke-linecap="round" transform="rotate(${ha} 50 50)"/>
    <line x1="50" y1="50" x2="50" y2="16" stroke="rgba(255,255,255,${ink})" stroke-width="3.4" stroke-linecap="round" transform="rotate(${ma} 50 50)"/>
    <circle cx="50" cy="50" r="3.2" fill="rgba(255,255,255,${ink})"/>
    <circle cx="50" cy="50" r="1.4" fill="#000"/>
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
    const { dial, gap } = gridScale(list.length);
    const dials = list.map(({ label, zone, home }) => {
      const t = zoneParts(now, zone);
      const night = isNight(t.h);
      return `<div class="cf-dial ${night ? 'cf-dial--night' : ''}${home ? ' cf-dial--home' : ''}">
        ${dialSvg(t.h, t.m, { night })}
        <div class="cf-dial__name">${escapeHtml(label)}</div>
        <div class="cf-dial__time">${fmtTime(t.h, t.m, cfg?.clock24)}${cfg?.clock24 ? '' : ` ${ampm(t.h)}`}${t.day !== local.day ? `<span class="cf-dial__sub"> ${dayDiff(t.day, local.day)}d</span>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="cf cf--world"><div class="cf-dials" style="--dial:${dial}px;--dgap:${gap}px">${dials}</div></div>`;
  }
  if (source === 'clockrow') {
    const local = zoneParts(now, localZone);
    // The hero IS local time, so the row skips local-zone cities and runs
    // west→east like the dials.
    const row = cities(cfg)
      .filter((c) => c.zone !== localZone)
      .map((c) => ({ ...c, off: zoneOffsetMin(now, c.zone) }))
      .sort((a, b) => a.off - b.off)
      .slice(0, 9) // hero is local; up to 9 other cities, wrapping
      .map(({ label, zone }) => {
        const t = zoneParts(now, zone);
        const night = isNight(t.h);
        return `<div class="cf-city ${night ? 'cf-city--night' : ''}">
          <div class="cf-city__name">${escapeHtml(label)}</div>
          <div class="cf-city__time">${fmtTime(t.h, t.m, cfg?.clock24)}${cfg?.clock24 ? '' : ` ${ampm(t.h)}`}</div>
          ${t.day !== local.day ? `<div class="cf-city__sub">${dayDiff(t.day, local.day)} day</div>` : ''}
        </div>`;
      }).join('');
    return `<div class="cf cf--row">${heroHtml(now, cfg, 'cf-time--row')}<div class="cf-cities">${row}</div></div>`;
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
