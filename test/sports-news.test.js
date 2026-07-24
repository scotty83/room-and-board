import { fetchAll } from '../site/js/widgets/posts.js';
import { describe, it, expect } from 'vitest';
import { logoUrl } from '../site/js/widgets/sports.js';
import { mapTeamSummary, digestSchedule, pickLogo, LEAGUE_PATHS } from '../worker/src/sports.js';
import { mapWorldCup } from '../site/js/widgets/worldcup.js';
import { mapPosts } from '../site/js/widgets/posts.js';
import { parseRss, mergeNews, ageLabel } from '../site/js/widgets/news.js';
import { renderHeadlines } from '../site/js/widgets/newscore.js';

describe('mapTeamSummary', () => {
  const espn = (state, detail, scores) => ({
    team: {
      abbreviation: 'NYM', shortDisplayName: 'Mets',
      record: { items: [{ summary: '48-37' }] },
      logos: [
        { href: 'https://a.espncdn.com/i/teamlogos/mlb/500/nym.png', rel: ['full', 'default'] },
        { href: 'https://a.espncdn.com/i/teamlogos/mlb/500-dark/nym.png', rel: ['full', 'dark'] },
      ],
      nextEvent: [{
        date: '2026-07-03T23:15Z',
        competitions: [{
          status: { type: { state, shortDetail: detail } },
          competitors: [
            { homeAway: 'away', team: { abbreviation: 'NYM' }, score: scores?.[0] },
            { homeAway: 'home', team: { abbreviation: 'ATL' }, score: scores?.[1] },
          ],
        }],
      }],
    },
  });
  it('maps an upcoming game', () => {
    const row = mapTeamSummary(espn('pre', '7/3 - 7:15 PM EDT'), 'L 3-9 vs TOR · Final', 'mlb');
    expect(row).toMatchObject({ abbr: 'NYM', record: '48-37', state: 'pre', lastLine: 'L 3-9 vs TOR · Final' });
    expect(row.line).toBe('@ ATL · 7/3 - 7:15 PM EDT');
    expect(row.logo).toContain('500-dark'); // dark variant wins on dark cards
  });
  it('maps a live game with score', () => {
    const row = mapTeamSummary(espn('in', 'Bot 7th', [{ value: 3 }, { value: 2 }]), null, 'mlb');
    expect(row.line).toBe('3-2 @ ATL · Bot 7th');
    expect(row.state).toBe('in');
  });
  it('maps a final with W/L', () => {
    expect(mapTeamSummary(espn('post', 'Final', [{ value: 5 }, { value: 2 }]), null, 'mlb').line).toBe('W 5-2 @ ATL · Final');
    expect(mapTeamSummary(espn('post', 'Final', [{ value: 1 }, { value: 2 }]), null, 'mlb').line).toBe('L 1-2 @ ATL · Final');
  });
  it('survives teams with no scheduled events and covers all leagues', () => {
    expect(mapTeamSummary({ team: { abbreviation: 'X', shortDisplayName: 'X' } }, null, 'nfl').line).toBe('No scheduled games');
    expect(Object.keys(LEAGUE_PATHS)).toEqual(['mlb', 'nfl', 'nba', 'nhl', 'mls', 'epl']);
  });
});

describe('mapWorldCup', () => {
  const ev = (state, dateIso, scores, note) => ({
    date: dateIso,
    season: { type: { name: 'Round of 16' } },
    competitions: [{
      status: { type: { state, shortDetail: state === 'post' ? 'FT' : state === 'in' ? "68'" : '' } },
      competitors: [
        { homeAway: 'home', team: { abbreviation: 'USA' }, score: scores?.[0] },
        { homeAway: 'away', team: { abbreviation: 'CRC' }, score: scores?.[1] },
      ],
      notes: note ? [{ headline: note }] : [],
    }],
  });
  it('buckets live, upcoming and results with correct ordering', () => {
    const now = Date.parse('2026-07-02T18:00Z');
    const vm = mapWorldCup({ events: [
      ev('post', '2026-07-01T20:00Z', ['1', '1'], 'USA advance on penalties'),
      ev('pre', '2026-07-03T20:00Z'),
      ev('in', '2026-07-02T17:00Z', ['2', '0']),
      ev('post', '2026-06-30T20:00Z', ['3', '0']),
      ev('pre', '2026-07-02T22:00Z'),
    ]}, now);
    expect(vm.live).toHaveLength(1);
    expect(vm.upcoming.map((m) => m.t)).toEqual([...vm.upcoming.map((m) => m.t)].sort((a, b) => a - b));
    expect(vm.results[0].t).toBeGreaterThan(vm.results[1].t); // newest final first
    expect(vm.results[0].note).toContain('penalties');
  });
});

