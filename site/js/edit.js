// Edit mode: arrange, resize, remove and re-add widgets on the 6×4 grid.
// All geometry decisions delegate to layout.js; this module only renders the
// overlay and translates pointer gestures into grid operations. The drag
// ghost moves via transform only (gen1 animation budget).

import { GRID, MIN_SIZE, canPlace, firstFit } from './layout.js';
import { WIDGET_IDS } from './config.js';

const TITLES = {
  weather: 'Weather',
  subway: 'Subway',
  lirr: 'LIRR',
  njt: 'NJ Transit',
  markets: 'Markets',
  art: 'Art',
  history: 'History',
  aqi: 'Air & Sky',
  quote: 'Quote',
  worldclock: 'World Clock',
};

export function openEditMode(cfg, { root, onDone, onCancel, cellSize } = {}) {
  root ??= document.querySelector('#edit-root');
  let layout = cfg.layout.map((r) => ({ ...r }));

  root.innerHTML = `
    <div class="editor">
      <div class="editor__stage">
        <div class="editor__cells">${'<div class="editor__cell"></div>'.repeat(GRID.cols * GRID.rows)}</div>
        <div class="editor__blocks"></div>
      </div>
      <div class="editor__bar">
        <div class="edit-tray"></div>
        <div class="editor__actions">
          <button class="btn btn--primary" data-done>Done</button>
          <button class="btn" data-cancel>Cancel</button>
        </div>
      </div>
    </div>`;

  const stage = root.querySelector('.editor__stage');
  const blocksHost = root.querySelector('.editor__blocks');
  const tray = root.querySelector('.edit-tray');

  const cell = () => {
    if (cellSize) return cellSize;
    const rect = stage.getBoundingClientRect();
    return { w: rect.width / GRID.cols, h: rect.height / GRID.rows };
  };

  /* ----- grid operations (pure state transitions) ----- */

  const rectOf = (id) => layout.find((r) => r.id === id);

  function move(id, x, y) {
    const rect = { ...rectOf(id), x, y };
    if (!canPlace(layout, rect)) return false;
    layout = layout.map((r) => (r.id === id ? rect : r));
    render();
    return true;
  }

  function resize(id, w, h) {
    const rect = { ...rectOf(id), w, h };
    if (!canPlace(layout, rect)) return false;
    layout = layout.map((r) => (r.id === id ? rect : r));
    render();
    return true;
  }

  function remove(id) {
    layout = layout.filter((r) => r.id !== id);
    render();
  }

  function add(id) {
    const rect = firstFit(layout, id, MIN_SIZE[id]);
    if (!rect) return false;
    layout = [...layout, rect];
    render();
    return true;
  }

  /* ----- rendering ----- */

  function render() {
    blocksHost.innerHTML = layout
      .map(
        (r) => `<div class="edit-block" data-id="${r.id}"
          style="grid-column:${r.x + 1} / span ${r.w}; grid-row:${r.y + 1} / span ${r.h}">
          <span class="edit-block__title">${TITLES[r.id] ?? r.id}</span>
          <button class="edit-remove" data-remove="${r.id}" aria-label="Remove ${TITLES[r.id]}">✕</button>
          <span class="edit-handle" data-resize="${r.id}" aria-label="Resize ${TITLES[r.id]}"></span>
        </div>`,
      )
      .join('');
    tray.innerHTML =
      '<span class="edit-tray__label">Add:</span>' +
      WIDGET_IDS.filter((id) => !rectOf(id))
        .map((id) => {
          const fits = firstFit(layout, id, MIN_SIZE[id]) !== null;
          return `<button class="edit-tray__chip" data-add="${id}" ${fits ? '' : 'disabled'}>
            + ${TITLES[id]}${fits ? '' : ' (no room)'}</button>`;
        })
        .join('');

    blocksHost.querySelectorAll('[data-remove]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(btn.dataset.remove);
      }),
    );
    tray.querySelectorAll('[data-add]').forEach((btn) =>
      btn.addEventListener('click', () => add(btn.dataset.add)),
    );
    blocksHost.querySelectorAll('.edit-block').forEach(bindDrag);
    blocksHost.querySelectorAll('[data-resize]').forEach(bindResize);
  }

  /* ----- pointer gestures ----- */

  function bindDrag(block) {
    block.addEventListener('pointerdown', (down) => {
      if (down.target.closest('[data-remove],[data-resize]')) return;
      const id = block.dataset.id;
      const start = rectOf(id);
      const origin = { x: down.clientX, y: down.clientY };
      block.classList.add('is-dragging');
      block.setPointerCapture?.(down.pointerId);

      const onMove = (e) => {
        block.style.transform = `translate(${e.clientX - origin.x}px, ${e.clientY - origin.y}px)`;
      };
      const onUp = (e) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        block.classList.remove('is-dragging');
        block.style.transform = '';
        const { w: cw, h: ch } = cell();
        const dx = Math.round((e.clientX - origin.x) / cw);
        const dy = Math.round((e.clientY - origin.y) / ch);
        if ((dx || dy) && !move(id, start.x + dx, start.y + dy)) flashInvalid(block);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  function bindResize(handle) {
    handle.addEventListener('pointerdown', (down) => {
      down.stopPropagation();
      const id = handle.dataset.resize;
      const start = rectOf(id);
      const origin = { x: down.clientX, y: down.clientY };
      const block = handle.closest('.edit-block');
      block.classList.add('is-resizing');

      const onUp = (e) => {
        window.removeEventListener('pointerup', onUp);
        block.classList.remove('is-resizing');
        const { w: cw, h: ch } = cell();
        const dw = Math.round((e.clientX - origin.x) / cw);
        const dh = Math.round((e.clientY - origin.y) / ch);
        if ((dw || dh) && !resize(id, start.w + dw, start.h + dh)) flashInvalid(block);
      };
      window.addEventListener('pointerup', onUp);
    });
  }

  function flashInvalid(block) {
    block.classList.add('is-invalid');
    setTimeout(() => block.classList.remove('is-invalid'), 400);
  }

  /* ----- lifecycle ----- */

  function destroy() {
    root.innerHTML = '';
  }

  root.querySelector('[data-done]').addEventListener('click', () => {
    const result = layout;
    destroy();
    onDone?.(result);
  });
  root.querySelector('[data-cancel]').addEventListener('click', () => {
    destroy();
    onCancel?.();
  });

  render();

  return {
    layout: () => layout.map((r) => ({ ...r })),
    destroy,
    _test: { move, resize, remove, add },
  };
}
