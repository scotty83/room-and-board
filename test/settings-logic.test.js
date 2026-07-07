/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import {
  boroughs,
  linesForBorough,
  stationsForLine,
  alphaSections,
  moveWidget,
  toggleIn,
} from '../site/js/settings/pickers.js';
import { connectBridge } from '../site/js/bridge.js';

const SUBWAY = [
  { id: '631', name: 'Grand Central-42 St', borough: 'Manhattan', lines: ['4', '5', '6'] },
  { id: 'R16', name: 'Times Sq-42 St', borough: 'Manhattan', lines: ['N', 'Q', 'R', 'W'] },
  { id: 'R01', name: 'Astoria-Ditmars Blvd', borough: 'Queens', lines: ['N', 'W'] },
];

describe('subway pickers', () => {
  it('lists boroughs and lines', () => {
    expect(boroughs(SUBWAY)).toEqual(['Manhattan', 'Queens']);
    expect(linesForBorough(SUBWAY, 'Manhattan')).toEqual(['4', '5', '6', 'N', 'Q', 'R', 'W']);
  });
  it('lists stations serving a line in a borough', () => {
    expect(stationsForLine(SUBWAY, 'Manhattan', 'N').map((s) => s.id)).toEqual(['R16']);
    expect(stationsForLine(SUBWAY, 'Queens', 'N').map((s) => s.id)).toEqual(['R01']);
  });
});

describe('alphaSections', () => {
  it('groups stations by first letter', () => {
    const sections = alphaSections([
      { id: '1', name: 'Albertson' },
      { id: '2', name: 'Amityville' },
      { id: '3', name: 'Babylon' },
    ]);
    expect(sections).toEqual([
      { letter: 'A', stations: [{ id: '1', name: 'Albertson' }, { id: '2', name: 'Amityville' }] },
      { letter: 'B', stations: [{ id: '3', name: 'Babylon' }] },
    ]);
  });
});

describe('moveWidget', () => {
  it('moves ids up and down with clamping', () => {
    expect(moveWidget(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveWidget(['a', 'b', 'c'], 'b', +1)).toEqual(['a', 'c', 'b']);
    expect(moveWidget(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveWidget(['a', 'b', 'c'], 'zz', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('toggleIn', () => {
  it('adds and removes without mutating', () => {
    const list = ['4', '6'];
    expect(toggleIn(list, '5')).toEqual(['4', '6', '5']);
    expect(toggleIn(list, '4')).toEqual(['6']);
    expect(list).toEqual(['4', '6']);
  });
});

describe('connectBridge', () => {
  function mockWS() {
    const instances = [];
    class WS {
      constructor(url) {
        this.url = url;
        this.sent = [];
        instances.push(this);
      }
      send(data) {
        this.sent.push(JSON.parse(data));
      }
      close() {
        this.closed = true;
      }
    }
    return { WS, instances };
  }

  it('connects with credentials in the URL and sends framed configs', async () => {
    const { WS, instances } = mockWS();
    const p = connectBridge({ u: 'bridge', p: 's3cret', ip: '10.1.2.3' }, { WS, timeoutMs: 1000 });
    const ws = instances[0];
    expect(ws.url).toBe('wss://bridge:s3cret@10.1.2.3/ws');
    ws.onopen();
    const bridge = await p;

    const sendP = bridge.sendConfig('ENCODEDCFG');
    expect(ws.sent[0].method).toBe('xCommand/Message/Send');
    expect(ws.sent[0].params.Text).toBe('sgn1:ENCODEDCFG');
    ws.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: ws.sent[0].id, result: {} }) });
    await expect(sendP).resolves.toBeUndefined();

    const resetP = bridge.sendReset();
    expect(ws.sent[1].params.Text).toBe('sgn1-reset');
    ws.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: ws.sent[1].id, result: {} }) });
    await expect(resetP).resolves.toBeUndefined();
  });

  it('rejects the connect on timeout', async () => {
    vi.useFakeTimers();
    const { WS } = mockWS();
    const p = connectBridge({ u: 'u', p: 'p', ip: '10.0.0.1' }, { WS, timeoutMs: 5000 });
    const guard = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(5001);
    await guard;
    vi.useRealTimers();
  });

  it('rejects sends that never get a reply', async () => {
    vi.useFakeTimers();
    const { WS, instances } = mockWS();
    const p = connectBridge({ u: 'u', p: 'p', ip: '10.0.0.1' }, { WS, timeoutMs: 5000 });
    instances[0].onopen();
    const bridge = await p;
    const sendP = bridge.sendConfig('X');
    const guard = expect(sendP).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(5001);
    await guard;
    vi.useRealTimers();
  });

  it('rejects when auth is incomplete', async () => {
    await expect(connectBridge({ u: 'u', p: 'p', ip: null }, {})).rejects.toThrow(/ip/i);
  });
});

