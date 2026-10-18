import { describe, expect, it } from 'vitest';
import { normalizeCatalogHierarchy } from './catalogCategoryHierarchy.js';
import { classifyProduct } from '../scripts/lib/catalogClassifier.js';

const product = (name) => ({
  name,
  sourceName: name,
  mark: name.startsWith('БУН ') ? 'БУН' : name,
  markFamily: name.startsWith('БУН ') ? 'БУН' : name,
  sourceCategory: 'Кабель греющий',
  catalogCategorySlug: 'kabeli-nagrevatelnye',
});

describe('нагревательные кабели', () => {
  it.each([
    'Греющий 25SHTL-LT-2-0270-040',
    'Греющий СНФ 07R1',
    'Греющий СНФ 22R7',
    'Греющий кабель TCTEX-H-31.5',
    'Греющий ЭНГКЕх-1 1,97/220',
    'греющий Deviflex Dsig 0.0508 Ohm/m',
    'греющий Deviflex DTIP-18 1625W 2.5х',
    'ПНСВ 1х1.2',
  ])('определяет резистивный нагрев: %s', (name) => {
    expect(normalizeCatalogHierarchy(product(name))).toMatchObject({
      catalogCategorySlug: 'kabeli-nagrevatelnye',
      catalogSubcategorySlug: 'greyushchie-rezistivnye-kabeli',
    });
  });

  it.each([
    'Греющий 45FSEW2-CT',
    'Греющий кабель 17 КСТМ2-Т',
    'Греющий кабель 24BTC2-BP саморег.',
    'Греющий кабель 25HTP2-BP саморег.',
    'Греющий кабель Extherm LХTC16-2',
    'Греющий кабель Extherm LXTC30-2CR',
    'Греющий кабель GR40-2CR',
    'Греющий кабель Heatus 40GSR2',
    'Греющий кабель SRL-30-2CR',
    'греющий DHP-10 V2 20W с вилкой',
    'греющий DHP-10 V2 40W с вилкой',
  ])('определяет саморегулирование: %s', (name) => {
    expect(normalizeCatalogHierarchy(product(name))).toMatchObject({
      catalogCategorySlug: 'kabeli-nagrevatelnye',
      catalogSubcategorySlug: 'samoreguliruyushchiesya-kabeli',
    });
  });

  it.each([
    [
      'Термокабель PROTECTOWIRE LINE',
      'kontrolnyy-kabel',
      'signalno-blokirovochnye',
    ],
    ['БУН 2х1.5', 'provoda', 'provoda-ustanovochnye'],
  ])(
    'исправляет назначение %s и сохраняет его при импорте',
    (name, category, subcategory) => {
      const input = product(name);
      const normalized = normalizeCatalogHierarchy(input);
      expect(normalized).toMatchObject({
        catalogCategorySlug: category,
        catalogSubcategorySlug: subcategory,
      });
      expect(normalizeCatalogHierarchy({ ...input, ...normalized })).toEqual(
        normalized
      );
      expect(classifyProduct(input)).toMatchObject(normalized);
      expect(input.sourceName).toBe(name);
    }
  );

  it.each([
    'ТТВпс 2х1.2',
    'Греющий кабель Extherm Su30-2CR 30w',
    'Греющий кабель НЕИЗВЕСТНЫЙ',
  ])('не назначает тип нагрева без подтверждения: %s', (name) => {
    expect(
      normalizeCatalogHierarchy(product(name)).catalogSubcategorySlug
    ).toBe('');
  });

  it('применяет правила только к нагревательному разделу', () => {
    expect(
      normalizeCatalogHierarchy({
        ...product('Греющий кабель SRL-16-2'),
        catalogCategorySlug: 'importnye-kabeli',
      })
    ).toMatchObject({ catalogCategorySlug: 'importnye-kabeli' });
  });
});
