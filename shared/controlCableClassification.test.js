import { describe, expect, it } from 'vitest';
import {
  getCatalogCategorySlugs,
  normalizeCatalogHierarchy,
} from './catalogCategoryHierarchy.js';
import { createCatalogStore } from '../lib/catalog.js';
import { getProductImage, PRODUCT_IMAGE_FALLBACKS } from './productImages.js';

describe('объединение кабелей управления и контроля', () => {
  it.each([
    ['АКВВГ', 'АКВВГ 4х2.5', 'kontrolnye-kabeli'],
    ['АКВББШв', 'АКВББШв 5х6', 'kontrolnye-kabeli'],
    ['КВВГ', 'КВВГнг(А)-FRLS 7х1', 'kontrolnye-kabeli'],
    ['КВБбШв', 'КВБбШвнг(А)-LS 7х1', 'kontrolnye-kabeli'],
    ['КППГ', 'КППГнг(А)-FRHF 4х1', 'kontrolnye-kabeli'],
    ['КУПВ', 'КУПВ 7х0.5', 'kabel-upravleniya'],
    ['КУПР 16/9эх0.5', 'КУПР 16/9эх0.5', 'kabel-upravleniya'],
    ['КУМВэаВ', 'КУМВэаВ нг(А)-LS 10х2х1', 'kabel-upravleniya'],
    ['КВ', 'Соббит КВ 2х2х0.5', 'kabel-upravleniya'],
    ['20', 'Лоутокс 20нг(А)-FRLS-LTx 1х2х0.75', 'signalno-blokirovochnye'],
    ['КСРЭВ', 'КСРЭВнг(А)-FRLS 10х0.5', 'signalno-blokirovochnye'],
  ])('распределяет %s по назначению', (mark, name, subcategory) => {
    const product = { mark, name, catalogCategorySlug: 'kontrolnyy-kabel' };
    expect(normalizeCatalogHierarchy(product)).toMatchObject({
      catalogCategory: 'Кабель управления и контроля',
      catalogCategorySlug: 'kontrolnyy-kabel',
      catalogSubcategorySlug: subcategory,
    });
    expect(product).toEqual({
      mark,
      name,
      catalogCategorySlug: 'kontrolnyy-kabel',
    });
  });

  it('сохраняет объединение после сохранения нормализованного импорта', () => {
    const product = {
      name: 'Eletec ES-08-022 8х0.22',
      catalogCategorySlug: 'kabeli-pozharnoy-signalizacii',
    };
    const first = normalizeCatalogHierarchy(product);
    expect(first.catalogSubcategorySlug).toBe('signalno-blokirovochnye');
    expect(normalizeCatalogHierarchy({ ...product, ...first })).toEqual(first);
  });

  it('индексирует старые рубрики в одной подкатегории без дублирования товара', () => {
    const products = [
      {
        id: 1,
        mark: 'КПС',
        catalogCategorySlug: 'kabeli-pozharnoy-signalizacii',
      },
      { id: 2, mark: 'СБВГ', catalogCategorySlug: 'signalno-blokirovochnye' },
      { id: 3, mark: 'КВВГ', catalogCategorySlug: 'kontrolnyy-kabel' },
    ];
    const store = createCatalogStore();
    expect(
      store
        .getCatalogProductsByCategory('kontrolnyy-kabel', products)
        .map((p) => p.id)
    ).toEqual([1, 2, 3]);
    expect(
      store
        .getCatalogProductsByCategory('signalno-blokirovochnye', products)
        .map((p) => p.id)
    ).toEqual([1, 2]);
    expect(
      store
        .getCatalogProductsByCategory('kabeli-pozharnoy-signalizacii', products)
        .map((p) => p.id)
    ).toEqual([1, 2]);
    expect([...getCatalogCategorySlugs(products[0])]).toContain(
      'kontrolnyy-kabel'
    );
  });

  it('объединяет сохранённые медные и алюминиевые рубрики и старые фильтры', () => {
    const legacySlugs = [
      'kontrolnyy-kabel-alyuminievyy',
      'kontrolnyy-kabel-mednyy',
    ];
    const products = legacySlugs.map((catalogSubcategorySlug, id) => ({
      id,
      mark: 'НОВАЯ-ПРОВЕРЕННАЯ-МАРКА',
      catalogCategorySlug: 'kontrolnyy-kabel',
      catalogSubcategorySlug,
    }));
    for (const product of products) {
      const normalized = normalizeCatalogHierarchy(product);
      expect(normalized).toMatchObject({
        catalogSubcategory: 'Контрольный кабель',
        catalogSubcategorySlug: 'kontrolnye-kabeli',
      });
      expect(normalizeCatalogHierarchy({ ...product, ...normalized })).toEqual(
        normalized
      );
    }
    const store = createCatalogStore();
    for (const slug of ['kontrolnye-kabeli', ...legacySlugs]) {
      expect(
        store.getCatalogProductsByCategory(slug, products).map((p) => p.id)
      ).toEqual([0, 1]);
    }
  });

  it('сохраняет изображение сигнального кабеля после объединения', () => {
    expect(
      getProductImage({
        catalogCategorySlug: 'kontrolnyy-kabel',
        catalogSubcategorySlug: 'signalno-blokirovochnye',
      })
    ).toBe(PRODUCT_IMAGE_FALLBACKS.communicationCable);
  });

  it('оставляет неподтверждённую новую марку в общем разделе', () => {
    expect(
      normalizeCatalogHierarchy({
        mark: 'НОВАЯ-МАРКА',
        catalogCategorySlug: 'kontrolnyy-kabel',
      }).catalogSubcategorySlug
    ).toBe('');
  });

  it('не переклассифицирует другие категории по совпавшей марке', () => {
    expect(
      normalizeCatalogHierarchy({
        mark: 'КУПВ',
        catalogCategorySlug: 'importnye-kabeli',
      }).catalogCategorySlug
    ).toBe('importnye-kabeli');
  });

  it.each([
    [
      'КУИН-ПУГВВ',
      'КУИН-ПуГВВ нг(В) 1х1.5',
      'provoda',
      'provoda-ustanovochnye',
    ],
    ['КГВ', 'КГВ 3х10+1х6', 'silovoy-kabel', 'silovoy-kabel-pvh'],
  ])('исправляет исходную рубрику %s', (mark, name, category, subcategory) => {
    const product = { mark, name, catalogCategorySlug: 'kontrolnyy-kabel' };
    const result = normalizeCatalogHierarchy(product);
    expect(result).toMatchObject({
      catalogCategorySlug: category,
      catalogSubcategorySlug: subcategory,
    });
    expect(normalizeCatalogHierarchy({ ...product, ...result })).toEqual(
      result
    );
  });
});
