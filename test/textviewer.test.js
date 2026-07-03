/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { initTextViewer, openTextViewer } from '../site/js/textviewer.js';

describe('text viewer', () => {
  it('opens on tap of truncated text with the card title, closes on tap', () => {
    document.body.innerHTML = `<div id="grid">
      <article class="card card--subway"><h2 class="card__title">Subway Status</h2>
        <div class="card__body"><div class="linestatus">
          <span class="linestatus__text">Downtown [1][2][3] trains are running with delays after severe weather</span>
        </div></div>
      </article></div>`;
    const grid = document.querySelector('#grid');
    initTextViewer(grid, { truncated: () => true });
    grid.querySelector('.linestatus__text').click();
    const viewer = document.querySelector('#text-viewer');
    expect(viewer).not.toBeNull();
    expect(viewer.hidden).toBe(false);
    expect(viewer.textContent).toContain('severe weather');
    expect(viewer.textContent).toContain('Subway Status');
    viewer.click();
    expect(viewer.hidden).toBe(true);
  });

  it('ignores taps on text that fits', () => {
    document.body.innerHTML = `<div id="grid"><article class="card"><div class="talert"><span class="talert__text">Short</span></div></article></div>`;
    const grid = document.querySelector('#grid');
    initTextViewer(grid, { truncated: () => false });
    grid.querySelector('.talert__text').click();
    expect(document.querySelector('#text-viewer')?.hidden ?? true).toBe(true);
  });

  it('auto-dismisses after 20 seconds so an abandoned board recovers', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    openTextViewer('LIRR · Penn Station', 'There are some delays on the Montauk branch east of Babylon');
    const viewer = document.querySelector('#text-viewer');
    expect(viewer.hidden).toBe(false);
    expect(viewer.textContent).toContain('Montauk');
    vi.advanceTimersByTime(20001);
    expect(viewer.hidden).toBe(true);
    vi.useRealTimers();
  });
});
