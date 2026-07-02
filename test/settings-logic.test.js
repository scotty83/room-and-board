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
