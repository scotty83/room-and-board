import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mapMtaAlerts } from '../worker/src/alerts.js';
import { mapNjtMessages } from '../worker/src/njt.js';
import { filterByCats } from '../site/js/widgets/art.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('mapMtaAlerts', () => {
  it('digests the recorded subway feed: active only, routes, clean headers', async () => {
    const json = await fixture('mta-alerts-subway.json');
    const nowSec = json.entity[0].alert.active_period[0].start + 60;
    const alerts = mapMtaAlerts(json, nowSec);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(Array.isArray(a.routes)).toBe(true);
      expect(a.header.length).toBeGreaterThan(10);
      expect(a.header.startsWith('[')).toBe(false); // route tokens stripped
    }
  });
  it('drops alerts whose active window has passed', () => {
    const json = { entity: [{ alert: { active_period: [{ start: 100, end: 200 }], informed_entity: [{ route_id: 'A' }], header_text: { translation: [{ text: 'old news here', language: 'en' }] } } }] };
    expect(mapMtaAlerts(json, 500)).toEqual([]);
    expect(mapMtaAlerts(json, 150)).toHaveLength(1);
  });
  it('dedupes repeated headers', () => {
    const entity = (route) => ({ alert: { informed_entity: [{ route_id: route }], header_text: { translation: [{ text: 'Same alert text for both.', language: 'en' }] } } });
    expect(mapMtaAlerts({ entity: [entity('A'), entity('C')] }, 0)).toHaveLength(1);
  });
});

describe('mapNjtMessages', () => {
  it('strips html and empty messages', () => {
    const out = mapNjtMessages({ STATIONMSGS: [
      { MSG_TEXT: '<p>Track work <strong>this weekend</strong>.</p>' },
      { MSG_TEXT: '  ' },
    ]});
    expect(out).toHaveLength(1);
    expect(out[0].header).toBe('Track work this weekend .');
    expect(out[0].header).not.toContain('<');
  });
});

describe('filterByCats', () => {
  const manifest = [
    { title: 'a', cat: 'european' },
    { title: 'b', cat: 'american' },
    { title: 'c', cat: 'asian' },
    { title: 'd' }, // uncategorized always passes
  ];
  it('filters to selected categories, keeps uncategorized', () => {
    expect(filterByCats(manifest, ['asian']).map((a) => a.title)).toEqual(['c', 'd']);
    expect(filterByCats(manifest, [])).toHaveLength(4);
    expect(filterByCats(manifest, undefined)).toHaveLength(4);
  });
  it('never filters to an empty slideshow', () => {
    expect(filterByCats([{ title: 'x', cat: 'european' }], ['asian'])).toHaveLength(1);
  });
});
