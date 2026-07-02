import { describe, it, expect } from 'vitest';
import { registerWidget, activeWidgets, clearRegistry } from '../site/js/registry.js';
import { chooseBootConfig } from '../site/js/boot.js';
import { parseFragment } from '../site/js/bridge.js';
import { greetingFor } from '../site/js/widgets/clock.js';
import { normalizeConfig, encodeConfig } from '../site/js/config.js';

describe('registry', () => {
  it('returns widgets in config order, skipping unknown and inactive ids', () => {
    clearRegistry();
    const mk = (id) => ({ meta: { id, title: id, refreshMs: 1000 }, render() {} });
    registerWidget(mk('weather'));
    registerWidget(mk('subway'));
    registerWidget(mk('art'));
    const cfg = { widgets: ['art', 'bogus', 'weather'] };
    expect(activeWidgets(cfg).map((w) => w.meta.id)).toEqual(['art', 'weather']);
  });
});

describe('chooseBootConfig', () => {
  const older = normalizeConfig({ name: 'Old', t: 100 });
  const newer = normalizeConfig({ name: 'New', t: 200 });
  it('prefers the newest source and reports it', () => {
    expect(chooseBootConfig(newer, older)).toEqual({ cfg: newer, source: 'fragment' });
    expect(chooseBootConfig(older, newer)).toEqual({ cfg: newer, source: 'local' });
    expect(chooseBootConfig(null, older)).toEqual({ cfg: older, source: 'local' });
    expect(chooseBootConfig(older, null)).toEqual({ cfg: older, source: 'fragment' });
    expect(chooseBootConfig(null, null)).toEqual({ cfg: null, source: 'none' });
  });
});

describe('parseFragment', () => {
  it('extracts cfg and auth from the hash', async () => {
    const enc = await encodeConfig(normalizeConfig({ name: 'Sean' }));
    const auth = btoa(JSON.stringify({ u: 'bridge', p: 'secret', ip: '10.0.0.5' }))
      .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const out = parseFragment(`#cfg=${enc}&auth=${auth}`);
    expect(out.cfg).toBe(enc);
    expect(out.auth).toEqual({ u: 'bridge', p: 'secret', ip: '10.0.0.5' });
  });
  it('tolerates empty, partial and malformed hashes', () => {
    expect(parseFragment('')).toEqual({ cfg: null, auth: null });
    expect(parseFragment('#')).toEqual({ cfg: null, auth: null });
    expect(parseFragment('#cfg=abc')).toEqual({ cfg: 'abc', auth: null });
    expect(parseFragment('#auth=!!!bad')).toEqual({ cfg: null, auth: null });
    expect(parseFragment('#demo=1&cfg=x')).toEqual({ cfg: 'x', auth: null });
  });
});

describe('greetingFor', () => {
  it('varies by hour and includes the name when set', () => {
    expect(greetingFor('Sean', new Date(2026, 6, 2, 8))).toBe('Good morning, Sean');
    expect(greetingFor('Sean', new Date(2026, 6, 2, 13))).toBe('Good afternoon, Sean');
    expect(greetingFor('Sean', new Date(2026, 6, 2, 19))).toBe('Good evening, Sean');
    expect(greetingFor('', new Date(2026, 6, 2, 19))).toBe('Good evening');
  });
});
