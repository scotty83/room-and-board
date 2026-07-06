import { describe, it, expect } from 'vitest';
import { parseAlbumToken } from '../site/js/util.js';

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
