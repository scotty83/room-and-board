// Boot-time config selection: the URL fragment (macro vault) and localStorage
// both carry a timestamped config; the newest one wins.

import { pickNewest } from './config.js';

export function chooseBootConfig(fragmentCfg, storedCfg) {
  const cfg = pickNewest(fragmentCfg, storedCfg);
  if (!cfg) return { cfg: null, source: 'none' };
  return { cfg, source: cfg === fragmentCfg ? 'fragment' : 'local' };
}
