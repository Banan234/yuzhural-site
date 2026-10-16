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
    ['ВВГ 3х2.5', 'pvh'],
    ['АПвБШв 3х120', 'bronirovannyy'],
    ['ААБл-10 3х120', 'bumazhnaya-izolyaciya'],
    ['ППГнг(А)-HF 3х2.5', 'polimernye-kompozicii'],
    ['АПвПу 1х120', 'spe'],
    ['КГ-ХЛ 3х2.5', 'rezinovaya-izolyaciya'],
  ])('сохраняет распределение %s при новом импорте', (name, group) => {
    expect(classifyName(name)).toMatchObject({
      catalogCategorySlug: 'silovoy-kabel',
      catalogSubcategorySlug: `silovoy-kabel-${group}`,
    });
  });
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
        catalogSection: 'Кабель и провод',
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
      'СЭК 5х2',
      {},
      {
        catalogCategory: 'Прочее',
        catalogCategorySlug: 'prochee',
        catalogClassificationSource: 'rule',
      },
    ],
    [
      'СЭКнг(А)-LS-ХЛ 5х1',
      {},
      {
        catalogCategory: 'Прочее',
        catalogCategorySlug: 'prochee',
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
      catalogSection: 'Кабель и провод',
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
    '%s относится к резиновым силовым кабелям',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'silovoy-kabel',
        catalogSubcategorySlug: 'silovoy-kabel-rezinovaya-izolyaciya',
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

  test.each([
    'СБПу 2х0.9',
    'СБПБ 3х1',
    'СБП нг(А)-HF 3х2х1',
    'СБЗПу 4х0.9',
    'СБВБПу 10х2х0,9',
    'СБВГ 3х0.9 нг',
    'СБПЗАБпШп 3х2х0,9',
  ])('%s относится к сигнально-блокировочным', (name) => {
    expect(classifyName(name)).toMatchObject({
      catalogCategory: 'Сигнально-блокировочные',
      catalogCategorySlug: 'signalno-blokirovochnye',
      catalogClassificationSource: 'rule',
    });
  });

  test('внутренний СБП в другой марке не переводит её в сигнально-блокировочные', () => {
    expect(
      classifyName('К9РВСБПМ нг(А)-HF 5х16', {
        sourceCategory: 'Кабель медный из СПЭ - ПвВнг, ПВПУ, ППГ, ПВВГ',
      }).catalogCategorySlug
    ).toBe('silovoy-kabel');
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

  test.each([
    ['H05z-K 1х0.5 сер', 'importnye-provoda'],
    ['BETA THERM 145HALOGEN 1х1.5', 'importnye-provoda'],
    ['JAMAK 4х(2+1)х0.5', 'importnye-kabeli-svyazi'],
  ])('%s получает проверенную импортную подкатегорию', (name, subcategory) => {
    expect(classifyName(name)).toMatchObject({
      catalogCategorySlug: 'importnye-kabeli',
      catalogSubcategorySlug: subcategory,
      catalogClassificationSource: 'rule',
    });
  });

  test.each([
    'КПМВВГм Энг(А)-ХЛ 4х1',
    'КПМВКВГм-В нг(А)-ХЛ 3х1',
    'КПМСЭКВГ нг(А)-FRLS 2х2х1',
    'КПМСЭфКПГм-В нг(А)-FRLS-ХЛ 3х1.5',
  ])('%s относится к монтажным кабелям', (name) => {
    expect(classifyName(name)).toMatchObject({
      catalogCategorySlug: 'montazhnyy-kabel',
      catalogClassificationSource: 'rule',
    });
  });

  test.each(['ПТФФГхк 2х1.5 зелен'])(
    '%s относится к термопарным изделиям',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'kabeli-termoparny',
        catalogClassificationSource: 'rule',
      });
    }
  );

  test('чужой заголовок КИМЭП-М не переводит ВЭкВКВ-ВП в силовые', () => {
    expect(
      classifyName('ВЭкВКВ-ВП нг(А)-FRLS 10х2х1.5', {
        sourceCategory: 'Кабель высоковольтный малой мощности КИМЭП-М',
      })
    ).toMatchObject({
      catalogCategorySlug: 'prochee',
      catalogClassificationSource: 'rule',
    });
  });

  test.each(['ЭКС-ШВППЭ/Э 2х2х0.6', 'ЭКС-ШВППЭ/Э-5 2х2х0.6'])(
    '%s относится к кабелям для структурированных систем связи',
    (name) => {
      expect(classifyName(name)).toMatchObject({
        catalogCategorySlug: 'lan-kabeli',
        catalogClassificationSource: 'rule',
      });
    }
  );

  test.each([
    ['НРГ 1х240', 'silovoy-kabel'],
    ['ПРГН 1х10', 'provoda'],
    ['ПМПЭВ 2х0.35', 'provoda'],
    ['ТРВ 2х0.4', 'kabeli-svyazi'],
    ['ШТЛ-2', 'kabeli-svyazi'],
    ['ШТЛ-5', 'kabeli-svyazi'],
  ])('%s классифицируется по каталогу производителя', (name, category) => {
    expect(classifyName(name)).toMatchObject({
      catalogCategorySlug: category,
      catalogClassificationSource: 'rule',
    });
  });

  test('ТРВтр не наследует назначение ТРВ без паспорта модификации', () => {
    expect(classifyName('ТРВтр 2х0.5').catalogCategorySlug).toBe('prochee');
  });

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
