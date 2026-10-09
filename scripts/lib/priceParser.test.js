// Файл проверяет парсер прайса на реальных и пограничных вариантах товарных строк.

import { describe, expect, test } from 'vitest';
import {
  buildCategoryMap,
  normalizeImportedProduct,
  parseCombinedCell,
  parseProductName,
  resolveCategory,
} from './priceParser.js';

describe('parseProductName', () => {
  test.each([
    ['ВВГнгLS 3х2,5', 'ВВГ', ['нг-LS']],
    ['КВВГ 4х1,5 э нг(А)LS', 'КВВГ', ['Э', 'нг(А)-LS']],
    ['КВВГ 4х1,5энг(А)LS', 'КВВГ', ['Э', 'нг(А)-LS']],
    ['КВВГ 4х1,5 нг(А)LS эм', 'КВВГ', ['нг(А)-LS', 'ЭМ']],
    ['МКЭШВ 2х(2х1эф)э', 'МКЭШВ', ['ЭФ', 'Э']],
    ['КГ хл 4х1', 'КГ', ['ХЛ']],
    ['ВВГ з 2х1', 'ВВГ', ['З']],
    ['КГЭ-хл 4х1', 'КГ', ['Э', 'ХЛ']],
    ['КГЭхл 4х1', 'КГ', ['Э', 'ХЛ']],
    ['КА9СПвП-нг(А)HF 1х120-1', 'КА9СПвП', ['нг(А)-HF', '1']],
    ['ВВГ 3х1 нг (12)', 'ВВГ', ['нг', '(12)']],
    ['ВВГ 3х1 нг(12)э', 'ВВГ', ['нг(12)э']],
    ['RE-2x(ST)Y-FL нг(А)LS 16x2х1', 'RE-2x(ST)Y-FL', ['нг(А)-LS']],
    ['Alsecure FR N1 X1 G1-R 4х1.5', 'Alsecure FR N1 X1 G1-R', []],
  ])('согласованно выделяет марку и признаки: %s', (name, mark, attributes) => {
    expect(parseProductName(name)).toMatchObject({ mark, attributes });
  });

  test.each([
    'Греющий кабель SRL-16-2',
    'Греющий кабель Heatus 40GSR2',
    'Розет.235 3Р+РЕ+N 63А 380В IP67 EKF',
    'Belden 9842',
    'F/UTP кат.5е 4pr 24 AWG',
    'LMR 400',
    'Шкаф IP54',
    'КВВГ',
  ])('не придумывает одну жилу из артикула: %s', (name) => {
    const result = normalizeImportedProduct({
      name,
      unit: 'м',
      price: 10,
      stock: 1,
    });
    expect(result.name).toBe(name);
    expect(result.cores).toBeNull();
    expect(result.crossSection).toBeNull();
  });

  test.each(['0,035', '0.035', '0,125'])(
    'сохраняет десятичную точность сечения %s',
    (section) => {
      const expected = Number(section.replace(',', '.'));
      expect(parseProductName(`МГТФ ${section}`).crossSection).toBe(expected);
      expect(parseProductName(`КВВГ 3х${section}`).crossSection).toBe(expected);
    }
  );

  test('разбирает сечение, слитное с полным пожарным суффиксом', () => {
    expect(parseProductName('КПВСВ нг(А)FRLS Ltx1x2x0.75')).toMatchObject({
      mark: 'КПВСВ',
      conductorConfiguration: '1х2х0.75',
      cores: 1,
      groupCores: 2,
      crossSection: 0.75,
      attributes: ['нг(А)-FRLS-LTx'],
    });
  });
  test('распознаёт слитный AWG и не приписывает ему мм2', () => {
    expect(
      parseProductName('UNITRONIC BUS DN THICK FDY1x2xAWG18')
    ).toMatchObject({
      mark: 'UNITRONIC BUS DN THICK FDY',
      conductorConfiguration: '1х2хAWG18',
      cores: 1,
      groupCores: 2,
      crossSection: null,
      attributes: ['AWG'],
    });
  });
  test('сохраняет текстовый множитель без выдуманного сечения', () => {
    expect(parseProductName('NMF-4IS-008S2C-YL 8 X Single MODE')).toMatchObject(
      {
        mark: 'NMF-4IS-008S2C-YL 8 X Single MODE',
        cores: null,
        crossSection: null,
        conductorConfiguration: null,
        parsingWarnings: ['missing_operand'],
      }
    );
  });

  test('не теряет производителя и экран при добавлении одной жилы', () => {
    const product = normalizeImportedProduct({
      name: 'LAPPKABEL H07V-K 2,5',
      unit: 'м',
      price: 1,
      stock: 1,
    });
    expect(product.fullName).toBe('LAPPKABEL H07V-K 1х2,5');
    const screened = normalizeImportedProduct({
      name: 'БПДОЭ 0,035',
      unit: 'м',
      price: 1,
      stock: 1,
    });
    expect(screened.fullName).toBe('БПДОЭ 1х0,035');
    expect(screened.sourceName).toBe('БПДОЭ 0,035');
    expect(normalizeImportedProduct(screened)).toEqual(screened);
  });

  test('отделяет явное напряжение и сохраняет диапазон', () => {
    expect(parseProductName('АПвПу 1х240/50 6/10 кВ')).toMatchObject({
      conductorConfiguration: '1х240/50',
      voltage: 10,
      attributes: ['6/10 кВ'],
    });
    expect(parseProductName('ВВГ 0,66 кВ 3х1')).toMatchObject({
      mark: 'ВВГ',
      voltage: 0.66,
      attributes: [],
    });
  });

  test('разбирает простой кабель ВВГ 3х2.5', () => {
    expect(parseProductName('ВВГ 3х2.5')).toMatchObject({
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      hasGroundCore: false,
      voltage: null,
    });
  });

  test('распознаёт запятую как разделитель дробной части', () => {
    expect(parseProductName('ВВГнг(А)-LS 3х2,5')).toMatchObject({
      mark: 'ВВГ',
      attributes: ['нг(А)-LS'],
      cores: 3,
      crossSection: 2.5,
    });
  });

  test('поддерживает латинскую x и кириллическую х', () => {
    expect(parseProductName('ВВГ 3x2.5').crossSection).toBe(2.5);
    expect(parseProductName('ВВГ 3х2.5').crossSection).toBe(2.5);
    expect(parseProductName('ВВГ 3×2.5').crossSection).toBe(2.5);
  });

  test('распознаёт жилу заземления через +', () => {
    const parsed = parseProductName('ВВГ 3х2.5 + 1х1.5');
    expect(parsed).toMatchObject({
      cores: 3,
      crossSection: 2.5,
      hasGroundCore: true,
      groundCores: 1,
      groundSection: 1.5,
    });
  });

  test.each([
    [
      'РУТЕКзнг(А)LSxh(KH)14х(2х1)э ВВБ-80',
      '14х(2х1)',
      14,
      2,
      1,
      ['З', 'нг(А)', 'LSxh(KH)', 'Э', 'ВВБ-80'],
    ],
    ['Герда КВК нг(А) 2х(2х1.5)э', '2х(2х1.5)', 2, 2, 1.5, ['нг(А)', 'Э']],
    ['Герда КВК нг(А)LS 16х(2х1)э', '16х(2х1)', 16, 2, 1, ['нг(А)-LS', 'Э']],
    ['КУПЭКШВ 7х(3х1)э нг(А)LS', '7х(3х1)', 7, 3, 1, ['Э', 'нг(А)-LS']],
    [
      'КУПЭКШВ (7х(2х1,5)э)э нг(А)LS',
      '7х(2х1,5)',
      7,
      2,
      1.5,
      ['Э', 'нг(А)-LS'],
    ],
    [
      'НИКИ-КУВШЭк нг(А)FRLS 4х(2х0,5мкл1)',
      '4х(2х0,5мкл1)',
      4,
      2,
      0.5,
      ['нг(А)-FRLS'],
    ],
    [
      'НИКИ-КУВШЭмнг(А)LS-хл-С 2х(2х1м)',
      '2х(2х1м)',
      2,
      2,
      1,
      ['ЭМ', 'нг(А)-LS-ХЛ', 'С'],
    ],
    [
      'МКЭфКШВ нг(А)FRLS (19х(2х1)эф)э',
      '19х(2х1)',
      19,
      2,
      1,
      ['нг(А)-FRLS', 'ЭФ', 'Э'],
    ],
    ['МКЭШВ нг(А)LS 4х(2х1)эа', '4х(2х1)', 4, 2, 1, ['нг(А)-LS', 'ЭА']],
    ['МКЭШВ нг(А)LS 5х(2х1)эм', '5х(2х1)', 5, 2, 1, ['нг(А)-LS', 'ЭМ']],
    ['МКЭШВ нг(А)LS 6х(2х1)ээ', '6х(2х1)', 6, 2, 1, ['нг(А)-LS', 'ЭЭ']],
    ['МКЭШВ нг(А)LS 2х(3х1)з', '2х(3х1)', 2, 3, 1, ['нг(А)-LS', 'З']],
    ['ВВГнг(А)LS (5х1эф)э', null, 5, null, 1, ['нг(А)-LS', 'ЭФ', 'Э']],
  ])(
    'сохраняет групповое сечение целиком: %s',
    (
      name,
      conductorConfiguration,
      cores,
      groupCores,
      crossSection,
      attributes
    ) => {
      expect(parseProductName(name)).toMatchObject({
        conductorConfiguration,
        cores,
        groupCores,
        crossSection,
        attributes,
      });
    }
  );

  test.each([
    ['ИнСил-А знг(А)LS 6х1,5', 'ИнСил-А', ['З', 'нг(А)-LS']],
    ['КУМП-Б з нг(А)LS-хл 7х1', 'КУМП-Б', ['З', 'нг(А)-LS-ХЛ']],
    ['МКЭКШВвз нг(А)LS 4х2х1.5', 'МКЭКШВв', ['З', 'нг(А)-LS']],
    ['КРУИН МРЭфнзнг 2х2х1 (А)FRLS', 'МРЭфн', ['З', 'нг(А)-FRLS']],
    [
      'РУТЕКзнг(А)LSxh(KH)14х(2х1)э ВВБ-80',
      'РУТЕК',
      ['З', 'нг(А)', 'LSxh(KH)', 'Э', 'ВВБ-80'],
    ],
  ])(
    'относит З перед нг к конструктивным суффиксам: %s',
    (name, mark, attributes) => {
      expect(parseProductName(name)).toMatchObject({ mark, attributes });
    }
  );

  test('сохраняет составную групповую конфигурацию без ложных числовых полей', () => {
    expect(parseProductName('LIY(ST)CY 3х(2х0.22)+1х(3х0.56)')).toMatchObject({
      mark: 'LIY(ST)CY',
      conductorConfiguration: '3х(2х0.22)+1х(3х0.56)',
      cores: null,
      groupCores: null,
      crossSection: null,
      attributes: [],
    });
  });

  test('извлекает напряжение (0.66 кВ)', () => {
    expect(parseProductName('АВВГ 4х16 0.66кВ').voltage).toBe(0.66);
    expect(parseProductName('АВВГ 4х16 1кВ').voltage).toBe(1);
  });

  test('выделяет производителя-префикс (SIEMENS)', () => {
    const parsed = parseProductName('SIEMENS 2х2х0.32');
    expect(parsed.manufacturer).toBe('SIEMENS');
    // Когда марка пустая после срезания префикса — используем производителя
    expect(parsed.mark).toBe('SIEMENS');
  });

  test('выделяет производителя но сохраняет марку после него', () => {
    const parsed = parseProductName('HELUKABEL F-CY-JZ 2х1');
    expect(parsed.manufacturer).toBe('HELUKABEL');
    expect(parsed.mark).toBe('F-CY-JZ');
    expect(parsed.cores).toBe(2);
    expect(parsed.crossSection).toBe(1);
  });

  test('нормализует нгLS → нг-LS в атрибутах', () => {
    const parsed = parseProductName('ВВГ 3х2.5 нгLS');
    expect(parsed.attributes).toContain('нг-LS');
  });

  test('нормализует нг(А)LSLtx → нг(А)-LS-LTx', () => {
    const parsed = parseProductName('ВВГ 3х2.5 нг(А)LSLtx');
    expect(parsed.attributes.join(' ')).toContain('нг(А)-LS-LTx');
  });

  test.each([
    ['ВВГнг(а)LS 3х2.5', 'ВВГ', 'нг(А)-LS'],
    ['КА9СПвПнг(А)HF 1х120-1', 'КА9СПвП', 'нг(А)-HF'],
    ['МКЭКШВ нг(А)FRLS 4х1', 'МКЭКШВ', 'нг(А)-FRLS'],
    ['КПЭТИ нг(В)FRHF 2х1', 'КПЭТИ', 'нг(В)-FRHF'],
    ['ИнСил-ОЭБ нг(А)LS-хл 5х1.5', 'ИнСил-ОЭБ', 'нг(А)-LS-ХЛ'],
    ['БПВЛЭ нг(С) 1х70', 'БПВЛ', 'нг(С)'],
    ['КИМВ-э нг 5х1', 'КИМВ', 'нг'],
    ['ТППнг 10х2х0.5 (А)HF', 'ТПП', 'нг(А)-HF'],
    ['КУИН нг(А)FR 3х0.5', 'КУИН', 'нг(А)-FR'],
    ['Сегмент-КУнг(А)K-LS хл 5х10', 'Сегмент-КУ', 'нг(А)-ХЛ'],
  ])(
    'отделяет пожаробезопасный суффикс от любой марки: %s',
    (name, expectedMark, expectedAttribute) => {
      const parsed = parseProductName(name);

      expect(parsed.mark).toBe(expectedMark);
      expect(parsed.markFamily).toBe(
        expectedMark.replace(/\s+/g, '').toUpperCase()
      );
      expect(parsed.attributes).toContain(expectedAttribute);
    }
  );

  test('отделяет суффикс после пробела и сохраняет следующий атрибут', () => {
    expect(parseProductName('ВКВ нг(А)LS УФ 1х2.5')).toMatchObject({
      mark: 'ВКВ',
      attributes: ['нг(А)-LS', 'УФ'],
    });
  });

  test('объединяет раздельно записанные части модификации', () => {
    expect(parseProductName('ВВГ 3х2.5 нг(а) LS LTx').attributes).toEqual([
      'нг(А)-LS-LTx',
    ]);
  });

  test('убирает пробел между нг и классом пожарной опасности', () => {
    expect(parseProductName('ВКВнг (А)LS 3х2.5')).toMatchObject({
      mark: 'ВКВ',
      attributes: ['нг(А)-LS'],
    });
  });

  test.each([
    ['КВВГЭнг(А)-LS 5х1,0', 'КВВГ', ['Э', 'нг(А)-LS']],
    ['КВВГЭнг(А)-LS 4х1,5', 'КВВГ', ['Э', 'нг(А)-LS']],
    ['КИМВ-э нг 5х1', 'КИМВ', ['Э', 'нг']],
    ['БПВЛЭ нг(С) 1х70', 'БПВЛ', ['Э', 'нг(С)']],
    ['АВВГЭ 4х16', 'АВВГ', ['Э']],
  ])(
    'относит экран Э к атрибутам без изменения отображаемого написания: %s',
    (name, mark, attributes) => {
      expect(parseProductName(name)).toMatchObject({ mark, attributes });
    }
  );

  test('не изменяет обычное слово с буквами нг', () => {
    expect(parseProductName('Лонгрид 2х1').mark).toBe('Лонгрид');
    expect(parseProductName('РАНГ 2х1').mark).toBe('РАНГ');
    expect(parseProductName('ППСТВМНГ 2х1').mark).toBe('ППСТВМНГ');
  });

  test('извлекает суффикс у позиции без стандартной спецификации NхS', () => {
    expect(parseProductName('ОКЛнг(А)-HF-0.22-8П')).toMatchObject({
      mark: 'ОКЛ',
      attributes: ['нг(А)-HF', '0.22-8П'],
    });
  });

  test('не считает произвольные скобки классом пожарной опасности', () => {
    expect(parseProductName('РУТЕКзнг(12)э 2х1').mark).toBe('РУТЕКзнг(12)э');
  });

  test('одножильный кабель без х: "ПуГВ 2.5" → 1х2.5', () => {
    const parsed = parseProductName('ПуГВ 2.5');
    expect(parsed).toMatchObject({
      mark: 'ПуГВ',
      cores: 1,
      crossSection: 2.5,
      isImplicitSingleCore: true,
    });
  });

  test('пустая строка возвращает пустые поля', () => {
    expect(parseProductName('')).toMatchObject({
      mark: '',
      markFamily: '',
      cores: null,
      crossSection: null,
    });
  });
});