// Every widget id must have a label in BOTH settings surfaces — a missing
// entry renders literal "undefined" in the Widgets and Diagnostics menus.
import { WIDGET_IDS as ALL_IDS } from '../site/js/config.js';
import { WIDGET_LABELS as BOARD_LABELS } from '../site/js/settings/settings.js';

describe('widget label coverage', () => {
  it('board settings labels cover every widget id', () => {
    for (const id of ALL_IDS) expect(BOARD_LABELS[id], id).toBeTruthy();
  });
});

import { WIDGET_GROUPS } from '../site/js/config.js';

describe('WIDGET_GROUPS taxonomy', () => {
  it('is an exact partition of WIDGET_IDS (every id in exactly one group, no extras)', () => {
    const grouped = WIDGET_GROUPS.flatMap((g) => g.ids);
    // no duplicates across groups
    expect(new Set(grouped).size).toBe(grouped.length);
    // same membership as WIDGET_IDS, both directions
    expect([...grouped].sort()).toEqual([...ALL_IDS].sort());
  });

  it('has the six expected group labels in order', () => {
    expect(WIDGET_GROUPS.map((g) => g.label)).toEqual([
      'Commute', 'Weather & Air', 'Markets & Sports', 'News & Social', 'Ambient', 'Daily Extras',
    ]);
  });
});

import { mountKeyboard } from '../site/js/settings/keyboard.js';
describe('mountKeyboard', () => {
  it('types, shifts to uppercase, backspaces, and submits the value', () => {
    const host = document.createElement('div');
    let submitted = null;
    const kb = mountKeyboard(host, { onSubmit: (v) => (submitted = v) });
    host.querySelector('[data-k="b"]').click();
    host.querySelector('[data-act="shift"]').click();
    host.querySelector('[data-k="A"]').click(); // uppercase key present after shift
    host.querySelector('[data-k="1"]').click();
    expect(kb.value()).toBe('bA1');
    host.querySelector('[data-act="back"]').click();
    expect(kb.value()).toBe('bA');
    host.querySelector('[data-act="submit"]').click();
    expect(submitted).toBe('bA');
  });
});

import { widgetChecksHtml, WIDGET_LABELS as SETUP_LABELS } from '../site/js/settings/setup.js';

