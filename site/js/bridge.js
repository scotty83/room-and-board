// Device back-channel. parseFragment extracts what the SignageManager macro
// injects into the signage URL: the vault's encoded config and temporary
// credentials for the device's own WebSocket xAPI.

function b64urlToString(str) {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

// Connects to the device's own WebSocket xAPI (requires `WebEngine Features
// AllowDeviceCertificate: True` and `NetworkServices Websocket` enabled on the
// board). Credentials are the temporary low-privilege account the macro
// rotates. JSON-RPC 2.0; page->macro messages ride xCommand Message Send.
// A plausible host: IPv4/hostname (+optional port) or bracketed IPv6. Rejects
// anything with `/`, `@`, `?`, whitespace etc. so a crafted fragment can't
// redirect the WebSocket to an attacker-chosen path/host.
export function isBridgeHost(ip) {
  return typeof ip === 'string'
    && (/^[\w.-]{1,64}(:\d{1,5})?$/.test(ip) || /^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(ip));
}

export function connectBridge(auth, { WS = globalThis.WebSocket, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!isBridgeHost(auth?.ip)) {
      reject(new Error('bridge: missing or invalid device ip in auth fragment'));
      return;
    }
    const ws = new WS(
      `wss://${encodeURIComponent(auth.u)}:${encodeURIComponent(auth.p)}@${auth.ip}/ws`,
    );
    let nextId = 1;
    const pending = new Map();
    const connectTimer = setTimeout(() => {
      ws.close?.();
      reject(new Error('bridge: connect timeout'));
    }, timeoutMs);

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error) waiter.reject(new Error(msg.error.message ?? 'bridge: rpc error'));
      else waiter.resolve();
    };
    ws.onerror = () => {
      clearTimeout(connectTimer);
      reject(new Error('bridge: connection failed'));
    };
    ws.onopen = () => {
      clearTimeout(connectTimer);
      const sendText = (text) =>
        new Promise((res, rej) => {
          const id = nextId++;
          const timer = setTimeout(() => {
            pending.delete(id);
            rej(new Error('bridge: send timeout'));
          }, timeoutMs);
          pending.set(id, { resolve: res, reject: rej, timer });
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              method: 'xCommand/Message/Send',
              params: { Text: text },
            }),
          );
        });
      resolve({
        sendConfig: (encoded) => sendText(`sgn1:${encoded}`),
        sendReset: () => sendText('sgn1-reset'),
        close() {
          ws.close?.();
        },
      });
    };
  });
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
