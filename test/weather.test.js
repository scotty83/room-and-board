import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mapWeather, wmoInfo } from '../site/js/widgets/weather.js';
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
  it('maps AQI value and category', async () => {
    const weatherVm = mapWeather(await fixture('open-meteo-forecast.json'), null);
    const vm = mapAqi(await fixture('open-meteo-aq.json'), weatherVm, new Date('2026-07-02T12:00:00'));
    expect(vm.aqi).toBe(66);
    expect(vm.category).toBe('Moderate');
    expect(vm.sunrise).toBe('2026-07-02T05:28');
    expect(vm.moonPhase.name).toBeTypeOf('string');
  });

  it('categorizes boundaries', async () => {
    const aq = (v) => ({ current: { us_aqi: v } });
    const w = { sunrise: 'x', sunset: 'y' };
    const d = new Date('2026-07-02');
    expect(mapAqi(aq(50), w, d).category).toBe('Good');
    expect(mapAqi(aq(101), w, d).category).toBe('Unhealthy for Sensitive Groups');
    expect(mapAqi(aq(250), w, d).category).toBe('Very Unhealthy');
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
