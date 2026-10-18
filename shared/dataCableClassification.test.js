import { describe, expect, it } from 'vitest';
import { getDataCablePlacement } from './dataCableClassification.js';
import { normalizeCatalogHierarchy } from './catalogCategoryHierarchy.js';
import { classifyProduct } from '../scripts/lib/catalogClassifier.js';
import { createCatalogStore } from '../lib/catalog.js';

describe('кабели передачи данных', () => {
  it.each([
    ['UTP cat.5e', 'UTP cat.5e 4х2х0.52', 'lan-kabeli'],
    ['F/UTP', 'F/UTP 4х2х0.52', 'lan-kabeli'],
    ['S/FTP', 'S/FTP cat.6 4х2х0.52', 'lan-kabeli'],
    ['КВПЭфВП-5е', 'КВПЭфВП-5е 1х2х0.52', 'lan-kabeli'],
    ['ТППэп', 'ТППэп 10х2х0.5', 'kabeli-svyazi'],
    ['КМС-2у', 'КМС-2у 1х2х0.45', 'kabeli-svyazi'],
    ['КИПэВ', 'КИПэВ 1х2х0.6', 'kabeli-svyazi'],
    ['КАЭФВ', 'КАЭФВ 1х2х0.64', 'kabeli-svyazi'],
    ['КВСМ', 'КВСМ 1х2х0.4', 'kabeli-svyazi'],
    ['RG- 58 A/U 50 Ом', 'RG- 58 A/U 50 Ом', 'koaksialnye-kabeli'],
    ['РК 75-2-13', 'РК 75-2-13', 'koaksialnye-kabeli'],
    ['КВК-В-2', 'КВК-В-2 2х0.75', 'koaksialnye-kabeli'],
    ['ДПО', 'ДПО 1х8', 'optovolokonnye-kabeli'],
    ['ОКМН', 'ОКМН 2х4 М6-3', 'optovolokonnye-kabeli'],
  ])(
    'распределяет %s и сохраняет назначение после импорта',
    (mark, name, subcategory) => {
      const product = {
        mark,
        markFamily: mark,
        name,
        sourceName: name,
        sourceCategory: 'Кабель связи',
        catalogCategorySlug: 'kabeli-svyazi',
      };
      const result = normalizeCatalogHierarchy(product);
      expect(result).toMatchObject({
        catalogCategorySlug: 'kabeli-peredachi-dannykh',
        catalogSubcategorySlug: subcategory,
      });
      expect(normalizeCatalogHierarchy({ ...product, ...result })).toEqual(
        result
      );
      expect(classifyProduct(product)).toMatchObject(result);
    }
  );

  it('различает универсальный ГЕРДА-КВК, видеокабель КВК и контрольный КВКбШв', () => {
    const base = {
      catalogCategorySlug: 'kabeli-svyazi',
      mark: 'КВК',
      name: 'КВК 2х0.75',
    };
    expect(normalizeCatalogHierarchy(base).catalogSubcategorySlug).toBe(
      'koaksialnye-kabeli'
    );
    expect(
      normalizeCatalogHierarchy({
        ...base,
        name: 'Герда КВК 2х2х1',
        manufacturer: 'ГЕРДА',
        catalogCategorySlug: 'kontrolnyy-kabel',
      })
    ).toMatchObject({
      catalogCategorySlug: 'kabeli-peredachi-dannykh',
      catalogSubcategorySlug: 'universalnye-kabeli',
    });
    expect(
      normalizeCatalogHierarchy({
        ...base,
        mark: 'КВКбШв',
        name: 'КВКбШвнг(А)-LS 7х1',
      })
    ).toMatchObject({
      catalogCategorySlug: 'kontrolnyy-kabel',
      catalogSubcategorySlug: 'kontrolnye-kabeli',
    });
    expect(
      normalizeCatalogHierarchy({
        ...base,
        manufacturer: 'СОББИТ',
        catalogCategorySlug: 'kontrolnyy-kabel',
      }).catalogCategorySlug
    ).toBe('kontrolnyy-kabel');
  });

  it.each(['КСВВ', 'КСПВ', 'КСРВ', 'КПКЭВ', 'СБВБГ'])(
    'переносит сигнальную серию %s без обратного перемещения при повторной нормализации',
    (mark) => {
      const product = {
        mark,
        name: `${mark} 2х0.5`,
        catalogCategorySlug: 'kabeli-svyazi',
      };
      const result = normalizeCatalogHierarchy(product);
      expect(result).toMatchObject({
        catalogCategorySlug: 'kontrolnyy-kabel',
        catalogSubcategorySlug: 'signalno-blokirovochnye',
      });
      expect(normalizeCatalogHierarchy({ ...product, ...result })).toEqual(
        result
      );
    }
  );

  it('сохраняет исходные данные и не классифицирует неизвестную серию наугад', () => {
    const product = {
      mark: 'ЛПГРС',
      name: 'ЛПГРС 1х2.5 э',
      catalogCategorySlug: 'kabeli-svyazi',
    };
    const before = { ...product };
    expect(normalizeCatalogHierarchy(product)).toMatchObject({
      catalogCategorySlug: 'kabeli-peredachi-dannykh',
      catalogSubcategorySlug: '',
    });
    expect(product).toEqual(before);
    expect(
      getDataCablePlacement({
        ...product,
        catalogCategorySlug: 'importnye-kabeli',
      })
    ).toBeNull();
  });

  it('индексирует общую категорию без дублей и сохраняет старые адреса подкатегорий', () => {
    const products = [
      { id: 1, mark: 'UTP', catalogCategorySlug: 'lan-kabeli' },
      { id: 2, mark: 'ТППэп', catalogCategorySlug: 'kabeli-svyazi' },
    ];
    const store = createCatalogStore();
    expect(
      store
        .getCatalogProductsByCategory('kabeli-peredachi-dannykh', products)
        .map((p) => p.id)
    ).toEqual([1, 2]);
    expect(
      store
        .getCatalogProductsByCategory('lan-kabeli', products)
        .map((p) => p.id)
    ).toEqual([1]);
    expect(
      store
        .getCatalogProductsByCategory('kabeli-svyazi', products)
        .map((p) => p.id)
    ).toEqual([2]);
  });
});
