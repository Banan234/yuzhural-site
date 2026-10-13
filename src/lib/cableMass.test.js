import { describe, expect, it } from 'vitest';
import {
  CABLE_MASS_ENTRIES,
  CABLE_MASS_SOURCES,
  calculateCableMass,
  calculateMassWithDrums,
  getCableMassRows,
} from './cableMass';
import { CABLE_DRUMS, CABLE_DRUM_SOURCE, getCableDrum } from './cableDrums';

describe('cable mass reference', () => {
  it('keeps different manufacturer values for the same size and voltage', () => {
    const rows = getCableMassRows({
      mark: 'ВВГнг(А)-LS',
      configuration: '1х1,5ок',
      voltageKv: 0.66,
    });

    expect(rows.map((row) => row.sourceId).sort()).toEqual([
      'energokab',
      'hka',
    ]);
    expect(calculateCableMass(rows, 100)).toEqual({ minKg: 4.8, maxKg: 5.1 });
  });

  it('does not mix rows with another voltage or construction', () => {
    const rows = getCableMassRows({
      mark: 'ВВГнг(А)-LS',
      configuration: '1х1,5ок',
      voltageKv: 1,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].massKgPerKm).toBe(54);
    expect(calculateCableMass(rows, 0)).toBeNull();
  });

  it('adds the entered weight of every drum to both ends of a cable mass range', () => {
    const cableMass = { minKg: 48, maxKg: 51 };
    expect(calculateMassWithDrums(cableMass, '12,5', '2')).toEqual({
      drumsKg: 25,
      minKg: 73,
      maxKg: 76,
    });
    expect(calculateMassWithDrums(cableMass, '', 1)).toBeNull();
    expect(calculateMassWithDrums(cableMass, -1, 1)).toBeNull();
    expect(calculateMassWithDrums(cableMass, 10, 1.5)).toBeNull();
  });

  it('uses the published wooden and metal drum masses for the total', () => {
    expect(CABLE_DRUMS.filter((drum) => drum.material === 'wood')).toHaveLength(
      22
    );
    expect(
      CABLE_DRUMS.filter((drum) => drum.material === 'metal')
    ).toHaveLength(6);
    expect(
      new Set(CABLE_DRUMS.map((drum) => `${drum.material}:${drum.number}`)).size
    ).toBe(CABLE_DRUMS.length);
    expect(CABLE_DRUM_SOURCE.url).toBe(
      'https://kabel-s.ru/info/calc-kabel-ves/'
    );
    expect(getCableDrum('wood', '18б')).toMatchObject({
      sourceNumber: '186',
      massKg: 590,
    });
    expect(getCableDrum('metal', '10')).toMatchObject({ massKg: 79 });
    expect(getCableDrum('wood', '7')).toBeNull();
    expect(
      calculateMassWithDrums(
        { minKg: 48, maxKg: 51 },
        getCableDrum('metal', '10').massKg,
        2
      )
    ).toEqual({ drumsKg: 158, minKg: 206, maxKg: 209 });
  });

  it('has valid positive values and source references for every row', () => {
    expect(CABLE_MASS_ENTRIES.length).toBeGreaterThan(4100);
    expect(new Set(CABLE_MASS_ENTRIES.map((row) => row.mark)).size).toBe(89);
    for (const row of CABLE_MASS_ENTRIES) {
      expect(row.massKgPerKm).toBeGreaterThan(0);
      expect(row.diameterMm).toBeGreaterThan(0);
      expect(CABLE_MASS_SOURCES[row.sourceId]?.url).toMatch(/^https:\/\//);
      if (row.sourceUrl) expect(row.sourceUrl).toMatch(/^https:\/\//);
      expect(row.mark).toBeTruthy();
      expect(row.configuration).toBeTruthy();
    }
  });

  it('includes twenty more catalog marks with separate voltage and ГОСТ variants', () => {
    const addedMarks = [
      'КМПВ',
      'КВКбШв',
      'НВ',
      'БПВЛ',
      'МКШВ',
      'БПДО',
      'КУПЭВ',
      'ПуГВВ',
      'КМПВЭВ',
      'КУПВ',
      'КМПЭВ',
      'КМПЭВЭВ',
      'ВКбШв',
      'РПШЭк',
      'НВМ',
      'МККШв',
      'КВВ',
      'МПО',
      'НВЭВ',
      'РПШк',
    ];
    const available = new Set(CABLE_MASS_ENTRIES.map((row) => row.mark));
    expect(addedMarks).toHaveLength(20);
    for (const mark of addedMarks) expect(available.has(mark)).toBe(true);

    expect(
      getCableMassRows({
        mark: 'ПуГВВ',
        configuration: '1х2,5',
        voltageKv: null,
      })
    ).toMatchObject([{ sourceId: 'energokab_pugvv', massKgPerKm: 51 }]);
    expect(
      getCableMassRows({ mark: 'КМПВ', configuration: '2х0,5', voltageKv: 0.5 })
    ).toMatchObject([{ sourceId: 'podolsk_kmpv', massKgPerKm: 40.6 }]);
    expect(
      getCableMassRows({ mark: 'КМПВ', configuration: '2х0,5', voltageKv: 1 })
    ).toMatchObject([{ sourceId: 'podolsk_kmpv', massKgPerKm: 40.5 }]);
    expect(
      getCableMassRows({
        mark: 'НВ',
        configuration: '0,50 (НВ-1)',
        voltageKv: 0.66,
      })
    ).toMatchObject([{ sourceId: 'podolsk_nv', massKgPerKm: 6.2 }]);
    expect(
      getCableMassRows({
        mark: 'НВ',
        configuration: '0,50 (НВ-4)',
        voltageKv: 0.66,
      })
    ).toMatchObject([{ sourceId: 'podolsk_nv', massKgPerKm: 6.5 }]);
  });

  it('includes exact tables for common catalog marks', () => {
    expect(
      getCableMassRows({ mark: 'КГ', configuration: '3х2,5', voltageKv: 0.66 })
    ).toMatchObject([{ sourceId: 'holdcable_kg', massKgPerKm: 230 }]);
    expect(
      getCableMassRows({
        mark: 'ПуГВ',
        configuration: '1х2,5',
        voltageKv: null,
      })
    ).toMatchObject([{ sourceId: 'energokab_pugv', massKgPerKm: 35 }]);
    expect(
      getCableMassRows({
        mark: 'КГВВ',
        configuration: '2х0,75',
        voltageKv: null,
      })
    ).toMatchObject([{ sourceId: 'hka', sourcePage: 204, massKgPerKm: 53 }]);
    expect(
      getCableMassRows({
        mark: 'МКЭШ',
        configuration: '2х0,5',
        voltageKv: null,
      })
    ).toMatchObject([
      {
        sourceId: 'podolsk_mkesh',
        massKgPerKm: 60.1,
        sourceUrl:
          'https://podolskkabel.ru/catalog/kabeli-montazhnye/mkesh/mkesh-2-0-5/',
      },
    ]);
    expect(
      getCableMassRows({
        mark: 'ТППэпнг(А)-HF',
        configuration: '5х2х0,40',
        voltageKv: null,
      })
    ).toMatchObject([
      { sourceId: 'samaracable', sourcePage: 109, massKgPerKm: 94 },
    ]);
    expect(
      getCableMassRows({
        mark: 'МКЭШВ',
        configuration: '2х0,75',
        voltageKv: null,
      })
    ).toMatchObject([
      { sourceId: 'podolsk_mkeshv', massKgPerKm: 74.7, diameterMm: 7.63 },
    ]);
    expect(
      getCableMassRows({
        mark: 'МКЭКШв',
        configuration: '3х2х0,75',
        voltageKv: null,
      })
    ).toMatchObject([{ sourceId: 'podolsk_mkekshv', massKgPerKm: 327 }]);
    expect(
      getCableMassRows({
        mark: 'ВБбШв',
        configuration: '1х16ож',
        voltageKv: 0.66,
      })
    ).toMatchObject([{ sourceId: 'energokab_vbbshv', massKgPerKm: 366 }]);
    expect(
      getCableMassRows({
        mark: 'ТППэп',
        configuration: '5х2х0,4',
        voltageKv: null,
      })
    ).toMatchObject([{ sourceId: 'hka', sourcePage: 318, massKgPerKm: 57 }]);
    expect(
      getCableMassRows({
        mark: 'СИП-2',
        configuration: '3х16+1х25',
        voltageKv: 1,
      })
    ).toMatchObject([{ sourceId: 'hka', sourcePage: 515, massKgPerKm: 308 }]);
    expect(
      getCableMassRows({
        mark: 'МГШВ',
        configuration: '1х0,50',
        voltageKv: null,
      })
    ).toMatchObject([
      { sourceId: 'podolsk_mgshv', massKgPerKm: 7.98, diameterMm: 1.98 },
    ]);
    expect(
      getCableMassRows({
        mark: 'КПСнг(А)-FRLS',
        configuration: '1х2х0,5',
        voltageKv: 0.3,
      })
    ).toMatchObject([
      { sourceId: 'energokab_kpsfrls', massKgPerKm: 31, diameterMm: 5.2 },
    ]);
    expect(
      getCableMassRows({
        mark: 'КПСЭнг(А)-FRLS',
        configuration: '1х2х0,5',
        voltageKv: 0.3,
      })
    ).toMatchObject([{ sourceId: 'energokab_kpsefrls', massKgPerKm: 38 }]);
    expect(
      getCableMassRows({
        mark: 'ГЕРДА-КВК',
        configuration: '2х2х0,75',
        voltageKv: null,
      })
    ).toMatchObject([
      { sourceId: 'gerda_table', sourcePage: 1, massKgPerKm: 354 },
    ]);
    expect(
      getCableMassRows({
        mark: 'КУИН нг(А)-FRLS ВЭК',
        configuration: '5х2х1,0',
        voltageKv: null,
      })
    ).toMatchObject([
      { sourceId: 'gerda_kuin', sourcePage: 12, massKgPerKm: 827 },
    ]);
  });
});
