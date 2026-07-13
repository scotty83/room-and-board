// Deployment endpoints. The Worker URL is the only environment-specific
// value in the shipped site; update it when deploying under your own domain.
// Backup-domain aware: a page served from the rvc.tech fallback talks to the
// worker's rvc.tech alias, so a network that blocks roomboard.app (e.g. a
// corporate newly-registered-domain filter) can't take out both halves.
export const WORKER_URL =
  typeof location !== 'undefined' && location.hostname.endsWith('.rvc.tech')
    ? 'https://signage-api.rvc.tech'
    : 'https://api.roomboard.app';
