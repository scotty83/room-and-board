// Shared engine for the two followed-account widgets: Substack (long-form
// publications, Worker digest — their API is keyless but CORS-less) and
// Bluesky (short-form, public AppView is CORS-open and keyless). They are
// separate widgets because their cadences differ by an order of magnitude —
// a merged newest-first feed would bury weekly essays under daily posts.
// Rows reuse the Headlines markup so capacity math and the tap-to-read text
// viewer work unchanged.

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { ageLabel, mergeNews } from './news.js';

export const BSKY_API = 'https://public.api.bsky.app/xrpc';

export function mapPosts(perAccount, nowMs) {
  // mergeNews sorts newest-first and dedupes on normalized "title" text.
  const items = mergeNews(
    perAccount.map((rows) => rows.map((r) => ({ ...r, title: r.text }))),
    nowMs,
  ).map(({ title, ...rest }) => rest);
  return { nowMs, items };
}

export function renderPostRows(el, vm, widgetId, emptyHint) {
  if (!vm.items?.length) {
    el.innerHTML = `<div class="empty">${emptyHint}</div>`;
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity(widgetId, w, h) ?? 4;
  const shown = vm.items.slice(0, cap);
  const hidden = vm.items.length - shown.length;
  el.innerHTML = shown
    .map(
      (i) => `<div class="headline">
        <div class="headline__meta">
          <span class="headline__src">${escapeHtml(i.source)}</span>
          <span class="headline__age">${ageLabel(i.t, vm.nowMs)}</span>
        </div>
        <div class="headline__title">${escapeHtml(i.text)}</div>
      </div>`,
    )
    .join('') + (hidden > 0 ? `<div class="more-hint">+${hidden} more — enlarge the card</div>` : '');
}

export async function fetchBskyRows(acct, net) {
  const feed = await net.fetchJSON(
    `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(acct.id)}&limit=12&filter=posts_no_replies`,
  );
  return (feed.feed ?? [])
    .filter((it) => !it.reason) // skip reposts — their words, not others'
    .map((it) => ({
      text: String(it.post?.record?.text ?? '').trim(),
      t: Date.parse(it.post?.record?.createdAt ?? '') || 0,
      source: acct.label,
    }))
    .filter((r) => r.text);
}

export async function fetchSubstackRows(acct, net) {
  const digest = await net.fetchJSON(
    `${WORKER_URL}/posts/substack?pub=${encodeURIComponent(acct.id)}`,
  );
  return (digest.posts ?? []).map((p) => ({
    text: p.subtitle ? `${p.title} — ${p.subtitle}` : p.title,
    t: p.t * 1000,
    source: acct.label,
  }));
}

// One dead account never blanks a card. But a TOTAL failure (every account
// rejected) must throw, not resolve empty — otherwise it overwrites the good
// stale cache and shows "add accounts" though accounts are configured.
export async function fetchAll(accounts, fetchRows, net) {
  const settled = await Promise.allSettled(accounts.map((a) => fetchRows(a, net)));
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (accounts.length && !ok.length && settled.some((s) => s.status === 'rejected')) {
    throw new Error('posts: all account fetches failed');
  }
  return mapPosts(ok, Date.now());
}
