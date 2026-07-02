// Fetch helpers with a hard timeout. The MTA endpoints reject HEAD requests,
// so everything here is plain GET.

const TIMEOUT_MS = 15000;

export class NetError extends Error {
  constructor(message, { url, status = null } = {}) {
    super(message);
    this.name = 'NetError';
    this.url = url;
    this.status = status;
  }
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new NetError(`HTTP ${res.status}`, { url, status: res.status });
    return res;
  } catch (err) {
    if (err instanceof NetError) throw err;
    throw new NetError(err.name === 'AbortError' ? 'timeout' : String(err), { url });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON(url, opts) {
  return (await fetchWithTimeout(url, opts)).json();
}

export async function fetchBuffer(url, opts) {
  return (await fetchWithTimeout(url, opts)).arrayBuffer();
}
