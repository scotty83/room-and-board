import { describe, it, expect } from 'vitest';
import { itemCapacity, capacityLabel } from '../site/js/capacity.js';

// Sizes are on the 12×8 grid: h=2 is a shallow strip (compact tier s), h=4 the
// common default (tier m), h=6/8 a tall card (tier l).
describe('itemCapacity', () => {
  it('scales list rows with card height', () => {
    expect(itemCapacity('markets', 4, 2)).toBe(2);
    expect(itemCapacity('markets', 4, 4)).toBe(4);
    expect(itemCapacity('markets', 4, 8)).toBe(10);
    expect(itemCapacity('lirr', 4, 4)).toBe(4);
    expect(itemCapacity('lirr', 4, 6)).toBe(7);
    expect(itemCapacity('subway', 4, 4)).toBe(5);
    expect(itemCapacity('history', 4, 2)).toBe(2);
    expect(itemCapacity('history', 4, 4)).toBe(5);
    expect(itemCapacity('worldclock', 2, 3)).toBe(4);
    expect(itemCapacity('worldclock', 3, 4)).toBe(6);
    expect(itemCapacity('worldclock', 3, 8)).toBe(14);
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
    expect(capacityLabel('markets', 4, 2, cfg)).toBe('shows 2 of 7 tickers');
    expect(capacityLabel('markets', 4, 8, cfg)).toBe('shows all 7 tickers');
  });
  it('describes subway lines against the selection', () => {
    expect(capacityLabel('subway', 4, 2, cfg)).toBe('shows 2 of 4 lines');
    expect(capacityLabel('subway', 4, 4, cfg)).toBe('shows all 4 lines');
  });
  it('describes worldclock cities against the selection', () => {
    expect(capacityLabel('worldclock', 2, 3, cfg)).toBe('shows 4 of 8 cities');
    expect(capacityLabel('worldclock', 3, 8, cfg)).toBe('shows all 8 cities');
  });
  it('describes trains and events plainly', () => {
    expect(capacityLabel('lirr', 4, 4, cfg)).toBe('next 4 trains');
    expect(capacityLabel('history', 4, 2, cfg)).toBe('2 events');
  });
  it('describes weather tiers and stays quiet for non-lists', () => {
    expect(capacityLabel('weather', 4, 4, cfg)).toBe('6 hourly · 2-day forecast');
    expect(capacityLabel('weather', 6, 6, cfg)).toBe('8 hourly · 5-day forecast');
    expect(capacityLabel('art', 2, 2, cfg)).toBeNull();
  });
});
