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
