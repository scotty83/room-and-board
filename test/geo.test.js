import { describe, it, expect, vi } from 'vitest';
import { zipLookup, locationSearch } from '../site/js/geo.js';

const ok = (body) => ({ ok: true, json: async () => body });

describe('zipLookup', () => {
  it('resolves a ZIP to lat/lon with a "Town ZIP" label', async () => {
    const fetchFn = async (url) => {
      expect(url).toBe('https://api.zippopotam.us/us/11570');
      return ok({
        'post code': '11570',
        places: [{ 'place name': 'Rockville Centre', latitude: '40.6637', longitude: '-73.638', 'state abbreviation': 'NY' }],
      });
    };
    expect(await zipLookup('11570', fetchFn)).toEqual({
      lat: 40.6637,
      lon: -73.638,
      label: 'Rockville Centre 11570',
    });
  });
  it('returns null on 404 and on empty places', async () => {
    expect(await zipLookup('99999', async () => ({ ok: false }))).toBeNull();
    expect(await zipLookup('99999', async () => ok({ places: [] }))).toBeNull();
  });
});

describe('locationSearch', () => {
  it('routes 5-digit queries to the US ZIP lookup (label + cc)', async () => {
    const fetchFn = vi.fn(async (url) => {
      expect(url).toContain('zippopotam.us/us/10001');
      return ok({ places: [{ 'place name': 'New York', latitude: '40.75', longitude: '-73.99' }] });
    });
    const out = await locationSearch('10001', fetchFn);
    expect(out).toHaveLength(1);
    expect(out[0].cc).toBe('US');
    expect(out[0].label).toBe('New York 10001');
  });

  it('geocodes city queries, labeling non-US with the country code', async () => {
    const fetchFn = vi.fn(async () => ok({ results: [
      { name: 'London', admin1: 'England', country_code: 'GB', latitude: 51.5, longitude: -0.13 },
      { name: 'Columbus', admin1: 'Ohio', country_code: 'US', latitude: 39.9, longitude: -83 },
    ] }));
    const out = await locationSearch('london', fetchFn);
    expect(out[0].label).toBe('London, England (GB)');
    expect(out[0].cc).toBe('GB');
    expect(out[1].label).toBe('Columbus, Ohio');
  });

  it('returns [] for short queries, no results, and fetch errors', async () => {
    expect(await locationSearch('L', vi.fn())).toEqual([]);
    expect(await locationSearch('xyzzy', vi.fn(async () => ok({})))).toEqual([]);
    expect(await locationSearch('london', vi.fn(async () => { throw new Error('net'); }))).toEqual([]);
  });
});
