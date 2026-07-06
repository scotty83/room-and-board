// Latest posts from followed Substack publications (Worker digest — their
// API is keyless but CORS-less) and Bluesky accounts (public AppView,
// CORS-open and keyless — browser-direct). Rows reuse the Headlines markup
// so capacity math and the tap-to-read text viewer work unchanged.

import { escapeHtml } from '../util.js';
import { WORKER_URL } from '../env.js';
import { itemCapacity, cardSize } from '../capacity.js';
import { ageLabel, mergeNews } from './news.js';

export const meta = { id: 'posts', title: 'Latest Posts', refreshMs: 10 * 60 * 1000 };

export const BSKY_API = 'https://public.api.bsky.app/xrpc';

export function mapPosts(perAccount, nowMs) {
  // mergeNews sorts newest-first and dedupes on normalized "title" text.
  const items = mergeNews(
    perAccount.map((rows) => rows.map((r) => ({ ...r, title: r.text }))),
    nowMs,
  ).map(({ title, ...rest }) => rest);
  return { nowMs, items };
}

async function fetchAccount(acct, net) {
  if (acct.net === 'bsky') {
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
  const digest = await net.fetchJSON(
    `${WORKER_URL}/posts/substack?pub=${encodeURIComponent(acct.id)}`,
  );
  return (digest.posts ?? []).map((p) => ({
    text: p.subtitle ? `${p.title} — ${p.subtitle}` : p.title,
    t: p.t * 1000,
    source: acct.label,
  }));
}

export function render(el, vm, _cfg) {
  if (!vm.items?.length) {
    el.innerHTML = '<div class="empty">Add accounts in Settings → Latest Posts</div>';
    return;
  }
  const [w, h] = cardSize(el, [4, 4]);
  const cap = itemCapacity('posts', w, h) ?? 4;
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

export async function fetchData(cfg, net) {
  const settled = await Promise.allSettled(
    (cfg.posts?.accounts ?? []).map((a) => fetchAccount(a, net)),
  );
  // One dead account never blanks the card.
  const perAccount = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  return mapPosts(perAccount, Date.now());
}
