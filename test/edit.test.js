/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openEditMode } from '../site/js/edit.js';

const CFG = {
  layout: [
    { id: 'weather', x: 0, y: 0, w: 3, h: 2 },
    { id: 'aqi', x: 3, y: 0, w: 1, h: 1 },
  ],
};

let root;
beforeEach(() => {
  document.body.innerHTML = '<div id="edit-root"></div>';
  root = document.querySelector('#edit-root');
});

describe('openEditMode', () => {
  it('renders placed widgets, tray for the rest, and applies moves', () => {
    const editor = openEditMode(CFG, { root, cellSize: { w: 100, h: 100 } });
    expect(root.querySelectorAll('.edit-block')).toHaveLength(2);
    const trayIds = [...root.querySelectorAll('.edit-tray [data-add]')].map((b) => b.dataset.add);
    expect(trayIds).toContain('subway');
    expect(trayIds).not.toContain('weather');

    expect(editor._test.move('aqi', 5, 3)).toBe(true);
    expect(editor.layout().find((r) => r.id === 'aqi')).toMatchObject({ x: 5, y: 3 });
    // invalid: overlaps weather
    expect(editor._test.move('aqi', 1, 1)).toBe(false);
    expect(editor.layout().find((r) => r.id === 'aqi')).toMatchObject({ x: 5, y: 3 });
  });

  it('rejects resizes below the minimum and applies valid ones', () => {
    const editor = openEditMode(CFG, { root, cellSize: { w: 100, h: 100 } });
    expect(editor._test.resize('weather', 1, 1)).toBe(false); // min 2x2
    expect(editor._test.resize('weather', 4, 2)).toBe(false); // would overlap aqi at (3,0)
    expect(editor._test.resize('weather', 3, 3)).toBe(true);
    expect(editor.layout().find((r) => r.id === 'weather')).toMatchObject({ w: 3, h: 3 });
  });

  it('supports remove and tray re-add round-trip', () => {
    const editor = openEditMode(CFG, { root, cellSize: { w: 100, h: 100 } });
    editor._test.remove('aqi');
    expect(editor.layout().map((r) => r.id)).toEqual(['weather']);
    expect(root.querySelector('.edit-tray [data-add="aqi"]')).not.toBeNull();
    editor._test.add('aqi');
    expect(editor.layout().map((r) => r.id)).toContain('aqi');
  });

  it('commits via Done and discards via Cancel', () => {
    const onDone = vi.fn();
    const editor = openEditMode(CFG, { root, cellSize: { w: 100, h: 100 }, onDone });
    editor._test.move('aqi', 5, 3);
    root.querySelector('[data-done]').click();
    expect(onDone).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'aqi', x: 5, y: 3 })]),
    );

    const onCancel = vi.fn();
    openEditMode(CFG, { root, cellSize: { w: 100, h: 100 }, onCancel });
    root.querySelector('[data-cancel]').click();
    expect(onCancel).toHaveBeenCalled();
    expect(root.innerHTML).toBe('');
  });

  it('moves a widget through a pointer drag sequence', () => {
    const editor = openEditMode(CFG, { root, cellSize: { w: 100, h: 100 } });
    const block = root.querySelector('.edit-block[data-id="aqi"]');
    const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, pointerId: 1 });
    block.dispatchEvent(new PointerEvent('pointerdown', opts(350, 50)));
    window.dispatchEvent(new PointerEvent('pointermove', opts(360, 260))); // +0 cols, +2 rows
    window.dispatchEvent(new PointerEvent('pointerup', opts(360, 260)));
    expect(editor.layout().find((r) => r.id === 'aqi')).toMatchObject({ x: 3, y: 2 });
  });
});
