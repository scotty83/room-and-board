import { escapeHtml } from '../util.js';

// Digits lead, matching every other keypad on the board (qwertyKeypad's order).
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

// A full case-capable on-screen keyboard (the board avoids the native OSK).
export function mountKeyboard(host, { onSubmit, onChange, initial = '' } = {}) {
  let value = initial;
  let shift = false;
  function paint() {
    const keys = ROWS.map(
      (row) => `<div class="osk__row">${row
        .map((k) => { const key = shift && /[a-z]/.test(k) ? k.toUpperCase() : k;
          return `<button type="button" class="key osk__key" data-k="${key}">${key}</button>`; })
        .join('')}</div>`,
    ).join('');
    host.innerHTML = `<div class="osk">
      <output class="osk__display" aria-live="polite">${escapeHtml(value) || '·'}</output>
      ${keys}
      <div class="osk__row">
        <button type="button" class="key osk__key osk__key--wide ${shift ? 'is-on' : ''}" data-act="shift">⇧ Shift</button>
        <button type="button" class="key osk__key" data-act="back">⌫</button>
        <button type="button" class="key osk__key" data-act="clear">Clear</button>
        <button type="button" class="key osk__key osk__key--primary osk__key--wide" data-act="submit">Check</button>
      </div>
    </div>`;
    host.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => { value += b.dataset.k; shift = false; onChange?.(value); paint(); }));
    host.querySelector('[data-act="shift"]').addEventListener('click', () => { shift = !shift; paint(); });
    host.querySelector('[data-act="back"]').addEventListener('click', () => { value = value.slice(0, -1); onChange?.(value); paint(); });
    host.querySelector('[data-act="clear"]').addEventListener('click', () => { value = ''; onChange?.(value); paint(); });
    host.querySelector('[data-act="submit"]').addEventListener('click', () => onSubmit?.(value));
  }
  paint();
  return { value: () => value, set: (v) => { value = v; paint(); } };
}
