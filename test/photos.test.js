import { describe, it, expect } from 'vitest';
import { parseAlbumToken } from '../site/js/util.js';
import { mapPhotos } from '../site/js/widgets/photos.js';

describe('parseAlbumToken', () => {
  it('extracts the token from a full URL, a #fragment, or a bare token', () => {
    expect(parseAlbumToken('https://www.icloud.com/sharedalbum/#B1m5fk75vLWwX')).toBe('B1m5fk75vLWwX');
    expect(parseAlbumToken('#B1m5fk75vLWwX')).toBe('B1m5fk75vLWwX');
    expect(parseAlbumToken('  B1m5fk75vLWwX  ')).toBe('B1m5fk75vLWwX');
    expect(parseAlbumToken('https://www.icloud.com/sharedalbum/#B1m5fk75vLWwX/')).toBe('B1m5fk75vLWwX'); // trailing slash
  });
  it('preserves case and rejects junk', () => {
    expect(parseAlbumToken('AbCdEf12345')).toBe('AbCdEf12345');
    expect(parseAlbumToken('short')).toBeNull();
    expect(parseAlbumToken('')).toBeNull();
    expect(parseAlbumToken(null)).toBeNull();
  });
});

describe('mapPhotos', () => {
  it('maps the worker digest to a slideshow-shaped list', () => {
    const vm = mapPhotos({ updatedAt: 1, stale: false, photos: [
      { url: 'https://x/1.jpg', w: 2049, h: 1537, ar: 1.333, caption: 'Beach', date: '2026-02-24' },
    ] });
    expect(vm.photos[0]).toMatchObject({ img: 'https://x/1.jpg', ar: 1.333, title: 'Beach' });
    expect(vm.stale).toBe(false);
  });
  it('handles the unconfigured/empty digest', () => {
    expect(mapPhotos({ photos: [] }).photos).toEqual([]);
    expect(mapPhotos(null).photos).toEqual([]);
  });
});

describe('fetchData source routing', () => {
  const photos = () => import('../site/js/widgets/photos.js');
  it('routes a gdrive source to /gdrive/album', async () => {
    const { fetchData } = await photos();
    const calls = [];
    const net = { fetchJSON: (u) => { calls.push(u); return Promise.resolve({ photos: [{ url: 'x', ar: 1, caption: '', date: '' }] }); } };
    const vm = await fetchData({ photos: { source: 'gdrive', album: '1RHow60mcBwzMturimQSbziK3hqCvP2lz' } }, net);
    expect(calls[0]).toContain('/gdrive/album?folder=1RHow60mcBwzMturimQSbziK3hqCvP2lz');
    expect(vm.photos).toHaveLength(1);
  });
  it('returns empty without fetching when unconfigured', async () => {
    const { fetchData } = await photos();
    const vm = await fetchData({ photos: { source: 'gdrive', album: '' } }, { fetchJSON: () => { throw new Error('no fetch'); } });
    expect(vm.photos).toEqual([]);
  });
});
