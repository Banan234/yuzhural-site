// Файл проверяет классификацию товаров, декодирование кабельных марок и приоритеты правил.

import { describe, expect, test } from 'vitest';
import {
  classifyProduct,
  getSourceCategoryCandidate,
  isCableCatalogProduct,
  validateClassificationMaps,
} from './catalogClassifier.js';
import { normalizeImportedProduct } from './priceParser.js';

function classifyName(name, overrides = {}) {
  const product = normalizeImportedProduct({
    name,
    unit: 'м',
    price: 100,
    stock: 1,
    category: 'Без категории',
    ...overrides,
  });

  return classifyProduct(product);
}

describe('classifyProduct', () => {
  test.each([
    [
      'КПСЭ 2х2х0.75',
      { sourceCategory: 'Кабель связи' },
      {
        catalogCategory: 'Кабели пожарной и охранной сигнализации',
        catalogCategorySlug: 'kabeli-pozharnoy-signalizacii',
        catalogType: 'КПС',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'H07V-K 1х2.5',
      {},
      {
        catalogCategory: 'Импортные кабели',
        catalogCategorySlug: 'importnye-kabeli',
        catalogApplicationType: 'Провода',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'ПВВГ нг(А)LS 4х185',
      {},
      {
        catalogCategory: 'Силовой кабель',
        catalogCategorySlug: 'silovoy-kabel',
        catalogType: 'СПЭ',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КМПВ 7х0.35',
      {},
      {
        catalogSection: 'Специальные кабели',
        catalogCategory: 'Кабели судовые',
        catalogCategorySlug: 'kabeli-sudovye',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КТВ-ХК 2х1.5',
      {},
      {
        catalogSection: 'Специальные кабели',
        catalogCategory: 'Кабели термопарные',
        catalogCategorySlug: 'kabeli-termoparny',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'СЭК 2х0.75',
      {},
      {
        catalogCategory: 'Соединительный кабель',
        catalogCategorySlug: 'soedinitelnyy-kabel',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КПЛМ 4х0.75',
      {},
      {
        catalogSection: 'Специальные кабели',
        catalogCategory: 'Бортовые провода',
        catalogCategorySlug: 'bortovye-provoda',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'КПВЛ 12х0.75',
      {},
      {
        catalogCategory: 'Контрольный кабель',
        catalogCategorySlug: 'kontrolnyy-kabel',
        catalogClassificationSource: 'rule',
      },
    ],
  ])('фиксирует rule-классификацию для %s', (name, overrides, expected) => {
    expect(classifyName(name, overrides)).toMatchObject(expected);
  });

  test('sourceCategory map классифицирует неизвестную марку до keyword/fallback', () => {
    expect(
      classifyName('UNKNOWN 2х1', { sourceCategory: 'Кабель греющий' })
    ).toMatchObject({
      catalogSection: 'Специальные кабели',
      catalogCategory: 'Кабели нагревательные',
      catalogCategorySlug: 'kabeli-nagrevatelnye',
      catalogClassificationSource: 'sourceCategory',
    });
  });

  test('общий заголовок прайса не подавляет распознавание марки', () => {
    expect(
      classifyName('ПуГВ 1х2.5', {
        sourceCategory: 'К А Б Е Л Ь Н А Я   П Р О Д У К Ц И Я',
      })
    ).toMatchObject({
      catalogCategorySlug: 'provoda',
      catalogClassificationSource: 'keywordPrefix',
    });
  });

  test('КППГ относится к контрольным кабелям, а не к гибким или силовым', () => {
    expect(classifyName('КППГ 4х1 нг(А)-FRHF')).toMatchObject({
      catalogCategorySlug: 'kontrolnyy-kabel',
      catalogClassificationSource: 'keywordPrefix',
    });
  });

  test.each(['КПБП 4х1.5 нг(А)-FRHF', 'КПБП 19х1 нг(А)-FRHF'])(
    'КПБП %s относится к контрольным кабелям',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'kontrolnyy-kabel',
        catalogClassificationSource: 'rule',
      });
    }
  );

  test.each(['АсКГ 4х70 хл', 'АсКГН 1х35'])(
    '%s относится к гибким кабелям',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'gibkiy-kabel',
        catalogClassificationSource: 'keywordPrefix',
      });
    }
  );

  test.each(['ЦААШВ-10 3х95', 'ЦАСБ2л-10 3х185', 'ЦАСБГ-10 3х150'])(
    'силовой кабель с бумажной изоляцией %s не уходит в Прочее',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'silovoy-kabel',
        catalogClassificationSource: 'keywordPrefix',
      });
    }
  );

  test('ПМТК распознаётся как монтажный провод', () => {
    expect(classifyName('ПМТК нг(А) 1х0.5')).toMatchObject({
      catalogCategorySlug: 'provoda',
      catalogClassificationSource: 'keywordPrefix',
    });
  });

  test('МКСШп остаётся неопределённым при широком префиксе МК', () => {
    expect(classifyName('МКСШп 4х0.9')).toMatchObject({
      catalogCategorySlug: 'prochee',
      catalogClassificationSource: 'keywordPrefix',
    });
  });

  test('ПТГВэВнг-ха относится к термопарным изделиям', () => {
    expect(classifyName('ПТГВэВнг-ха 2х1.5')).toMatchObject({
      catalogCategorySlug: 'kabeli-termoparny',
      catalogClassificationSource: 'rule',
    });
  });

  test('ТЕРК-Г относится к термопарным кабелям', () => {
    expect(classifyName('ТЕРК-Г 4х2х1 нг(А)-LS ха(кх)эвб')).toMatchObject({
      catalogCategorySlug: 'kabeli-termoparny',
      catalogClassificationSource: 'rule',
    });
  });

  test('ПТГВ-ХК относится к термопарным изделиям', () => {
    expect(classifyName('ПТГВ-ХК 2х1.5')).toMatchObject({
      catalogCategorySlug: 'kabeli-termoparny',
      catalogClassificationSource: 'rule',
    });
  });

  test.each(['H05z1-k 1х0.5 оранж', 'H07z1-K 1х2.5 красн'])(
    '%s относится к импортным проводам',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'importnye-kabeli',
        catalogSubcategorySlug: 'importnye-provoda',
        catalogClassificationSource: 'rule',
      });
    }
  );

  test('КИПэ относится к интерфейсным кабелям связи', () => {
    expect(classifyName('КИПэ 2х2х0.6 нг(А)-HF')).toMatchObject({
      catalogCategorySlug: 'kabeli-svyazi',
      catalogClassificationSource: 'rule',
    });
    expect(classifyName('КИП 8х1,5').catalogCategorySlug).toBe('prochee');
  });

  test.each(['MEDIAstrip H 3х4', 'MEDIAstrip BH 5х6 06/1кв'])(
    '%s относится к силовым кабелям',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'silovoy-kabel',
        catalogClassificationSource: 'rule',
      });
    }
  );

  test('NEXANS Mediastrip остаётся импортным кабелем', () => {
    expect(classifyName('NEXANS Mediastrip 2х2.5')).toMatchObject({
      catalogCategorySlug: 'importnye-kabeli',
      catalogClassificationSource: 'rule',
    });
  });

  test('общий заголовок не создаёт кандидата для проверки конфликта', () => {
    expect(
      getSourceCategoryCandidate('К А Б Е Л Ь Н А Я   П Р О Д У К Ц И Я')
    ).toBeNull();
    expect(getSourceCategoryCandidate('Кабель греющий')).toMatchObject({
      categorySlug: 'kabeli-nagrevatelnye',
    });
  });

  test('сохраняет кабельную позицию, если в её марке есть фрагмент «лон»', () => {
    const classified = classifyName('СКЛОН Р6 24х0,35', {
      sourceCategory: 'Кабель монтажный для цифровых и аналоговых сист.',
    });

    expect(classified).toMatchObject({
      catalogSection: 'Кабель и провод',
      catalogCategory: 'Монтажный кабель',
      catalogClassificationSource: 'sourceCategory',
    });
    expect(isCableCatalogProduct(classified)).toBe(true);
  });

  test('помечает некабельную sourceCategory для исключения из импорта', () => {
    const classified = classifyName('Автомат 16А', {
      sourceCategory: 'Автоматы',
    });

    expect(classified).toMatchObject({
      catalogSection: 'Некабельная продукция',
      catalogCategory: 'Некабельная продукция',
      catalogCategorySlug: 'nekabelnaya-produkciya',
      catalogClassificationSource: 'sourceCategory',
    });
    expect(isCableCatalogProduct(classified)).toBe(false);
  });

  test('prefix keyword классифицирует обычные провода', () => {
    expect(classifyName('ПуГВ 1х2.5')).toMatchObject({
      catalogCategory: 'Провода',
      catalogCategorySlug: 'provoda',
      catalogClassificationSource: 'keywordPrefix',
      catalogClassificationMatch: 'ПУГВ',
    });
  });

  test('substring keyword работает для марки с посторонним префиксом и дефисом', () => {
    expect(
      classifyProduct({
        name: 'X-RG 6',
        mark: 'X-RG',
        markFamily: 'X-RG',
        sourceCategory: 'Без категории',
      })
    ).toMatchObject({
      catalogCategory: 'Кабели связи',
      catalogCategorySlug: 'kabeli-svyazi',
      catalogClassificationSource: 'keywordSubstring',
      catalogClassificationMatch: 'RG',
    });
  });

  test('brand fallback срабатывает для LAPPKABEL, если нет точного rule', () => {
    expect(
      classifyProduct({
        name: 'LAPPKABEL UNKNOWN 2х1',
        mark: 'LAPPKABEL UNKNOWN',
        markFamily: 'LAPPKABEL UNKNOWN',
        sourceCategory: 'Без категории',
      })
    ).toMatchObject({
      catalogCategory: 'Импортные кабели',
      catalogCategorySlug: 'importnye-kabeli',
      catalogBrand: 'LAPPKABEL',
      catalogClassificationSource: 'brandDefault',
    });
  });

  test.each([
    ['МКПсКВ 7х2.5 нг LS', 'montazhnyy-kabel'],
    ['КВПВП-5е 1х2х0.52', 'lan-kabeli'],
    ['КИПВэПБП 2х2х0.78', 'kabeli-svyazi'],
    ['ОМЗКГЦ 10-01-0.22-8', 'kabeli-svyazi'],
    ['Сегмент-КИ485-ЭПКГ 4х2х0.6', 'kabeli-svyazi'],
    ['Сегмент-КУнг(А)-LS 3х10', 'prochee'],
    ['КГПЭф 1х2х1.2 нг HF', 'prochee'],
    ['АсВВГ 3х16 нг(А)-LS', 'silovoy-kabel'],
    ['АС 16/2.7', 'provoda'],
    ['PAARTRONIC-CY(LIY-CY) 8х2х0.75', 'importnye-kabeli'],
  ])('не присваивает %s категорию по внутренней подстроке', (name, slug) => {
    expect(classifyName(name).catalogCategorySlug).toBe(slug);
  });

  test('подкатегория импортного провода задаёт назначение точнее общего бренда', () => {
    expect(classifyName('HELUKABEL H07V-K 1х2.5')).toMatchObject({
      catalogCategorySlug: 'importnye-kabeli',
      catalogSubcategorySlug: 'importnye-provoda',
      catalogApplicationType: 'Провода',
    });
  });

  test('не выбирает категорию по неоднозначному keyword и порядку JSON', () => {
    expect(classifyName('КМТВНЕИЗВ 1х1')).toMatchObject({
      catalogCategorySlug: 'prochee',
      catalogClassificationSource: 'fallback',
    });
  });

  test('неизвестная марка явно попадает в fallback Прочее', () => {
    expect(classifyName('АОЛ-П-12Y(1х8х1х4)2.7')).toMatchObject({
      catalogSection: 'Кабель и провод',
      catalogCategory: 'Прочее',
      catalogCategorySlug: 'prochee',
      catalogClassificationSource: 'fallback',
      catalogClassificationMatch: null,
    });
  });
});

test('справочник не принимает противоречивые дубли после нормализации', () => {
  expect(() =>
    validateClassificationMaps({
      importedFamilies: [
        { markFamily: 'F-CY-OZ', subcategorySlug: 'first' },
        { markFamily: 'f-cy-oz', subcategorySlug: 'second' },
      ],
    })
  ).toThrow(/Противоречивый ключ/u);
});
