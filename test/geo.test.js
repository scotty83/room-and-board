import { describe, it, expect } from 'vitest';
import { zipLookup } from '../site/js/geo.js';

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
