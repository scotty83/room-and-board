// Edit mode: arrange, resize, remove and re-add widgets on the 12×8 grid.
// Geometry decisions live in layout.js (placeWithPush displaces neighbors to
// make room); this module renders the overlay and translates pointer
// gestures. During a gesture a cell-snapped placeholder previews the target
// (green = will commit, red = unsolvable) and neighbor blocks preview their
// pushed positions live. The drag ghost moves via transform only.

import { GRID, MIN_SIZE, firstFit, placeWithPush } from './layout.js';
import { capacityLabel } from './capacity.js';
import { WIDGET_IDS } from './config.js';

const TITLES = {
  weather: 'Weather',
  subway: 'Subway',
  lirr: 'LIRR',
  mnr: 'Metro-North',
  njt: 'NJ Transit',
  path: 'PATH',
  ferry: 'NYC Ferry',
  bus: 'MTA Bus',
  markets: 'Markets',
  art: 'Art',
  photos: 'Photos',
  history: 'History',
  aqi: 'Air & Sky',
  quote: 'Quote',
  wotd: 'Word',
  worldclock: 'World Clock',
  sports: 'My Teams',
  worldcup: 'World Cup',
  news: 'Headlines',
  substack: 'Substack',
  bsky: 'Bluesky',
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

  const rectOf = (id) => layout.find((r) => r.id === id);
  const capOf = (id, w, h) => capacityLabel(id, w, h, cfg) ?? '';
  const sizeLabel = (r) => {
    const [mw, mh] = MIN_SIZE[r.id] ?? [1, 1];
    return `${r.w}×${r.h} · min ${mw}×${mh}`;
  };

  /* ----- grid operations ----- */

  function commit(next) {
    if (!next) return false;
    layout = next;
    render();
    return true;
  }

  const move = (id, x, y) => {
    const start = rectOf(id);
    return commit(placeWithPush(layout, { ...start, x, y }, { dx: x - start.x, dy: y - start.y }));
  };
  const resize = (id, w, h) => {
    const start = rectOf(id);
    return commit(placeWithPush(layout, { ...start, w, h }, { dx: w - start.w, dy: h - start.h }));
  };

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

  function positionEl(el, r) {
    el.style.gridColumn = `${r.x + 1} / span ${r.w}`;
    el.style.gridRow = `${r.y + 1} / span ${r.h}`;
  }

  function render() {
    blocksHost.innerHTML = layout
      .map(
        (r) => `<div class="edit-block" data-id="${r.id}"
          style="grid-column:${r.x + 1} / span ${r.w}; grid-row:${r.y + 1} / span ${r.h}">
          <span class="edit-block__title">${TITLES[r.id] ?? r.id}</span>
          <span class="edit-block__size">${sizeLabel(r)}${capOf(r.id, r.w, r.h) ? `<br>${capOf(r.id, r.w, r.h)}` : ''}</span>
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
          const [mw, mh] = MIN_SIZE[id];
          return `<button class="edit-tray__chip" data-add="${id}" ${fits ? '' : 'disabled'}>
            + ${TITLES[id]} <small>${mw}×${mh}</small>${fits ? '' : ' (no room)'}</button>`;
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

  /* ----- live gesture preview ----- */

  function placeholder() {
    let ph = blocksHost.querySelector('.edit-placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'edit-placeholder';
      blocksHost.prepend(ph);
    }
    return ph;
  }

  function showPlaceholder(ph, r, valid) {
    positionEl(ph, {
      x: Math.min(Math.max(r.x, 0), GRID.cols - 1),
      y: Math.min(Math.max(r.y, 0), GRID.rows - 1),
      w: Math.min(r.w, GRID.cols),
      h: Math.min(r.h, GRID.rows),
    });
    ph.classList.toggle('edit-placeholder--invalid', !valid);
    ph.hidden = false;
  }

  function previewPositions(preview, dragId) {
    for (const el of blocksHost.querySelectorAll('.edit-block')) {
      if (el.dataset.id === dragId) continue;
      const r = preview.find((p) => p.id === el.dataset.id);
      if (r) positionEl(el, r);
    }
  }

  function gesture(block, start, computeTarget) {
    const id = block.dataset.id;
    const startLayout = layout.map((r) => ({ ...r }));
    const ph = placeholder();
    let lastValid = null;
    let lastKey = '';

    const update = (e) => {
      const target = computeTarget(e);
      const key = `${target.x},${target.y},${target.w},${target.h}`;
      if (key === lastKey) return;
      lastKey = key;
      const dir = { dx: target.x - start.x + (target.w - start.w), dy: target.y - start.y + (target.h - start.h) };
      const preview = placeWithPush(startLayout, target, dir);
      if (preview) {
        lastValid = preview;
        previewPositions(preview, id);
        showPlaceholder(ph, target, true);
      } else {
        showPlaceholder(ph, target, false);
      }
      const cap = capOf(id, target.w, target.h);
      block.querySelector('.edit-block__size').innerHTML =
        sizeLabel(target) + (cap ? `<br>${cap}` : '');
    };

    const finish = () => {
      ph.hidden = true;
      block.classList.remove('is-dragging', 'is-resizing');
      block.style.transform = '';
      if (lastValid) {
        layout = lastValid;
      }
      render(); // restores positions when nothing valid was previewed
    };
    return { update, finish };
  }

  function bindDrag(block) {
    block.addEventListener('pointerdown', (down) => {
      if (down.target.closest('[data-remove],[data-resize]')) return;
      const start = rectOf(block.dataset.id);
      const origin = { x: down.clientX, y: down.clientY };
      block.classList.add('is-dragging');
      block.setPointerCapture?.(down.pointerId);
      const g = gesture(block, start, (e) => {
        const { w: cw, h: ch } = cell();
        return {
          ...start,
          x: start.x + Math.round((e.clientX - origin.x) / cw),
          y: start.y + Math.round((e.clientY - origin.y) / ch),
        };
      });
      const onMove = (e) => {
        block.style.transform = `translate(${e.clientX - origin.x}px, ${e.clientY - origin.y}px)`;
        g.update(e);
      };
      const onUp = (e) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        g.update(e);
        g.finish();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  function bindResize(handle) {
    handle.addEventListener('pointerdown', (down) => {
      down.stopPropagation();
      const block = handle.closest('.edit-block');
      const start = rectOf(block.dataset.id);
      const origin = { x: down.clientX, y: down.clientY };
      block.classList.add('is-resizing');
      const g = gesture(block, start, (e) => {
        const { w: cw, h: ch } = cell();
        return {
          ...start,
          w: start.w + Math.round((e.clientX - origin.x) / cw),
          h: start.h + Math.round((e.clientY - origin.y) / ch),
        };
      });
      const onMove = (e) => g.update(e);
      const onUp = (e) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        g.update(e);
        g.finish();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
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