describe('news parsing', () => {
  const RSS = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Big headline &amp; more]]></title><pubDate>Thu, 02 Jul 2026 12:00:00 +0000</pubDate></item>
    <item><title>Second story</title><pubDate>Thu, 02 Jul 2026 10:00:00 +0000</pubDate></item>
    <item><description>no title, skipped</description></item>
  </channel></rss>`;
  it('parses items with CDATA and entities', () => {
    const items = parseRss(RSS, 'NYT');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Big headline & more', source: 'NYT' });
    expect(items[0].t).toBe(Date.parse('2026-07-02T12:00:00Z'));
  });
  it('captures the article link and summary for the tap-to-read story view', () => {
    const xml = `<rss><channel>
      <item><title>Markets slip</title><link>https://example.com/a?utm=rss</link><description><![CDATA[Stocks <b>fell</b> as oil rose.]]></description><pubDate>Thu, 02 Jul 2026 12:00:00 +0000</pubDate></item>
      <item><title>No summary here</title><link>https://example.com/b</link><pubDate>Thu, 02 Jul 2026 11:00:00 +0000</pubDate></item>
    </channel></rss>`;
    const [a, b] = parseRss(xml, 'X');
    expect(a.link).toBe('https://example.com/a?utm=rss');
    expect(a.desc).toBe('Stocks fell as oil rose.'); // HTML stripped out of the summary
    expect(b.link).toBe('https://example.com/b');
    expect(b.desc).toBe(''); // missing description -> empty, never undefined
  });
  it('drops a non-http link (relative/guid) so no broken QR is offered', () => {
    const xml = `<rss><channel>
      <item><title>Relative link</title><link>/local/path</link><pubDate>Thu, 02 Jul 2026 12:00:00 +0000</pubDate></item>
    </channel></rss>`;
    expect(parseRss(xml, 'X')[0].link).toBe('');
  });
  it('decodes hex and decimal numeric character references', () => {
    // Regression: MarketWatch emits hex refs (&#x2019;); only decimal was
    // decoded, so "Here&#x2019;s" survived and rendered the literal entity.
    const xml = `<rss><channel>
      <item><title>Here&#x2019;s what it means &#8212; part &#x33;</title><pubDate>Thu, 02 Jul 2026 12:00:00 +0000</pubDate></item>
    </channel></rss>`;
    expect(parseRss(xml, 'MW')[0].title).toBe('Here’s what it means — part 3');
  });
  it('merges sources newest-first and drops far-future items', () => {
    const now = Date.parse('2026-07-02T13:00:00Z');
    const merged = mergeNews([
      parseRss(RSS, 'A'),
      [{ title: 'future skew', t: now + 7200e3, source: 'B' }, { title: 'fresh', t: now - 60e3, source: 'B' }],
    ], now);
    expect(merged[0].title).toBe('fresh');
    expect(merged.some((i) => i.title === 'future skew')).toBe(false);
  });
  it('dedupes the same story carried by overlapping feeds, keeping the newest', () => {
    const now = Date.parse('2026-07-02T13:00:00Z');
    const merged = mergeNews([
      [{ title: 'How the Heat Is Upending Plans', t: now - 3600e3, source: 'NYT Top Stories' }],
      [
        { title: 'How the Heat Is Upending Plans', t: now - 1800e3, source: 'NYT New York' },
        { title: 'A different story', t: now - 60e3, source: 'NYT New York' },
      ],
    ], now);
    expect(merged).toHaveLength(2);
    const dupe = merged.find((i) => i.title.startsWith('How the Heat'));
    expect(dupe.source).toBe('NYT New York'); // newest copy wins
  });
  it('labels ages compactly', () => {
    const now = 1783000000000;
    expect(ageLabel(now - 5 * 60e3, now)).toBe('5m');
    expect(ageLabel(now - 3 * 3600e3, now)).toBe('3h');
    expect(ageLabel(now - 2 * 86400e3, now)).toBe('2d');
    expect(ageLabel(0, now)).toBe('');
  });
});

describe('renderHeadlines fill-to-fit', () => {
  // A fake card body: scrollHeight is derived from the rendered content
  // (rowPx per full headline, clampPx per clamped one), so we can drive the
  // measure loop without a real layout engine. The overflow count rides the
  // title badge (out of flow), so it never enters the measurement; the fake's
  // closest() has no querySelector, making setMoreBadge a deliberate no-op.
  const fakeBody = ({ clientHeight = 0, rowPx = 60, clampPx = 35, dataH = 4 } = {}) => {
    let html = '';
    return {
      closest: () => ({ dataset: { w: '4', h: String(dataH) } }),
      clientHeight,
      get scrollHeight() {
        // class="headline" only matches un-clamped rows (the clamped row's
        // class attribute is "headline headline--clamp"), so the two heights
        // can be modeled separately.
        const rows = (html.match(/class="headline"/g) || []).length;
        const clamped = (html.match(/headline--clamp/g) || []).length;
        return rows * rowPx + clamped * clampPx;
      },
      set innerHTML(v) { html = v; },
      get innerHTML() { return html; },
    };
  };
  const vm = (n) => ({ items: Array.from({ length: n }, (_, i) => ({ title: `H${i}`, source: 'NYT', t: 0 })), nowMs: 0 });
  const count = (el) => (el.innerHTML.match(/class="headline"/g) || []).length;
  const opts = { widgetId: 'news', emptyHint: 'none' };

  it('falls back to the static estimate with no layout (tests/happy-dom)', () => {
    const el = fakeBody({ clientHeight: 0 });        // cap('news',4,4)=4 → 30 items → show cap
    renderHeadlines(el, vm(30), opts);
    expect(count(el)).toBe(4);
    expect(el.innerHTML).not.toContain('more');      // no in-flow hint row anymore
  });
  it('grows to fill a card with room (one-line titles)', () => {
    const el = fakeBody({ clientHeight: 330, rowPx: 60 });
    renderHeadlines(el, vm(30), opts);
    expect(count(el)).toBe(5);                        // 5*60=300 ≤ 330; 6th (360) overflows
    expect(el.innerHTML).not.toContain('headline--clamp'); // clamped 6th (335) overflows too
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
  });
  it('shrinks when even the static estimate overflows a short card', () => {
    const el = fakeBody({ clientHeight: 150, rowPx: 60 });
    renderHeadlines(el, vm(30), opts);
    expect(count(el)).toBe(2);                        // 2*60=120 ≤ 150; 3 rows overflow
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
  });
  it('shows all items when they all fit', () => {
    const el = fakeBody({ clientHeight: 338, rowPx: 60 });
    renderHeadlines(el, vm(4), opts);
    expect(count(el)).toBe(4);
    expect(el.innerHTML).not.toContain('headline--clamp');
  });
  it('spends leftover slack on one extra title-clamped headline', () => {
    // 4 full rows = 240 ≤ 280, a 5th full row (300) overflows, but a clamped
    // 5th fits: 4*60 + 35 = 275 ≤ 280.
    const el = fakeBody({ clientHeight: 280, rowPx: 60, clampPx: 35 });
    renderHeadlines(el, vm(30), opts);
    expect(count(el)).toBe(4);                       // full rows
    expect(el.innerHTML).toContain('headline--clamp'); // + one clamped row
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
  });
  it('keeps the plain fit when even a clamped row cannot fit', () => {
    // 5 full rows = 300 exactly fills; a clamped 6th (335) overflows.
    const el = fakeBody({ clientHeight: 300, rowPx: 60, clampPx: 35 });
    renderHeadlines(el, vm(30), opts);
    expect(count(el)).toBe(5);
    expect(el.innerHTML).not.toContain('headline--clamp');
  });
});

describe('digestSchedule + logoUrl', () => {
  it('extracts the last completed game as a W/L line', () => {
    const sched = { events: [
      { competitions: [{ status: { type: { state: 'post', shortDetail: 'Final' } }, competitors: [
        { homeAway: 'away', team: { abbreviation: 'NYM' }, score: { value: 3 } },
        { homeAway: 'home', team: { abbreviation: 'TOR' }, score: { value: 9 } },
      ]}]},
      { competitions: [{ status: { type: { state: 'pre' } }, competitors: [] }] },
    ]};
    expect(digestSchedule(sched, 'NYM')).toBe('L 3-9 @ TOR · Final');
    expect(digestSchedule({ events: [] }, 'NYM')).toBeNull();
  });
  it('builds right-sized combiner urls', () => {
    expect(logoUrl('https://a.espncdn.com/i/teamlogos/mlb/500/nym.png', 80))
      .toBe('https://a.espncdn.com/combiner/i?img=%2Fi%2Fteamlogos%2Fmlb%2F500%2Fnym.png&h=80&w=80');
    expect(logoUrl(null)).toBeNull();
  });
});

describe('pickLogo', () => {
  it('prefers the non-scoreboard dark variant, falls back sanely', () => {
    const logos = [
      { href: 'default.png', rel: ['full', 'default'] },
      { href: 'sb-dark.png', rel: ['full', 'scoreboard', 'dark'] },
      { href: 'dark.png', rel: ['full', 'dark'] },
    ];
    expect(pickLogo(logos)).toBe('dark.png');
    expect(pickLogo([{ href: 'only.png', rel: ['full', 'default'] }])).toBe('only.png');
    expect(pickLogo([])).toBeNull();
    expect(pickLogo()).toBeNull();
  });
});

describe('mapPosts', () => {
  it('merges accounts newest-first and tolerates empty accounts', () => {
    const vm = mapPosts([
      [{ text: 'Older post', t: 1000e3, source: 'ACX' }],
      [{ text: 'Newest post', t: 2000e3, source: 'NYT' }],
      [],
    ], 2100e3);
    expect(vm.items.map((i) => i.text)).toEqual(['Newest post', 'Older post']);
    expect(vm.items[0].source).toBe('NYT');
    expect(vm.nowMs).toBe(2100e3);
  });
});

describe('mergeNews non-ASCII dedupe', () => {
  it('keeps emoji-only / CJK / Cyrillic posts instead of collapsing to one', () => {
    const items = ['🔥', '🎉🎉', 'こんにちは世界', 'Привет мир', 'Hello world'].map((t, i) => ({ title: t, t: 1000 - i, source: 'x' }));
    const out = mergeNews([items], 2000);
    expect(out).toHaveLength(5);
  });
});

describe('fetchAll total-failure resilience', () => {
  const rejecting = async () => { throw new Error('down'); };
  it('throws when every account rejects (so the stale cache survives)', async () => {
    await expect(fetchAll([{ id: 'a' }, { id: 'b' }], rejecting, {})).rejects.toThrow();
  });
  it('resolves with the survivors on partial failure', async () => {
    const one = async (acct) => (acct.id === 'a' ? [{ text: 'hi', t: 1e12, source: 'A' }] : Promise.reject(new Error('down')));
    const vm = await fetchAll([{ id: 'a' }, { id: 'b' }], one, {});
    expect(vm.items).toHaveLength(1);
  });
  it('resolves empty when there are no accounts', async () => {
    const vm = await fetchAll([], rejecting, {});
    expect(vm.items).toEqual([]);
  });
});

describe('sports fetchData total-failure resilience', () => {
  it('throws when all team fetches reject', async () => {
    const sports = await import('../site/js/widgets/sports.js');
    const net = { fetchJSON: async () => { throw new Error('down'); } };
    await expect(sports.fetchData({ sports: { teams: [{ lg: 'mlb', id: '10' }] } }, net)).rejects.toThrow();
  });
  it('returns rows on success', async () => {
    const sports = await import('../site/js/widgets/sports.js');
    const net = { fetchJSON: async () => ({ row: { abbr: 'NYM', state: 'pre', line: 'x' } }) };
    const vm = await sports.fetchData({ sports: { teams: [{ lg: 'mlb', id: '21' }] } }, net);
    expect(vm.rows).toHaveLength(1);
  });
});
