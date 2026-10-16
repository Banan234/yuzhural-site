import { describe, expect, it } from 'vitest';
import {
  normalizeCatalogHierarchy,
  getCatalogCategorySlugs,
} from './catalogCategoryHierarchy.js';
import { getPowerCableSubcategorySlug } from './powerCableClassification.js';

describe('силовые подкатегории', () => {
  it.each([
    ['ААБ2лШв-10', 'bumazhnaya-izolyaciya'],
    ['ЦАСБГ-10', 'bumazhnaya-izolyaciya'],
    ['АПвБШв', 'bronirovannyy'],
    ['ВЭБШВ', 'bronirovannyy'],
    ['ИнСил-ВБВ', 'bronirovannyy'],
    ['MEDIAstrip BH', 'bronirovannyy'],
    ['К9РВСБПМ', 'bronirovannyy'],
    ['ППГ', 'polimernye-kompozicii'],
    ['КУГ ППГ', 'polimernye-kompozicii'],
    ['АППГ', 'polimernye-kompozicii'],
    ['ПВВГ', 'spe'],
    ['АПвПу2Гж', 'spe'],
    ['КА9СПвП', 'spe'],
    ['КГ', 'rezinovaya-izolyaciya'],
    ['АсКГН', 'rezinovaya-izolyaciya'],
    ['EPR-F LV SHF(AF)', 'rezinovaya-izolyaciya'],
    ['НРГ', 'rezinovaya-izolyaciya'],
    ['КПГ2У', 'rezinovaya-izolyaciya'],
    ['ВРГ', 'rezinovaya-izolyaciya'],
    ['ВВГ', 'pvh'],
    ['АсВВГ', 'pvh'],
    ['ИнСил-ВВ', 'pvh'],
    ['PVC Lv TLs(AF)', 'pvh'],
  ])(
    'определяет %s с учётом пересечения конструкции и изоляции',
    (mark, group) => {
      expect(getPowerCableSubcategorySlug({ mark })).toBe(
        `silovoy-kabel-${group}`
      );
    }
  );

  it('переносит резиновый КГ из гибких, сохраняя родителя в индексе', () => {
    const product = {
      mark: 'КГ',
      catalogCategorySlug: 'gibkiy-kabel',
      catalogSectionSlug: 'kabel-i-provod',
    };
    expect(normalizeCatalogHierarchy(product)).toMatchObject({
      catalogCategorySlug: 'silovoy-kabel',
      catalogSubcategorySlug: 'silovoy-kabel-rezinovaya-izolyaciya',
    });
    expect([...getCatalogCategorySlugs(product)]).toEqual([
      'silovoy-kabel',
      'silovoy-kabel-rezinovaya-izolyaciya',
      'kabel-i-provod',
    ]);
  });

  it.each(['КГПП', 'КГВВ', 'РПШ', 'РКГМ', 'КГпВэВ', 'КНР'])(
    'сохраняет категорию для %s',
    (mark) => {
      expect(
        normalizeCatalogHierarchy({ mark, catalogCategorySlug: 'gibkiy-kabel' })
          .catalogCategorySlug
      ).toBe('gibkiy-kabel');
    }
  );

  it('не переклассифицирует импортные, контрольные и специальные кабели', () => {
    for (const catalogCategorySlug of [
      'importnye-kabeli',
      'kontrolnyy-kabel',
      'kabeli-shakhtnye',
    ]) {
      expect(
        normalizeCatalogHierarchy({ mark: 'КГ', catalogCategorySlug })
          .catalogCategorySlug
      ).toBe(catalogCategorySlug);
    }
  });

  it('не присваивает неизвестной марке произвольный тип изоляции', () => {
    expect(getPowerCableSubcategorySlug({ mark: 'НОВАЯ' })).toBe('');
  });
});