describe('widgetChecksHtml (setup picker)', () => {
  it('renders six grouped sections, one checkbox per widget, reflecting the placed set', () => {
    const html = widgetChecksHtml(SETUP_LABELS, new Set(['subway', 'photos']));
    for (const label of ['Commute', 'Weather & Air', 'Markets & Sports', 'News & Social', 'Ambient', 'Daily Extras']) {
      expect(html).toContain(`<h3 class="wpick__title">${label}</h3>`);
    }
    expect((html.match(/data-w="/g) || []).length).toBe(ALL_IDS.length); // 21 checkboxes
    // placed widgets are checked
    expect(html).toMatch(/data-w="subway"[^>]*checked/);
    expect(html).toMatch(/data-w="photos"[^>]*checked/);
    // an unplaced widget is not checked
    expect(html).not.toMatch(/data-w="lirr"[^>]*checked/);
    // uses the passed (phone) labels
    expect(html).toContain('Metro-North (GCT)');
  });
});

import { widgetGroupsHtml } from '../site/js/settings/settings.js';

describe('widgetGroupsHtml', () => {
  it('renders all six group headers and one toggle per widget with correct on-state', () => {
    const html = widgetGroupsHtml([{ id: 'weather', x: 0, y: 0, w: 4, h: 4 }]);
    // six group headers
    for (const label of ['Commute', 'Weather & Air', 'Markets & Sports', 'News & Social', 'Ambient', 'Daily Extras']) {
      expect(html).toContain(`<h3 class="wgroup__title">${label}</h3>`);
    }
    // one toggle per WIDGET_ID (21)
    expect((html.match(/data-toggle="/g) || []).length).toBe(ALL_IDS.length);
    // weather is placed → its toggle is on
    expect(html).toMatch(/data-toggle="weather"[^>]*aria-checked="true"/);
    // subway is not placed → not on
    expect(html).toMatch(/class="toggle "[^>]*data-toggle="subway"/);
  });

  it('disables a widget that cannot fit (no room) and labels it', () => {
    // one widget filling the whole 12x8 grid leaves no room for others
    const html = widgetGroupsHtml([{ id: 'weather', x: 0, y: 0, w: 12, h: 8 }]);
    expect(html).toMatch(/data-toggle="subway"[^>]*disabled/);
    expect(html).toContain('(no room — resize others first)');
    // the placed, full-size widget is still shown as on
    expect(html).toMatch(/data-toggle="weather"[^>]*aria-checked="true"/);
  });
});

import { NAV_MODEL, navGroupForSection, SECTION_IDS } from '../site/js/settings/settings.js';

describe('settings nav model', () => {
  it('navGroupForSection maps grouped sections and returns null for pinned', () => {
    expect(navGroupForSection('mnr')).toBe('Commute');
    expect(navGroupForSection('photos')).toBe('Ambient');
    expect(navGroupForSection('markets')).toBe('Markets & Sports');
    expect(navGroupForSection('widgets')).toBeNull();
    expect(navGroupForSection('diag')).toBeNull();
  });
  it('NAV_MODEL covers exactly the valid section ids (none missing or orphaned)', () => {
    const navIds = NAV_MODEL.flatMap((e) => (e.type === 'group' ? e.items.map(([id]) => id) : [e.id]));
    expect(new Set(navIds).size).toBe(navIds.length); // no dupes
    expect([...navIds].sort()).toEqual([...SECTION_IDS].sort());
  });
});

import { stepTwoVisibility, SETUP_SECTIONS } from '../site/js/settings/setup.js';

describe('stepTwoVisibility', () => {
  it('shows only the sections + divider groups for the placed widgets', () => {
    const { sections, groups } = stepTwoVisibility(['subway', 'lirr']);
    expect([...sections].sort()).toEqual(['lirr-field', 'subway-field']);
    expect([...groups]).toEqual(['Commute']);
  });
  it('shows the Weather location section when Air & Sky (aqi) is placed (shared trigger)', () => {
    const { sections, groups } = stepTwoVisibility(new Set(['aqi']));
    expect(sections.has('weather-field')).toBe(true);
    expect(groups.has('Weather & Air')).toBe(true);
  });
  it('shows nothing for config-less widgets', () => {
    const { sections, groups } = stepTwoVisibility(['worldcup', 'history']);
    expect(sections.size).toBe(0);
    expect(groups.size).toBe(0);
  });
  it('SETUP_SECTIONS triggers are valid WIDGET_IDS and groups are valid WIDGET_GROUPS labels', () => {
    const validIds = new Set(ALL_IDS);
    const validGroups = new Set(WIDGET_GROUPS.map((g) => g.label));
    for (const s of SETUP_SECTIONS) {
      for (const t of s.triggers) expect(validIds.has(t)).toBe(true);
      expect(validGroups.has(s.group)).toBe(true);
    }
  });
});
