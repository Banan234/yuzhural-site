import { describe, expect, it } from 'vitest';
import catalogCategories from './catalogCategories.json' with { type: 'json' };
import { normalizeCatalogHierarchy } from './catalogCategoryHierarchy.js';

const wireCategory = catalogCategories.sections
  .flatMap((section) => section.categories)
  .find((category) => category.slug === 'provoda');

describe('подкатегории проводов', () => {
  it.each([
    ['ПуГП', 'ПуГП 1х2,5', 'provoda-ustanovochnye'],
    ['ПАВ120 белый (АПВ)', 'ПАВ120 белый (АПВ)', 'provoda-ustanovochnye'],
    ['ПБП', 'ПБПЭ 2х0.35', ''],
    ['ПВС', 'ПВС 3х1,5', 'provoda-soedinitelnye'],
    ['НВМ 0.2-1 600В бел', 'НВМ 0.2-1 600В бел', 'provoda-montazhnye'],
    ['ПГВА', 'ПГВА 1х1', 'provoda-avtomobilnye'],
    ['ПВКВ', 'ПВКВ 1х2,5', 'provoda-vyvodnye'],
    ['АС 70/11', 'АС 70/11', 'provoda-neizolirovannye'],
    ['ПЭТВ-2', 'ПЭТВ-2 0,8', 'provoda-obmotochnye'],
    ['ПРКА', 'ПРКА 1х1', 'provoda-termostoykie'],
    ['ППСРВМ', 'ППСРВМ 1х6', 'provoda-podvizhnogo-sostava'],
    ['ТРП', 'ТРП 2х0,5', 'provoda-svyazi'],
    ['ПМСВ', 'ПМСВ 1х1,2', 'provoda-progrevochnye'],
    ['ПТГВ-М', 'ПТГВ-М 2х1', 'provoda-termoelektrodnye'],
  ])('относит %s в подтверждённую группу', (mark, name, expectedSlug) => {
    const result = normalizeCatalogHierarchy({
      mark,
      name,
      catalogCategory: 'Провода',
      catalogCategorySlug: 'provoda',
    });
    expect(result.catalogSubcategorySlug).toBe(expectedSlug);
    if (expectedSlug) {
      expect(
        wireCategory.subcategories.some((entry) => entry.slug === expectedSlug)
      ).toBe(true);
    }
  });

  it('переносит ошибочно помещённый в провода силовой кабель', () => {
    expect(
      normalizeCatalogHierarchy({
        mark: 'ПБП',
        name: 'ПБПнг(А)-FRHF 5х10',
        catalogCategorySlug: 'provoda',
      })
    ).toMatchObject({
      catalogCategorySlug: 'silovoy-kabel',
      catalogSubcategorySlug: 'silovoy-kabel-bronirovannyy',
    });
  });

  it('не изменяет другие исходные категории по одной только марке', () => {
    expect(
      normalizeCatalogHierarchy({
        mark: 'ПВС',
        catalogCategorySlug: 'importnye-kabeli',
      }).catalogCategorySlug
    ).toBe('importnye-kabeli');
  });
});
