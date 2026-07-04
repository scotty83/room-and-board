import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(
  await readFile(new URL('../site/data/ferry.json', import.meta.url), 'utf8'),
);

describe('ferry.json', () => {
  it('has plausible landings, deduped by id, sorted by name', () => {
    expect(data.stops.length).toBeGreaterThanOrEqual(20);
    expect(new Set(data.stops.map((s) => s.id)).size).toBe(data.stops.length);
    const names = data.stops.map((s) => s.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(data.stops.some((s) => s.id === '17' && /East 34th/.test(s.name))).toBe(true);
    // Shuttle-bus stops must be filtered out (route_type 3).
    expect(names.some((n) => /Beach 96th/.test(n))).toBe(false);
  });
  it('joins trips to routes with colors', () => {
    expect(Object.keys(data.trips).length).toBeGreaterThanOrEqual(500);
    for (const [routeId, hs] of Object.values(data.trips).slice(0, 50)) {
      expect(data.routes[routeId]).toBeTruthy();
      expect(typeof hs).toBe('string');
    }
    for (const r of Object.values(data.routes)) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.color).toMatch(/^[0-9A-F]{6}$/i);
    }
  });
});
