// Jittered periodic runner with exponential backoff on failure. Jitter keeps
// a fleet of boards from hitting upstream feeds in lockstep.

export function schedule(fn, intervalMs, { jitter = 0.15 } = {}) {
  let cancelled = false;
  let timer = null;
  let backoff = 1;

  const jittered = (ms) => {
    if (!jitter) return ms;
    const spread = ms * jitter;
    return Math.round(ms - spread + Math.random() * 2 * spread);
  };

  const run = async () => {
    if (cancelled) return;
    try {
      await fn();
      backoff = 1;
    } catch {
      backoff = Math.min(backoff * 2, 8);
    }
    if (!cancelled) timer = setTimeout(run, jittered(intervalMs * backoff));
  };

  timer = setTimeout(run, 0);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