describe('parseCombinedCell', () => {
  test('парсит строку с единицей, ценой и остатком на конце', () => {
    expect(parseCombinedCell('ВВГ 3х2.5 м 123.50 5')).toEqual({
      name: 'ВВГ 3х2.5',
      unit: 'м',
      price: 123.5,
      stock: 5,
    });
  });

  test('работает без единицы измерения в строке', () => {
    expect(parseCombinedCell('Кабель АБВ 100.5 0.02')).toMatchObject({
      name: 'Кабель АБВ',
      price: 100.5,
      stock: 0.02,
    });
  });

  test('не считает заголовок раздела товаром (нет хвоста цена+остаток)', () => {
    // Раньше этот баг давал фейковый товар с price=1, stock=3
    expect(parseCombinedCell('Провод медный ПВ1,ПВ3,ПУВ,ПУГВ,ПГВА')).toBeNull();
  });

  test('возвращает null для названия без цены/остатка на конце', () => {
    expect(parseCombinedCell('Кабель КВПЭфВП-5е')).toBeNull();
  });

  test('возвращает null для пустой строки', () => {
    expect(parseCombinedCell('')).toBeNull();
    expect(parseCombinedCell(null)).toBeNull();
  });

  test('парсит формат с запятой как разделителем тысяч в цене', () => {
    const result = parseCombinedCell('ВВГ 3х2.5 км 36,600 0.183');
    expect(result).toMatchObject({
      unit: 'км',
      price: 36600,
      stock: 0.183,
    });
  });
});

