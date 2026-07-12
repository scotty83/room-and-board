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
  applyNameKey,
  searchStations,
  nameAutoCap,
  NAME_MAX_LEN,
  expressRoutes,
  directionsForRoute,
  stopsForRouteDir,
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

describe('applyNameKey (Display name keypad)', () => {
  // Drive the pure reducer through a key sequence, returning the final value.
  const type = (keys, start = '') => {
    let s = { value: start, shift: nameAutoCap(start) };
    for (const k of keys) s = applyNameKey(s, k);
    return s.value;
  };
  const letters = (word) => word.toUpperCase().split(''); // buttons emit A-Z

  it('auto-capitalizes each word hands-free', () => {
    expect(type([...letters('sean'), 'Space', ...letters('scott')])).toBe('Sean Scott');
  });
  it('types interior capitals via a momentary Shift (camelCase)', () => {
    expect(type([...letters('mc'), 'Shift', ...letters('donald')])).toBe('McDonald');
    expect(type([...letters('de'), 'Shift', ...letters('angelo')])).toBe('DeAngelo');
  });
  it('supports hyphenated names and auto-caps after the hyphen', () => {
    expect(type([...letters('jean'), '-', ...letters('paul')])).toBe('Jean-Paul');
    expect(type([...letters('mary'), '-', ...letters('kate')])).toBe('Mary-Kate');
  });
  it('lets Shift turn OFF the auto-capital for lowercase particles', () => {
    expect(type(['Shift', ...letters('van'), 'Space', 'Shift', ...letters('gogh')])).toBe('van gogh');
  });
  it('restores auto-cap state on backspace', () => {
    expect(applyNameKey({ value: 'Sean ', shift: true }, 'Backspace')).toEqual({ value: 'Sean', shift: false });
    expect(applyNameKey({ value: 'S', shift: false }, 'Backspace')).toEqual({ value: '', shift: true });
  });
  it('never leads with, doubles, or exceeds the cap on separators', () => {
    expect(applyNameKey({ value: '', shift: true }, 'Space')).toEqual({ value: '', shift: true });
    expect(applyNameKey({ value: 'Jo', shift: false }, '-')).toEqual({ value: 'Jo-', shift: true });
    expect(applyNameKey({ value: 'Jo-', shift: true }, '-')).toEqual({ value: 'Jo-', shift: true });
    const full = 'A'.repeat(NAME_MAX_LEN);
    expect(applyNameKey({ value: full, shift: false }, 'B').value).toBe(full);
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

import { NAV_MODEL, navGroupForSection, SECTION_IDS, navHtml } from '../site/js/settings/settings.js';

describe('settings nav model', () => {
  it('navGroupForSection maps grouped sections and returns null for pinned/standalone', () => {
    expect(navGroupForSection('mnr')).toBe('Commute');
    expect(navGroupForSection('photos')).toBe('Images');
    expect(navGroupForSection('news')).toBe('News & Social');
    expect(navGroupForSection('widgets')).toBeNull(); // pinned
    expect(navGroupForSection('markets')).toBe('Markets'); // now a group with marketsnews
    expect(navGroupForSection('marketsnews')).toBe('Markets'); // grouped under Markets
    expect(navGroupForSection('sports')).toBeNull(); // standalone
    expect(navGroupForSection('weather')).toBeNull(); // standalone
    expect(navGroupForSection('worldclock')).toBeNull(); // standalone (pulled out of Images)
    expect(navGroupForSection('diag')).toBeNull();
    expect(navGroupForSection('nope')).toBeNull(); // unknown
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

describe('navHtml', () => {
  it('renders pinned items + group headers; children live in a wrapper that is closed until open', () => {
    const html = navHtml('widgets', null);
    expect(html).toContain('data-section="widgets"');          // pinned item
    expect(html).toContain('data-group="Commute"');            // group header
    expect(html).toMatch(/data-group="Commute"[^>]*aria-expanded="false"/);
    // children are always in the DOM (for the collapse animation); no group wrapper is open
    expect(html).toContain('data-section="subway"');
    expect((html.match(/settings__navkids is-open/g) || []).length).toBe(0);
    // active pinned item highlighted
    expect(html).toMatch(/class="settings__navitem is-active"[^>]*data-section="widgets"/);
  });
  it('opens exactly the active group wrapper with the active child highlighted', () => {
    const html = navHtml('subway', 'Commute');
    expect(html).toMatch(/data-group="Commute"[^>]*aria-expanded="true"/);
    expect((html.match(/settings__navkids is-open/g) || []).length).toBe(1); // only Commute open
    expect(html).toMatch(/settings__navchild is-active"[^>]*data-section="subway"/);
  });
});

const BUS = {
  routes: [
    { id: 'QM24', lineRef: 'MTABC_QM24', dirs: [
      { id: 0, headsign: 'Manhattan', stops: ['a', 'b'] },
      { id: 1, headsign: 'Bayside', stops: ['b', 'a'] } ] },
    { id: 'X27', lineRef: 'MTA NYCT_X27', dirs: [ { id: 0, headsign: 'Downtown', stops: ['c'] } ] },
  ],
  stops: { a: 'Madison Av / E 34 St', b: '5 Av / W 57 St', c: 'Water St' },
};

describe('express bus pickers', () => {
  it('lists routes with their lineRef', () => {
    expect(expressRoutes(BUS)).toEqual([
      { id: 'QM24', lineRef: 'MTABC_QM24' }, { id: 'X27', lineRef: 'MTA NYCT_X27' }]);
  });
  it('lists a route directions by headsign', () => {
    expect(directionsForRoute(BUS, 'QM24')).toEqual([
      { id: 0, headsign: 'Manhattan' }, { id: 1, headsign: 'Bayside' }]);
    expect(directionsForRoute(BUS, 'NOPE')).toEqual([]);
  });
  it('lists a route+direction stops in order with names', () => {
    expect(stopsForRouteDir(BUS, 'QM24', 1)).toEqual([
      { id: 'b', name: '5 Av / W 57 St' }, { id: 'a', name: 'Madison Av / E 34 St' }]);
    expect(stopsForRouteDir(BUS, 'QM24', 9)).toEqual([]);
  });
});

import { signageUrlFor } from '../site/js/settings/setup.js';

describe('signageUrlFor (non-touch boards)', () => {
  it('builds a cfg-only signage URL', () => {
    expect(signageUrlFor('signage.rvc.tech', 'AbC-_123')).toBe('https://signage.rvc.tech/#cfg=AbC-_123');
  });
  it('never carries auth', () => {
    expect(signageUrlFor('h.example', 'x')).not.toContain('auth');
  });
});

describe('searchStations (Citi Bike picker)', () => {
  const stations = [
    { id: 'a', name: 'W 29 St & 9 Ave' },
    { id: 'b', name: 'Broadway & W 29 St' },
    { id: 'c', name: '10 Ave & W 28 St' },
  ];
  it('includes already-chosen stations, marked added (the pre-populated-default bug)', () => {
    const out = searchStations(stations, 'W 29 ST', new Set(['a']));
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out[0].added).toBe(true);
    expect(out[1].added).toBe(false);
  });
  it('is case-insensitive and trims', () => {
    expect(searchStations(stations, '  w 28  ', new Set())).toHaveLength(1);
  });
  it('returns nothing under 2 chars and respects the cap', () => {
    expect(searchStations(stations, 'W', new Set())).toEqual([]);
    expect(searchStations(stations, 'W 2', new Set(), 1)).toHaveLength(1);
  });
});
