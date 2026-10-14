import { describe, it, expect } from 'vitest';
import { calculateCableSection } from './cableSection';
const base = {
  phases: '1',
  loadMode: 'current',
  load: '16',
  voltage: '230',
  cosPhi: '1',
  length: '20',
  material: 'copper',
  method: 'C',
  temperature: '30',
  circuits: '1',
  soilResistivity: '2.5',
  maxDropPercent: '3',
  upstreamDropPercent: '0',
  breaker: '',
};
describe('section selection', () => {
  it('выбирает сечение по падению напряжения, даже если меньшее проходит по току', () => {
    const r = calculateCableSection(base);
    expect(r.current).toBe(16);
    expect(r.rows[0].currentFits).toBe(true);
    expect(r.rows[0].dropFits).toBe(false);
    expect(r.selected.section).toBe(2.5);
    expect(r.selected.dropVolts).toBeCloseTo(6.0672, 4);
  });
  it('учитывает номинал защиты, нагрев группы и падение до линии', () => {
    const normal = calculateCableSection({
      ...base,
      phases: '3',
      voltage: '400',
      load: '20',
      length: '10',
      method: 'B2',
    });
    expect(normal.selected.section).toBe(2.5);
    const hot = calculateCableSection({
      ...base,
      phases: '3',
      voltage: '400',
      load: '20',
      length: '10',
      method: 'B2',
      temperature: '40',
      circuits: '3',
      breaker: '25',
    });
    expect(hot.selected.section).toBe(10);
    expect(hot.factor).toBeCloseTo(0.609);
    const drop = calculateCableSection({ ...base, upstreamDropPercent: '2.5' });
    expect(drop.selected.section).toBeGreaterThan(normal.selected.section);
  });
  it('различает 2 и 3 нагруженные жилы и проводит перевод активной мощности в ток', () => {
    const r = calculateCableSection({
      ...base,
      phases: '3',
      loadMode: 'power',
      load: '10',
      voltage: '400',
      cosPhi: '0.8',
    });
    expect(r.current).toBeCloseTo(18.0421959);
    expect(r.rows[0].baseAmpacity).toBe(17.5);
    expect(calculateCableSection(base).rows[0].baseAmpacity).toBe(19.5);
  });
  it('отказывается от неподдерживаемого грунтового группирования и неверных значений', () => {
    expect(
      calculateCableSection({ ...base, method: 'D1', circuits: '2' }).errors
        .circuits
    ).toBeTruthy();
    for (const field of [
      'load',
      'voltage',
      'length',
      'cosPhi',
      'temperature',
      'maxDropPercent',
    ])
      expect(
        calculateCableSection({ ...base, [field]: '' }).selected
      ).toBeNull();
    expect(
      calculateCableSection({ ...base, breaker: '10' }).errors.breaker
    ).toBeTruthy();
  });
  it('не обещает решение вне диапазона таблицы', () => {
    const r = calculateCableSection({ ...base, load: '1000', length: '1000' });
    expect(r.errors).toEqual({});
    expect(r.selected).toBeNull();
    expect(r.rows).toHaveLength(12);
  });
});
