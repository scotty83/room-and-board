// Device back-channel. parseFragment extracts what the SignageManager macro
// injects into the signage URL: the vault's encoded config and temporary
// credentials for the device's own WebSocket xAPI.

function b64urlToString(str) {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

export function parseFragment(hash) {
  const out = { cfg: null, auth: null };
  if (!hash || hash === '#') return out;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  out.cfg = params.get('cfg');
  const rawAuth = params.get('auth');
  if (rawAuth) {
    try {
      const auth = JSON.parse(b64urlToString(rawAuth));
      if (auth && typeof auth.u === 'string' && typeof auth.p === 'string') {
        out.auth = { u: auth.u, p: auth.p, ip: typeof auth.ip === 'string' ? auth.ip : null };
      }
    } catch {
      out.auth = null;
    }
  }
  return out;
}
