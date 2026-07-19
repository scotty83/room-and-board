import { describe, it, expect } from 'vitest';
import { itemCapacity, capacityLabel } from '../site/js/capacity.js';

// Sizes are on the 12×8 grid: h=2 is a shallow strip (compact tier s), h=4 the
// common default (tier m), h=6/8 a tall card (tier l).
describe('itemCapacity', () => {
  it('scales list rows with card height', () => {
    expect(itemCapacity('markets', 4, 2)).toBe(3); // shallow rows are spark-less — 3 tickers fit
    expect(itemCapacity('markets', 4, 3)).toBe(3);
    expect(itemCapacity('markets', 4, 4)).toBe(5); // trimmed rows: five fit a 4-tall
    // 3-wide runs the trimmed stacked rows (data-w=3 CSS): a 3x4 fits five.
    expect(itemCapacity('markets', 3, 3)).toBe(3);
    expect(itemCapacity('markets', 3, 4)).toBe(5);
    expect(itemCapacity('markets', 3, 5)).toBe(6);
    expect(itemCapacity('markets', 4, 8)).toBe(11);
    expect(itemCapacity('bus', 3, 3)).toBe(4); // stop headers + arrivals share the row budget
    expect(itemCapacity('bus', 4, 8)).toBe(15);
    expect(itemCapacity('lirr', 4, 4)).toBe(4);
    expect(itemCapacity('lirr', 4, 6)).toBe(7);
    expect(itemCapacity('subway', 4, 4)).toBe(6); // optimistic pitch; alert days trim to the badge
    expect(itemCapacity('history', 4, 2)).toBe(2);
    expect(itemCapacity('history', 4, 4)).toBe(5);
    expect(itemCapacity('worldclock', 2, 3)).toBe(5);
    expect(itemCapacity('worldclock', 3, 4)).toBe(7);
    expect(itemCapacity('worldclock', 3, 8)).toBe(17);
  });
  it('gives marketsnews the same headline capacity as news (never null)', () => {
    // Regression: a missing MODELS entry returned null, which made
    // renderHeadlines treat the whole feed as overflow and show 1 item.
    for (const [w, h] of [[4, 4], [4, 6], [6, 8]]) {
      expect(itemCapacity('marketsnews', w, h)).toBe(itemCapacity('news', w, h));
    }
    expect(itemCapacity('marketsnews', 4, 6)).toBeGreaterThan(1);
  });
  it('returns null for widgets without a primary list', () => {
    expect(itemCapacity('art', 2, 2)).toBeNull();
  });
});

describe('capacityLabel', () => {
  const cfg = {
    markets: { symbols: ['^DJI', '^IXIC', '^GSPC', 'AAPL', 'MSFT', 'NVDA', 'TSLA'] },
    subway: { lines: ['1', '2', '3', 'A'] },
    worldclock: { cities: Array.from({ length: 8 }, (_, i) => ({ label: `C${i}`, zone: 'UTC' })) },
  };
  it('describes markets as shown-of-total tickers', () => {
    expect(capacityLabel('markets', 4, 2, cfg)).toBe('shows 3 of 7 tickers');
    expect(capacityLabel('markets', 4, 8, cfg)).toBe('shows all 7 tickers');
  });
  it('weather forecast label matches what render actually shows (big = w>=5||h>=5)', () => {
    // small tier (incl. the reported 3×4): 6 hourly · 4-day
    expect(capacityLabel('weather', 3, 4, cfg)).toBe('6 hourly · 4-day forecast');
    expect(capacityLabel('weather', 4, 4, cfg)).toBe('6 hourly · 4-day forecast');
    // big tier by height OR width
    expect(capacityLabel('weather', 4, 5, cfg)).toBe('8 hourly · 5-day forecast');
    expect(capacityLabel('weather', 5, 4, cfg)).toBe('8 hourly · 5-day forecast');
  });
  it('describes subway lines against the selection', () => {
    expect(capacityLabel('subway', 4, 2, cfg)).toBe('shows 2 of 4 lines');
    expect(capacityLabel('subway', 4, 4, cfg)).toBe('shows all 4 lines');
  });
  it('describes worldclock cities against the selection', () => {
    expect(capacityLabel('worldclock', 2, 3, cfg)).toBe('shows 5 of 8 cities');
    expect(capacityLabel('worldclock', 3, 8, cfg)).toBe('shows all 8 cities');
  });
  it('describes trains and events plainly', () => {
    expect(capacityLabel('lirr', 4, 4, cfg)).toBe('next 4 trains');
    expect(capacityLabel('history', 4, 2, cfg)).toBe('2 events');
  });
  it('describes both news widgets as headlines', () => {
    expect(capacityLabel('news', 4, 4, cfg)).toBe('4 headlines');
    expect(capacityLabel('marketsnews', 4, 4, cfg)).toBe('4 headlines');
  });
  it('describes weather tiers and stays quiet for non-lists', () => {
    expect(capacityLabel('weather', 4, 4, cfg)).toBe('6 hourly · 4-day forecast');
    expect(capacityLabel('weather', 6, 6, cfg)).toBe('8 hourly · 5-day forecast');
    expect(capacityLabel('art', 2, 2, cfg)).toBeNull();
  });
});
