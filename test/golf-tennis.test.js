// Mapper tests for the config-less golf + tennis widgets, built against the
// ESPN scoreboard shapes probed live on 2026-07-19 (golf: events[].
// competitions[].competitors with order/score/linescores; tennis: events[].
// groupings[].competitions with athlete-less doubles rows).

import { describe, it, expect } from 'vitest';
import { mapGolf } from '../site/js/widgets/golf.js';
import { mapTennisEvent, mapTennis } from '../site/js/widgets/tennis.js';

const golfPayload = {
  events: [{
    name: 'The Open Championship', shortName: 'The Open', date: '2026-07-16T06:00Z',
    competitions: [{
      status: { type: { state: 'in', detail: 'Round 3 - Play Complete' } },
      competitors: [
        { order: 2, score: '-8', athlete: { displayName: 'Ryan Fox', shortName: 'R. Fox', flag: { href: 'https://a.espncdn.com/i/teamlogos/countries/500/nzl.png' } }, linescores: [{ displayValue: '-4' }, { displayValue: '-2' }] },
        { order: 1, score: '-10', athlete: { displayName: 'Sam Burns', shortName: 'S. Burns' }, linescores: [{ displayValue: '-6' }, { displayValue: '+3' }, { period: 3 }] },
        { order: 3, score: '-8', athlete: { displayName: 'Si Woo Kim' }, linescores: [] },
      ],
    }],
  }],
};

describe('mapGolf', () => {
  it('sorts by leaderboard order and digests score + today line', () => {
    const vm = mapGolf(golfPayload);
    expect(vm.name).toBe('The Open');
    expect(vm.round).toBe('3');
    expect(vm.state).toBe('in');
    expect(vm.players.map((p) => p.name)).toEqual(['S. Burns', 'R. Fox', 'Si Woo Kim']);
    expect(vm.players[0]).toMatchObject({ pos: 1, score: '-10', today: '+3' });
    expect(vm.players[2].today).toBe('');
    expect(vm.players[1].flag).toContain('nzl.png'); // ESPN CDN flag passthrough
    expect(vm.players[0].flag).toBeNull();
  });

  it('surfaces the start date for a pre-tournament event', () => {
    const vm = mapGolf({ events: [{ name: 'Travelers', date: '2026-07-24T06:00Z', competitions: [{ status: { type: { state: 'pre', detail: 'Thu 7:00 AM' } }, competitors: [] }] }] });
    expect(vm.state).toBe('pre');
    expect(vm.startsAt).toBe(Date.parse('2026-07-24T06:00Z'));
    expect(vm.players).toEqual([]);
  });

  it('tolerates ESPN flipping score to an object shape', () => {
    const p = JSON.parse(JSON.stringify(golfPayload));
    p.events[0].competitions[0].competitors[0].score = { value: 202, displayValue: '-8' };
    expect(mapGolf(p).players[1].score).toBe('-8'); // Fox sorts 2nd by order
  });

  it('handles an empty feed (off week)', () => {
    expect(mapGolf({ events: [] })).toMatchObject({ name: null, players: [] });
    expect(mapGolf(null).players).toEqual([]);
  });
});

const match = (over) => ({
  id: 'm' + Math.random().toString(36).slice(2),
  date: '2026-07-19T13:00Z',
  round: { displayName: 'Quarterfinal' },
  status: { type: { state: 'post', shortDetail: 'Final' } },
  competitors: [
    { athlete: { shortName: 'V. Strakhova', flag: { href: 'https://a.espncdn.com/i/teamlogos/countries/500/ukr.png' } }, winner: false, linescores: [{ value: 2 }, { value: 2 }] },
    { athlete: { shortName: 'M. Bulgaru' }, winner: true, linescores: [{ value: 6 }, { value: 6 }] },
  ],
  ...over,
});

const tourPayload = (name, groupings, id = name) => ({ events: [{ id, name, shortName: name, groupings }] });

describe('mapTennisEvent', () => {
  it('keeps singles, skips doubles (athlete-less), derives tour from the grouping', () => {
    const rows = mapTennisEvent({
      groupings: [
        { grouping: { displayName: "Women's Singles" }, competitions: [match()] },
        { grouping: { displayName: "Men's Singles" }, competitions: [match()] },
        { grouping: { displayName: "Women's Doubles" }, competitions: [match({ competitors: [{ winner: true, linescores: [] }, { winner: false, linescores: [] }] })] },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tour: 'WTA', state: 'post', winner: 'b', sets: '6-2 6-2', round: 'Quarterfinal' });
    expect(rows[0].aFlag).toContain('ukr.png');
    expect(rows[0].bFlag).toBeNull();
    expect(rows[1].tour).toBe('ATP');
  });

  it('handles an empty event', () => {
    expect(mapTennisEvent(null)).toEqual([]);
  });
});

describe('mapTennis', () => {
  it('merges distinct events live-first then upcoming then freshest finals', () => {
    const live = match({ status: { type: { state: 'in', shortDetail: 'Set 2' } }, date: '2026-07-19T14:00Z' });
    const pre = match({ status: { type: { state: 'pre', shortDetail: '7/19 - 3:00 PM EDT' } }, date: '2026-07-19T19:00Z' });
    const oldFinal = match({ date: '2026-07-18T12:00Z' });
    const newFinal = match({ date: '2026-07-19T10:00Z' });
    const atp = tourPayload('Nordea Open', [{ grouping: { displayName: "Men's Singles" }, competitions: [oldFinal, pre] }]);
    const wta = tourPayload('Hungarian GP', [{ grouping: { displayName: "Women's Singles" }, competitions: [newFinal, live] }]);
    const vm = mapTennis(atp, wta);
    expect(vm.name).toBe('Nordea Open · Hungarian GP');
    expect(vm.rows.map((r) => r.state)).toEqual(['in', 'pre', 'post', 'post']);
    // Freshest final first within post; date prefix stripped from pre detail.
    expect(vm.rows[2].t).toBeGreaterThan(vm.rows[3].t);
    expect(vm.rows[1].detail).toBe('3:00 PM EDT');
  });

  it('dedupes when both feeds carry the same combined event', () => {
    const groupings = [
      { grouping: { displayName: "Men's Singles" }, competitions: [match({ id: 'm1' })] },
      { grouping: { displayName: "Women's Singles" }, competitions: [match({ id: 'm2' })] },
    ];
    const vm = mapTennis(tourPayload('Nordea Open', groupings, '306'), tourPayload('Nordea Open', groupings, '306'));
    expect(vm.name).toBe('Nordea Open');
    expect(vm.rows).toHaveLength(2);
    expect(vm.rows.map((r) => r.tour).sort()).toEqual(['ATP', 'WTA']);
  });

  it('tolerates one tour failing entirely', () => {
    const vm = mapTennis(null, tourPayload('Nordea Open', [{ grouping: { displayName: "Women's Singles" }, competitions: [match()] }]));
    expect(vm.rows).toHaveLength(1);
    expect(vm.name).toBe('Nordea Open');
  });
});
