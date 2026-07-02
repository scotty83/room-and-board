import { describe, it, expect } from 'vitest';
import {
  b64url,
  serializeVault,
  parseVault,
  composeUrl,
  parseMsg,
  randPass,
} from '../macro/SignageManager.js';
import { planActions } from '../deploy/provision.js';

describe('b64url (macro-side, no btoa)', () => {
  it('matches Node base64url for ascii and unicode', () => {
    for (const s of ['hello', '{"u":"bridge","p":"x?&y","ip":"10.0.0.5"}', 'café ☕']) {
      expect(b64url(s)).toBe(Buffer.from(s, 'utf8').toString('base64url'));
    }
  });
});

describe('vault serialization', () => {
  it('round-trips', () => {
    const vault = { cfg: 'AbC-_123' };
    expect(parseVault(serializeVault(vault))).toEqual(vault);
  });
  it('rejects non-vault content', () => {
    expect(() => parseVault('const x = 5;')).toThrow(/vault/);
  });
});

describe('composeUrl', () => {
  const auth = { u: 'signage-bridge', p: 'pass', ip: '10.1.2.3' };
  it('includes cfg and auth in the fragment', () => {
    const url = composeUrl('https://s.example', 'CFG123', auth);
    expect(url.startsWith('https://s.example#cfg=CFG123&auth=')).toBe(true);
    const authPart = url.split('auth=')[1];
    expect(JSON.parse(Buffer.from(authPart, 'base64url').toString())).toEqual(auth);
  });
  it('omits cfg when vault is empty', () => {
    expect(composeUrl('https://s.example', null, auth)).toMatch(/#auth=/);
  });
  it('guards the 2048-char signage url limit', () => {
    expect(() => composeUrl('https://s.example', 'x'.repeat(2100), auth)).toThrow(/2048/);
  });
});

describe('parseMsg', () => {
  it('recognizes the reset message', () => {
    expect(parseMsg('sgn1-reset')).toEqual({ type: 'reset' });
  });

  it('accepts framed base64url configs only', () => {
    expect(parseMsg('sgn1:AbC-_1')).toEqual({ type: 'cfg', cfg: 'AbC-_1' });
    expect(parseMsg('sgn1:not valid!!')).toBeNull();
    expect(parseMsg('other:xyz')).toBeNull();
    expect(parseMsg(undefined)).toBeNull();
  });
});

describe('randPass', () => {
  it('generates url-safe passphrases of the right length', () => {
    const p = randPass();
    expect(p).toMatch(/^[A-Za-z0-9_-]{48}$/);
    expect(randPass()).not.toBe(p);
  });
});

describe('provision planActions', () => {
  it('plans per-device configs and macro install', () => {
    const plan = planActions('host\n10.0.0.5\nboard-2.example.com\n', {
      SITE_URL: 'https://signage.example.pages.dev',
    });
    expect(plan).toHaveLength(2);
    expect(plan[0].host).toBe('10.0.0.5');
    const kinds = plan[0].actions.map((a) => a.path ?? a.command);
    expect(kinds).toContain('Configuration/WebEngine/Mode');
    expect(kinds).toContain('Configuration/WebEngine/Features/AllowDeviceCertificate');
    expect(kinds).toContain('Configuration/NetworkServices/Websocket');
    expect(kinds).toContain('Configuration/Standby/Signage/Mode');
    expect(kinds).toContain('Macros/Macro/Save');
    expect(kinds).toContain('Macros/Macro/Activate');
    expect(kinds).toContain('Macros/Runtime/Restart');
    const save = plan[0].actions.find((a) => a.command === 'Macros/Macro/Save');
    expect(save.body).toContain('https://signage.example.pages.dev');
    expect(save.body).not.toContain('SIGNAGE_SITE_URL_PLACEHOLDER');
  });
  it('throws without SITE_URL', () => {
    expect(() => planActions('host\n10.0.0.5\n', {})).toThrow(/SITE_URL/);
  });
});
