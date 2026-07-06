import { describe, it, expect } from 'vitest';
import { logoUrl } from '../site/js/widgets/sports.js';
import { mapTeamSummary, digestSchedule, pickLogo, LEAGUE_PATHS } from '../worker/src/sports.js';
import { mapWorldCup } from '../site/js/widgets/worldcup.js';
import { mapPosts } from '../site/js/widgets/posts.js';
import { parseRss, mergeNews, ageLabel } from '../site/js/widgets/news.js';

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