describe('normalizeImportedProduct', () => {
  test.each([
    ['ВВГ 3х2.5 нгLS', 'ВВГ 3х2.5 нг-LS'],
    ['ВВГ 3х2.5 нг(А)LS', 'ВВГ 3х2.5 нг(А)-LS'],
    ['ВВГ 3х2.5 нгхл', 'ВВГ 3х2.5 нг-ХЛ'],
    ['ВВГнг(а)LS 3х2.5', 'ВВГнг(А)-LS 3х2.5'],
    ['ВКВнг (А)LS 3х2.5', 'ВКВнг(А)-LS 3х2.5'],
    ['ВВГ 3х2.5 нг(А)-LS', 'ВВГ 3х2.5 нг(А)-LS'],
  ])('записывает нормализованное название: %s', (name, expected) => {
    const result = normalizeImportedProduct({
      name,
      unit: 'м',
      price: 100,
      stock: 1,
    });

    expect(result.name).toBe(expected);
    expect(result.fullName).toBe(expected);
  });

  test('пересчитывает цену и остаток из км в м', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      unit: 'км',
      price: 100000,
      stock: 1,
      category: 'Кабель ВВГ',
    });
    expect(result.unit).toBe('м');
    expect(result.price).toBe(100);
    expect(result.stock).toBe(1000);
  });

  test('«штука» сокращается до «шт»', () => {
    const result = normalizeImportedProduct({
      name: 'Автомат',
      unit: 'штука',
      price: 100,
      stock: 1,
    });
    expect(result.unit).toBe('шт');
  });

  test('заполняет mark/markFamily для кабеля', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      unit: 'м',
      price: 100,
      stock: 1,
    });
    expect(result.mark).toBe('ВВГ');
    expect(result.markFamily).toBe('ВВГ');
    expect(result.cores).toBe(3);
    expect(result.crossSection).toBe(2.5);
  });

  test('сохраняет sourceCategory отдельно от category', () => {
    const result = normalizeImportedProduct({
      name: 'ВВГ 3х2.5',
      category: 'Кабель ВВГ',
      sourceCategory: 'Кабели силовые',
      unit: 'м',
      price: 100,
      stock: 1,
    });
    expect(result.sourceCategory).toBe('Кабели силовые');
    expect(result.category).toBe('Кабель ВВГ');
  });
});

