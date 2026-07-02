import { describe, it, expect } from 'vitest';
import { itemCapacity, capacityLabel } from '../site/js/capacity.js';

describe('itemCapacity', () => {
  it('scales list rows with card height', () => {
    expect(itemCapacity('markets', 2, 1)).toBe(3);
    expect(itemCapacity('markets', 2, 2)).toBe(4);
    expect(itemCapacity('markets', 2, 4)).toBe(10);
    expect(itemCapacity('lirr', 2, 2)).toBe(4);
    expect(itemCapacity('lirr', 2, 3)).toBe(7);
    expect(itemCapacity('subway', 2, 2)).toBe(6);
    expect(itemCapacity('history', 2, 1)).toBe(2);
    expect(itemCapacity('history', 3, 2)).toBe(5);
  });
  it('returns null for widgets without a primary list', () => {
    expect(itemCapacity('art', 2, 2)).toBeNull();
    expect(itemCapacity('worldclock', 1, 2)).toBeNull();
  });
});

describe('capacityLabel', () => {
  const cfg = {
    markets: { symbols: ['^DJI', '^IXIC', '^GSPC', 'AAPL', 'MSFT', 'NVDA', 'TSLA'] },
    subway: { lines: ['1', '2', '3', 'A'] },
  };
  it('describes markets as shown-of-total tickers', () => {
    expect(capacityLabel('markets', 2, 1, cfg)).toBe('shows 3 of 7 tickers');
    expect(capacityLabel('markets', 2, 4, cfg)).toBe('shows all 7 tickers');
  });
  it('describes subway lines against the selection', () => {
    expect(capacityLabel('subway', 2, 1, cfg)).toBe('shows 3 of 4 lines');
    expect(capacityLabel('subway', 2, 2, cfg)).toBe('shows all 4 lines');
  });
  it('describes trains and events plainly', () => {
    expect(capacityLabel('lirr', 2, 2, cfg)).toBe('next 4 trains');
    expect(capacityLabel('history', 2, 1, cfg)).toBe('2 events');
  });
  it('describes weather tiers and stays quiet for non-lists', () => {
    expect(capacityLabel('weather', 2, 2, cfg)).toBe('6 hourly · 2-day forecast');
    expect(capacityLabel('weather', 3, 3, cfg)).toBe('8 hourly · 5-day forecast');
    expect(capacityLabel('art', 2, 2, cfg)).toBeNull();
  });
});
