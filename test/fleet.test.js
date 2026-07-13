import { describe, it, expect } from 'vitest';
import { deviceId, beaconPayload } from '../site/js/fleet.js';
import { normalizeConfig } from '../site/js/config.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m };
};

describe('deviceId', () => {
  it('creates a uuid, persists it, and returns the same id next time', () => {
    const s = memStorage();
    const id = deviceId(s);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(s.map.get('sgn.device')).toBe(id);
    expect(deviceId(s)).toBe(id);
  });
  it('regenerates when the stored value is junk', () => {
    const s = memStorage({ 'sgn.device': '<script>alert(1)</script>' });
    expect(deviceId(s)).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('still returns an id when storage throws', () => {
    const broken = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } };
    expect(deviceId(broken)).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe('beaconPayload', () => {
  it('carries widget ids, mode, version, tz — and nothing personal', () => {
    const cfg = normalizeConfig({ name: 'Sean', mode: 'scheduled' });
    const p = beaconPayload(cfg, 'abc-123', '9d757c6ee919');
    expect(p.widgets).toEqual(cfg.layout.map((r) => r.id));
    expect(p.mode).toBe('scheduled');
    expect(p.version).toBe('9d757c6ee919');
    expect(typeof p.tz).toBe('string');
    expect(JSON.stringify(p)).not.toContain('Sean'); // no PII on the wire
  });
  it('falls back to unknown when the version fetch failed', () => {
    expect(beaconPayload(normalizeConfig({}), 'abc-123', null).version).toBe('unknown');
  });
});
