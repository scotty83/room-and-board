import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dailyPick } from '../site/js/util.js';
import { quoteOfDay } from '../site/js/widgets/quote.js';

describe('dailyPick', () => {
  const list = Array.from({ length: 100 }, (_, i) => i);
  it('is deterministic per calendar day and changes across days', () => {
    expect(dailyPick(list, new Date('2026-07-03T08:00:00')))
      .toBe(dailyPick(list, new Date('2026-07-03T23:00:00')));
    expect(dailyPick(list, new Date('2026-07-03')))
      .not.toBe(dailyPick(list, new Date('2026-07-04')));
  });
  it('handles Feb 29 without going out of range', () => {
    expect(list).toContain(dailyPick(list, new Date('2028-02-29T12:00:00')));
  });
  it('backs quoteOfDay so both daily widgets stay in lockstep', () => {
    const quotes = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    const d = new Date('2026-07-03');
    expect(quoteOfDay(quotes, d)).toBe(dailyPick(quotes, d));
  });
});

describe('words.json', () => {
  it('ships 366+ well-formed, unique entries', async () => {
    const words = JSON.parse(
      await readFile(new URL('../site/data/words.json', import.meta.url), 'utf8'),
    );
    expect(words.length).toBeGreaterThanOrEqual(366);
    const seen = new Set();
    for (const e of words) {
      expect(typeof e.w).toBe('string');
      expect(e.w.length).toBeGreaterThan(1);
      // The render-time fit-to-width floor (20px) assumes words stay under
      // ~18 chars; longer entries would clip on 2-wide cards.
      expect(e.w.length).toBeLessThanOrEqual(18);
      expect(seen.has(e.w.toLowerCase())).toBe(false);
      seen.add(e.w.toLowerCase());
      expect(e.pr.length).toBeGreaterThan(1);
      expect(['noun', 'verb', 'adjective', 'adverb', 'interjection']).toContain(e.pos);
      expect(e.def.length).toBeGreaterThan(10);
      expect(e.ex.length).toBeGreaterThan(10);
      // Board-size sanity: definitions must fit the card comfortably.
      expect(e.def.length).toBeLessThanOrEqual(140);
      expect(e.ex.length).toBeLessThanOrEqual(120);
    }
  });
});
