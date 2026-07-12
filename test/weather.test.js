import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mapWeather, wmoInfo, inUS, fetchData } from '../site/js/widgets/weather.js';
import { mapAqi, moonPhase } from '../site/js/widgets/aqi.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('mapWeather', () => {
  it('maps the open-meteo fixture', async () => {
    const vm = mapWeather(await fixture('open-meteo-forecast.json'), null);
    expect(vm.now.temp).toBe(83); // 82.9 rounded
    expect(vm.now.feels).toBe(92);
    expect(vm.now.label).toBe('Clear');
    expect(vm.hourly).toHaveLength(8);
    // current.time is 02:15 → first hourly slot is 03:00 (next full hour)
    expect(vm.hourly[0].h).toBe('3 AM');
    expect(vm.daily).toHaveLength(5);
    expect(vm.daily[0].hi).toBe(105);
    expect(vm.daily[0].lo).toBe(80);
    expect(vm.sunrise).toBe('2026-07-02T05:28');
    expect(vm.sunset).toBe('2026-07-02T20:30');
    expect(vm.alert).toBeNull();
  });

  it('surfaces the most severe active alert', async () => {
    const vm = mapWeather(
      await fixture('open-meteo-forecast.json'),
      await fixture('nws-alerts.json'),
    );
    expect(vm.alert).not.toBeNull();
    expect(vm.alert.event).toMatch(/Heat/);
    expect(typeof vm.alert.headline).toBe('string');
  });

  it('tolerates malformed alerts payloads', async () => {
    const forecast = await fixture('open-meteo-forecast.json');
    expect(mapWeather(forecast, {}).alert).toBeNull();
    expect(mapWeather(forecast, { features: 'nope' }).alert).toBeNull();
  });
});

describe('wmoInfo', () => {
  it('maps representative codes', () => {
    expect(wmoInfo(0)).toEqual({ label: 'Clear', icon: 'clear' });
    expect(wmoInfo(3).label).toBe('Overcast');
    expect(wmoInfo(45).icon).toBe('fog');
    expect(wmoInfo(63).icon).toBe('rain');
    expect(wmoInfo(75).icon).toBe('snow');
    expect(wmoInfo(95).icon).toBe('thunder');
    expect(wmoInfo(9999)).toEqual({ label: '—', icon: 'clear' });
  });
});

describe('mapAqi', () => {
  it('maps AQI value, category and its own sun times', async () => {
    // Sun times come from the widget's own forecast call, not the weather
    // widget's cache (which may not exist or may be disabled entirely).
    const sunJson = await fixture('open-meteo-forecast.json');
    const vm = mapAqi(await fixture('open-meteo-aq.json'), sunJson, new Date('2026-07-02T12:00:00'));
    expect(vm.aqi).toBe(66);
    expect(vm.category).toBe('Moderate');
    expect(vm.sunrise).toBe('2026-07-02T05:28');
    expect(vm.sunset).toBe('2026-07-02T20:30');
    expect(vm.moonPhase.name).toBeTypeOf('string');
  });

  it('degrades to null sun times when the forecast call fails', async () => {
    const vm = mapAqi(await fixture('open-meteo-aq.json'), null, new Date('2026-07-02T12:00:00'));
    expect(vm.aqi).toBe(66);
    expect(vm.sunrise).toBeNull();
    expect(vm.sunset).toBeNull();
  });

  it('categorizes boundaries', async () => {
    const aq = (v) => ({ current: { us_aqi: v } });
    const d = new Date('2026-07-02');
    expect(mapAqi(aq(50), null, d).category).toBe('Good');
    expect(mapAqi(aq(101), null, d).category).toBe('Sensitive groups');
    expect(() => mapAqi({ current: { us_aqi: null } }, null, d)).toThrow();
    expect(() => mapAqi({ current: {} }, null, d)).toThrow();
    expect(mapAqi(aq(101), null, d).uv).toBeNull();
    expect(mapAqi(aq(40), { daily: { uv_index_max: [6.4] } }, d).uv).toBe(6);
    expect(mapAqi(aq(250), null, d).category).toBe('Very Unhealthy');
  });
});

describe('moonPhase', () => {
  it('finds the new moon on 2026-01-18', () => {
    const p = moonPhase(new Date(Date.UTC(2026, 0, 18, 20, 0)));
    expect(p.fraction).toBeLessThan(0.04);
    expect(p.name).toBe('New Moon');
  });
  it('finds the full moon on 2026-02-01', () => {
    const p = moonPhase(new Date(Date.UTC(2026, 1, 1, 22, 0)));
    expect(Math.abs(p.fraction - 0.5)).toBeLessThan(0.02);
    expect(p.name).toBe('Full Moon');
  });
});

describe('inUS + alerts gating', () => {
  it('covers NYC, Honolulu, Anchorage; excludes London and Berlin', () => {
    expect(inUS(40.75, -73.99)).toBe(true);
    expect(inUS(21.3, -157.8)).toBe(true);
    expect(inUS(61.2, -149.9)).toBe(true);
    expect(inUS(51.5, -0.12)).toBe(false);
    expect(inUS(52.52, 13.4)).toBe(false);
  });
  it('fetchData skips the NWS alerts call for a non-US point', async () => {
    const urls = [];
    const net = { fetchJSON: async (u) => { urls.push(u); return { current: { time: '2026-07-12T10:00', temperature_2m: 70, apparent_temperature: 70, weather_code: 0 }, hourly: { time: [], temperature_2m: [], weather_code: [] }, daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], sunrise: ['x'], sunset: ['x'] } }; } };
    await fetchData({ loc: { lat: 51.5, lon: -0.12, units: 'C' } }, net);
    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain('api.weather.gov');
  });
});
