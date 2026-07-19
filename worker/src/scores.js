// Golf + Tennis digests for the config-less cards. The raw ESPN scoreboards
// run 0.6-2.4 MB — far too heavy for gen1 boards at a 5-min cadence — so they
// are digested here (~2 KB) through the shared mappers and cached 5 min at
// the route, with cached()'s 24h stale fallback on upstream failure.

import { mapGolf, mapTennis } from '../../site/js/espn-scores.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
// Full browser UA — thin datacenter agents get bounced by some hosts.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function scoreboard(path) {
  const res = await fetch(`${ESPN}/${path}/scoreboard`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`espn ${path} ${res.status}`);
  return res.json();
}

export async function fetchGolf() {
  return { updatedAt: Math.floor(Date.now() / 1000), stale: false, ...mapGolf(await scoreboard('golf/pga')) };
}

export async function fetchTennis() {
  // One tour failing is a partial (the other still renders); both failing
  // throws so cached() serves its stale copy instead of an empty card.
  const [atp, wta] = await Promise.allSettled([scoreboard('tennis/atp'), scoreboard('tennis/wta')]);
  if (atp.status === 'rejected' && wta.status === 'rejected') throw new Error('tennis: both tours failed');
  return {
    updatedAt: Math.floor(Date.now() / 1000),
    stale: false,
    ...mapTennis(
      atp.status === 'fulfilled' ? atp.value : null,
      wta.status === 'fulfilled' ? wta.value : null,
    ),
  };
}
