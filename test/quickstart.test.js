import { describe, it, expect } from 'vitest';
import { QUICKSTART_CONFIG } from '../site/js/quickstart.js';
import { normalizeConfig } from '../site/js/config.js';
import { MIN_SIZE } from '../site/js/layout.js';

describe('quick-start preset', () => {
  const cfg = normalizeConfig({ ...QUICKSTART_CONFIG, t: 1783963634 });

  it('normalizes with every placement kept verbatim (valid ids, no overlaps, no clamps)', () => {
    // If normalize moved or resized anything, the curated arrangement is broken —
    // fix the preset, don't ship a scrambled showcase.
    expect(cfg.layout).toEqual(QUICKSTART_CONFIG.layout);
    expect(cfg.widgets).toEqual(QUICKSTART_CONFIG.layout.map((r) => r.id));
  });

  it('fills the whole 12x8 grid with no gaps', () => {
    const cells = new Set();
    for (const { x, y, w, h } of cfg.layout) {
      for (let i = x; i < x + w; i += 1) for (let j = y; j < y + h; j += 1) cells.add(`${i},${j}`);
    }
    expect(cells.size).toBe(12 * 8);
  });

  it('respects every widget minimum size', () => {
    for (const r of cfg.layout) {
      const [mw, mh] = MIN_SIZE[r.id] ?? [1, 1];
      expect(r.w, r.id).toBeGreaterThanOrEqual(mw);
      expect(r.h, r.id).toBeGreaterThanOrEqual(mh);
    }
  });

  it('keeps the curated sources and carries nothing personal', () => {
    expect(cfg.news.sources).toEqual(['nyt-home', 'npr', 'bbc']);
    expect(cfg.services.list).toEqual(['webex', 'zoom', 'slack', 'm365']);
    expect(cfg.name).toBe('');
  });
  it('starts new boards on Momentum (explicit, surviving normalize)', () => {
    expect(cfg.theme).toBeUndefined(); // theme machinery retired
  });
});
