export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function fmtTime(epochSec) {
  return new Date(epochSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Options for a wall-clock time-of-day render at the board's 12/24-hour
// preference (cfg.clock24). Single source so the topbar Clock, World Clock,
// and every "as of"/freshness stamp format identically.
export const clockTimeOpts = (clock24) => (clock24
  ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  : { hour: 'numeric', minute: '2-digit' });

// A "now"/"as of" reading (freshness stamps, card notes) honoring clock24 —
// distinct from fmtTime, which formats transit SCHEDULE times (always 12h).
export function fmtClock(epochSec, clock24 = false) {
  return new Date(epochSec * 1000).toLocaleTimeString('en-US', clockTimeOpts(clock24));
}

// Small right-aligned context note in a card's title ("as of 8:16 PM",
// "stops at Mineola"). Null/empty text removes it. Reuses .card__asof so the
// amber stale stamp keeps winning the corner (.card.is-stale hides the note).
export function setCardNote(el, text) {
  const title = el.closest?.('.card')?.querySelector('.card__title');
  if (!title) return;
  let note = title.querySelector('.card__asof');
  if (!text) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement('span');
    note.className = 'card__asof';
    title.appendChild(note);
  }
  note.textContent = text;
}

// Theme = a body class driving CSS token overrides ('dark' is the base :root
// palette — its class carries no rules). Boot applies the saved choice;
// the Display pane swaps it live for instant preview.
export function applyTheme(theme) {
  for (const c of [...document.body.classList]) {
    if (c.startsWith('theme-')) document.body.classList.remove(c);
  }
  document.body.classList.add(`theme-${theme}`);
}

// Quiet "+N" overflow badge pinned to the card's bottom-right corner — the
// point of truncation — plus a has-more class (CSS fades the body's bottom
// edge as a wordless "continues" cue). Replaces the old in-flow ".more-hint"
// row: the count no longer costs a list row, and the "enlarge the card"
// imperative lives only in edit mode (capacityLabel). The corner is safe at
// every card width (a title badge clips beside long titles on 2-wide cards);
// .card__stamp is top-anchored so nothing collides. hidden <= 0 removes it.
export function setMoreBadge(el, hidden) {
  const card = el.closest?.('.card');
  // querySelector may be absent on test fakes (capacity stubs) — no-op then.
  if (!card?.querySelector) return;
  let badge = card.querySelector('.card__more');
  if (!hidden || hidden <= 0) {
    badge?.remove();
    card.classList.remove('has-more');
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'card__more';
    card.appendChild(badge);
  }
  badge.textContent = `+${hidden}`;
  card.classList.add('has-more');
}

// Extract an iCloud shared-album token from a full URL, a #fragment, or a bare
// token. Case-sensitive (the token is), lenient about surrounding text.
export function parseAlbumToken(input) {
  let s = String(input ?? '').trim();
  if (s.includes('#')) s = s.slice(s.lastIndexOf('#') + 1); // token lives after the fragment
  s = s.replace(/[^A-Za-z0-9].*$/, ''); // drop a trailing slash or any junk
  return /^[A-Za-z0-9]{8,25}$/.test(s) ? s : null;
}

// Extract a Google Drive folder id from a shared link
// (drive.google.com/drive/folders/<id>, including /drive/u/N/folders/ variants
// and ?usp=sharing suffixes) or accept a bare id. null when unrecognizable.
export function parseDriveFolder(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/folders\/([-\w]{10,80})/);
  if (m) return m[1];
  return /^[-\w]{10,80}$/.test(s) ? s : null;
}

// Deterministic per-calendar-day pick, shared by the quote and word widgets.
export function dailyPick(list, date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000,
  );
  return list[(date.getFullYear() * 366 + dayOfYear) % list.length];
}