describe('resolveCategory', () => {
  test('использует sourceCategory если она совместима с семейством', () => {
    const product = {
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      sourceCategory: 'Кабель ВВГ, ВВГнг',
      name: 'ВВГ 3х2.5 нг',
    };
    expect(resolveCategory(product)).toBe('Кабель ВВГ, ВВГнг');
  });

  test('не считает ВВГ совместимым с категорией КВВГ', () => {
    const product = {
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      sourceCategory: 'Кабель КВВГ, КВВГнг, КВВГнгls',
      name: 'ВВГ 3х2.5 нг',
    };
    expect(resolveCategory(product)).toBe('Кабель ВВГ');
  });

  test('товары с суффиксом внутри марки используют базовую категорию', () => {
    const product = {
      mark: 'ВВГ',
      markFamily: 'ВВГ',
      attributes: ['нг(А)-LS'],
      sourceCategory: 'Без категории',
      name: 'ВВГнг(А)-LS 3х2.5',
    };
    expect(resolveCategory(product)).toBe('Кабель ВВГ');
  });

  test('игнорирует несовместимую sourceCategory и применяет алиас', () => {
    // «Гидротолкатели» пришли по соседству в прайсе, но семейство — Энерготерм
    const product = {
      mark: 'Энерготерм-600',
      markFamily: 'ЭНЕРГОТЕРМ-600',
      sourceCategory: 'Гидротолкатели',
      name: 'Энерготерм-600 2х2.5',
    };
    const resolved = resolveCategory(product);
    expect(resolved).not.toBe('Гидротолкатели');
    expect(resolved.toLowerCase()).toContain('энерготерм');
  });

  test('применяет алиас для NYM → "Кабель NYY, NUM"', () => {
    const product = {
      mark: 'NYM',
      markFamily: 'NYM',
      sourceCategory: 'Без категории',
      name: 'NYM 3х1.5',
    };
    expect(resolveCategory(product)).toBe('Кабель NYY, NUM');
  });

  test('возвращает "Без категории" для пустого товара', () => {
    expect(resolveCategory({ mark: '', markFamily: '', name: '' })).toBe(
      'Без категории'
    );
  });
});

describe('buildCategoryMap', () => {
  test('выбирает самую частую совместимую категорию для семейства', () => {
    const products = [
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ, ВВГнг' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ, ВВГнг' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ' },
    ];
    const map = buildCategoryMap(products);
    expect(map.get('ВВГ')).toBe('Кабель ВВГ, ВВГнг');
  });

  test('пропускает несовместимые категории', () => {
    const products = [
      { markFamily: 'ВВГ', sourceCategory: 'Гидротолкатели' },
      { markFamily: 'ВВГ', sourceCategory: 'Кабель ВВГ' },
    ];
    const map = buildCategoryMap(products);
    expect(map.get('ВВГ')).toBe('Кабель ВВГ');
  });
});
