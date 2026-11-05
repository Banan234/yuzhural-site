import { describe, it, expect } from 'vitest';
import control from './__fixtures__/calculators-control.json';
import {
  AIR_TEMPERATURE_FACTORS,
  GROUND_TEMPERATURE_FACTORS,
  SOIL_FACTORS,
  calculateCableSection,
} from '../../shared/cableSection.js';
import {
  calculateCableMass,
  calculateMassWithDrums,
  getCableMassRows,
  getCableDiameterRange,
  CABLE_MASS_ENTRIES,
  CABLE_MASS_SOURCES,
} from './cableMass.js';
import {
  estimateWoundLength,
  lengthFromNetMass,
  calculateShipment,
  estimateTransportFit,
} from './cableLogistics.js';
const close = (a, b) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(1, Math.abs(b)) * 1e-11);
describe('independent document/Decimal control', () => {
  it('matches every published temperature/soil table coefficient', () => {
    expect(AIR_TEMPERATURE_FACTORS).toEqual(control.factorTables.air);
    expect(GROUND_TEMPERATURE_FACTORS).toEqual(control.factorTables.ground);
    expect(SOIL_FACTORS).toEqual(control.factorTables.soil);
  });

  it.each(control.sections)(
    '$id all table rows, current, drop, selected section',
    (c) => {
      const r = calculateCableSection(c.input);
      expect(r.errors).toEqual({});
      close(r.current, c.current);
      close(r.factor, c.factor);
      expect(r.selected?.section ?? null).toBe(c.selected);
      expect(r.rows.length).toBe(c.rows.length);
      for (const e of c.rows) {
        const a = r.rows.find((x) => x.section === e.section);
        expect(a.baseAmpacity).toBe(e.baseAmpacity);
        close(a.ampacity, e.ampacity);
        close(a.dropVolts, e.dropVolts);
        close(a.dropPercent, e.dropPercent);
        expect(a.fits).toBe(e.fits);
      }
    }
  );
  it.each(control.geometry)('explicit turn-by-turn control $input', (c) => {
    const a = estimateWoundLength(c.input);
    close(a.lengthM, c.lengthM);
    expect(a.layers).toBe(c.layers);
    expect(a.turns).toBe(c.turns);
  });
  it('manufacturer mass/diameter sample and independent kg/km conversion', () => {
    const rows = getCableMassRows({
      mark: 'ВВГнг(А)-LS',
      configuration: '1×1,5ок',
      voltageKv: 0.66,
    });
    expect(rows.map((x) => x.massKgPerKm).sort((a, b) => a - b)).toEqual([
      48, 51,
    ]);
    expect(getCableDiameterRange(rows)).toEqual({ minMm: 5.3, maxMm: 5.5 });
    const mass = calculateCableMass(rows, '125,5');
    close(mass.minKg, 6.024);
    close(mass.maxKg, 6.4005);
    const custom = calculateMassWithDrums(mass, '12,5', 2);
    close(custom.minKg, 31.024);
    close(custom.maxKg, 31.4005);
    expect(calculateCableMass([], 100)).toBeNull();
    expect(getCableDiameterRange([{ massKgPerKm: 1 }])).toBeNull();
    expect(
      getCableMassRows({
        mark: 'NO-SUCH-MARK',
        configuration: '1х1,5',
        voltageKv: 0.66,
      })
    ).toEqual([]);
    expect(
      getCableMassRows({
        mark: 'ВВГнг(А)-LS',
        configuration: '999х999',
        voltageKv: 0.66,
      })
    ).toEqual([]);
    expect(
      getCableMassRows({
        mark: 'ВВГнг(А)-LS',
        configuration: '1х1,5ок',
        voltageKv: 35,
      })
    ).toEqual([]);
  });
  it('net mass removes tare and converts km to m', () => {
    expect(lengthFromNetMass('50', '500')).toBe(100);
    expect(lengthFromNetMass('12,5', '500')).toBe(25);
  });
  it.each(['', 0, -1, 'NaN', 'Infinity', '1e309'])(
    'rejects invalid positive input %s',
    (x) => {
      expect(calculateCableMass([{ massKgPerKm: 48 }], x)).toBeNull();
      expect(lengthFromNetMass(x, 500)).toBeNull();
      expect(
        estimateWoundLength({
          cableDiameterMm: x,
          coreDiameterMm: 500,
          windingDiameterMm: 900,
          widthMm: 500,
        })
      ).toBeNull();
      expect(
        calculateShipment([
          { lengthM: x, widthM: 1, heightM: 1, massKg: 1, count: 1 },
        ])
      ).toBeNull();
    }
  );
  it('guards geometry/source/overflow/count boundaries', () => {
    expect(
      estimateWoundLength({
        cableDiameterMm: 20,
        coreDiameterMm: 900,
        windingDiameterMm: 500,
        widthMm: 500,
      })
    ).toBeNull();
    expect(
      estimateWoundLength({
        cableDiameterMm: 20,
        coreDiameterMm: 500,
        windingDiameterMm: 100001,
        widthMm: 500,
      })
    ).toBeNull();
    expect(
      estimateWoundLength({
        cableDiameterMm: 1e-308,
        coreDiameterMm: 500,
        windingDiameterMm: 900,
        widthMm: 500,
      })
    ).toBeNull();
    expect(calculateCableMass([{ massKgPerKm: 48 }], 1e308)).toBeNull();
    expect(calculateCableMass([{ massKgPerKm: NaN }], 100)).toBeNull();
    expect(calculateMassWithDrums({ minKg: 1, maxKg: 2 }, 12, 0.5)).toBeNull();
    expect(
      calculateMassWithDrums({ minKg: 1, maxKg: 2 }, 1e308, 100)
    ).toBeNull();
    expect(lengthFromNetMass(1e308, 1e-308)).toBeNull();
    const box = { lengthM: 1, widthM: 1, heightM: 1, massKg: 1, count: 1 };
    for (const patch of [
      { count: 0.5 },
      { count: 10001 },
      { count: 0 },
      { count: -1 },
      { lengthM: 101 },
      { massKg: 1000001 },
    ])
      expect(calculateShipment([{ ...box, ...patch }])).toBeNull();
  });
  it('section input bounds, decimal comma and missing coefficients', () => {
    const base = control.sections.at(-1).input;
    for (const key of [
      'load',
      'voltage',
      'cosPhi',
      'length',
      'temperature',
      'maxDropPercent',
    ])
      for (const v of ['', 0, -1, '1e309'])
        expect(
          calculateCableSection({ ...base, [key]: v }).selected
        ).toBeNull();
    for (const patch of [
      { load: 1001 },
      { loadMode: 'power', load: 501 },
      { length: 10001 },
      { cosPhi: 1.01 },
      { circuits: 1.5 },
      { circuits: 10 },
      { method: 'D1', circuits: 2 },
      { method: 'UNKNOWN' },
      { method: 'D1', soilResistivity: 4 },
      { temperature: 32 },
      { material: 'steel' },
      { phases: 2 },
      { breaker: 10 },
      { upstreamDropPercent: 3 },
    ])
      expect(
        Object.keys(calculateCableSection({ ...base, ...patch }).errors).length
      ).toBeGreaterThan(0);
    expect(calculateCableSection({ ...base, load: '16,5' }).current).toBe(16.5);
    expect(calculateCableSection({ ...base, length: '0,5' }).errors).toEqual(
      {}
    );
    expect(
      calculateCableSection({ ...base, upstreamDropPercent: 0, breaker: '' })
        .errors
    ).toEqual({});
  });
  it('shipping exact decimal dimensions and floor area', () => {
    const a = calculateShipment([control.shipping.decimalSquare]);
    close(a.massKg, 6);
    close(a.volumeM3, 0.384);
    const r = estimateTransportFit(a, control.shipping.transport);
    expect(r.capacity).toBe(6);
    expect(r.columns).toBe(2);
    expect(r.rows).toBe(3);
    expect(r.fitsFloorArea).toBe(true);
    expect(r.fitsGrid).toBe(true);
  });
  it('does not fit a genuine decimal excess or mixed/overweight cargo by area alone', () => {
    const box = {
      lengthM: 0.40000001,
      widthM: 0.4,
      heightM: 0.4,
      massKg: 1,
      count: 6,
    };
    const r = estimateTransportFit(
      calculateShipment([box]),
      control.shipping.transport
    );
    expect(r.capacity).toBeLessThan(6);
    expect(r.fitsFloorArea).toBe(false);
    const a = calculateShipment([
      { lengthM: 1.2, widthM: 0.8, heightM: 1, massKg: 200, count: 4 },
    ]);
    const b = estimateTransportFit(a, {
      lengthM: 3,
      widthM: 2,
      heightM: 2,
      payloadKg: 700,
    });
    expect(b.capacity).toBe(4);
    expect(b.fitsMass).toBe(false);
    const mixed = calculateShipment([
      { lengthM: 1, widthM: 1, heightM: 1, massKg: 1, count: 1 },
      { lengthM: 2, widthM: 1, heightM: 1, massKg: 1, count: 1 },
    ]);
    expect(
      estimateTransportFit(mixed, {
        lengthM: 5,
        widthM: 5,
        heightM: 2,
        payloadKg: 100,
      }).capacity
    ).toBeNull();
  });
  it('reference structural scan is not documentary validation of all rows', () => {
    for (const r of CABLE_MASS_ENTRIES) {
      expect(Number.isFinite(r.massKgPerKm)).toBe(true);
      expect(Number.isFinite(r.diameterMm)).toBe(true);
      expect(r.massKgPerKm).toBeGreaterThan(0);
      expect(r.diameterMm).toBeGreaterThan(0);
      expect(CABLE_MASS_SOURCES[r.sourceId]).toBeTruthy();
    }
  });
});
