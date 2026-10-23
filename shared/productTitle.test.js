import { describe, expect, test } from 'vitest';
import {
  formatCableProductTitle,
  formatCableProductAttributes,
} from './productTitle.js';
import { normalizeImportedProduct } from '../scripts/lib/priceParser.js';
import { buildStableKey } from '../scripts/lib/productRegistry.js';
import { buildProductMetaDescription } from '../src/lib/productSeo.js';

describe('цвета ПУГВ при импорте', () => {
  test.each([
    ['красн.', 'красный'],
    ['красн', 'красный'],
    ['КРАСНЫЙ', 'красный'],
    ['бел', 'белый'],
    ['черн.', 'чёрный'],
    ['черный', 'чёрный'],
    ['жёлт', 'жёлтый'],
    ['желтый', 'жёлтый'],
    ['зеленый', 'зелёный'],
    ['ж/з', 'жёлто-зелёный'],
    ['Ж/З', 'жёлто-зелёный'],
    ['желто-зеленый', 'жёлто-зелёный'],
    ['гол', 'голубой'],
    ['голуб', 'голубой'],
    ['голубой', 'голубой'],
    ['син', 'синий'],
    ['синий', 'синий'],
    ['кор.', 'коричневый'],
    ['корич', 'коричневый'],
    ['коричн.', 'коричневый'],
    ['оранж', 'оранжевый'],
    ['фиол', 'фиолетовый'],
    ['сер', 'серый'],
    ['розовый', 'розовый'],
    ['бежевый', 'бежевый'],
  ])('%s → %s', (sourceColor, color) => {
    const sourceName = `ПУГВ 6 ${sourceColor}`;
    const product = normalizeImportedProduct({ name: sourceName, unit: 'м' });
    expect(product).toMatchObject({
      name: `ПУГВ 1х6 ${color}`,
      fullName: `ПУГВ 1х6 ${color}`,
      sourceName,
      attributes: [sourceColor],
    });
    expect(normalizeImportedProduct(product)).toEqual(product);
    // Цвет в stableKey не меняется: старые SKU/slug остаются в реестре.
    expect(buildStableKey(product)).toBe(
      `пугв|1|6|||||${sourceColor.toLowerCase()}`
    );
  });

  test.each([
    ['ПУГВ 6 бел нг(А)LS', 'ПУГВнг(А)-LS 1х6 белый'],
    ['ПУГВ 6 нгLS коричн.', 'ПУГВнг-LS 1х6 коричневый'],
    ['ПУГВ 6 ж/з хл', 'ПУГВхл 1х6 жёлто-зелёный'],
    ['ПУГВ 6 хл ж/з', 'ПУГВхл 1х6 жёлто-зелёный'],
    ['ПУГВ 35 черн(импорт)', 'ПУГВ 1х35 чёрный(импорт)'],
  ])('сохраняет суффиксы и примечания: %s', (name, expected) => {
    const product = normalizeImportedProduct({ name, unit: 'м' });
    expect(product.name).toBe(expected);
    expect(product.sourceName).toBe(name);
  });

  test('применяет то же правило к существующей записи каталога', () => {
    const product = {
      id: 5050,
      sku: 'YU-0005050',
      slug: 'pugv-1h6-krasn-3wa',
      name: 'ПУГВ 1х6 красн.',
      mark: 'ПУГВ',
      attributes: ['красн.'],
    };
    expect(formatCableProductTitle(product.name, product)).toBe(
      'ПУГВ 1х6 красный'
    );
    expect(product.slug).toBe('pugv-1h6-krasn-3wa');
    expect(formatCableProductAttributes(product)).toEqual(['красный']);
    expect(product.attributes).toEqual(['красн.']);
    const description = buildProductMetaDescription({
      ...product,
      title: formatCableProductTitle(product.name, product),
    });
    expect(description).toContain('красный');
    expect(description).not.toContain('красн.');
  });

  test.each([
    ['ПУГВ 1х6 красноватый', 'ПУГВ'],
    ['ПУГВ 1х6 неизвестный', 'ПУГВ'],
    ['ПУГВ 1х6 кор/син', 'ПУГВ'],
    ['ПУГВ 1х6 (красн. по запросу)', 'ПУГВ'],
    ['ПУГВ без сечения красн.', 'ПУГВ'],
  ])('не угадывает неизвестные цвета и примечания: %s', (title, mark) => {
    expect(formatCableProductTitle(title, { mark })).toBe(title);
  });
});

describe('единые цвета всех марок', () => {
  test.each([
    ['ПВС 3х2.5 бел', 'ПВС 3х2.5 белый'],
    ['ШВВП 2х0.75 черн.', 'ШВВП 2х0.75 чёрный'],
    ['ПВ-1 1х6 ж/з', 'ПВ-1 1х6 жёлто-зелёный'],
    ['ПУГВВ 1х6 красн.', 'ПУГВВ 1х6 красный'],
    ['КУИН-ПУГВВ 1х6 красн.', 'КУИН-ПУГВВ 1х6 красный'],
    ['ВВГ 1х6 бел', 'ВВГ 1х6 белый'],
    ['ПВКВ 1х1.5 розов.', 'ПВКВ 1х1.5 розовый'],
    ['МГШВ 1х0.5 бел/син', 'МГШВ 1х0.5 бело-синий'],
    ['МГШВ 1х0.5 бело/желт', 'МГШВ 1х0.5 бело-жёлтый'],
    ['МГШВ 1х0.5 сине/черн', 'МГШВ 1х0.5 сине-чёрный'],
    ['ПВС 3х2.5 (бел)', 'ПВС 3х2.5 (белый)'],
    ['ШВВП 2х0.75 (черн.)', 'ШВВП 2х0.75 (чёрный)'],
    ['ПВС 3х2.5 бел ндг LS', 'ПВС 3х2.5 белый ндг LS'],
  ])('%s → %s при импорте и выдаче', (sourceName, expected) => {
    const product = normalizeImportedProduct({ name: sourceName, unit: 'м' });
    expect(product.name).toBe(expected);
    expect(product.fullName).toBe(expected);
    expect(product.sourceName).toBe(sourceName);
    expect(normalizeImportedProduct(product)).toEqual(product);
    expect(formatCableProductTitle(sourceName, product)).toBe(expected);
    expect(formatCableProductTitle(expected, product)).toBe(expected);
    const attributes = [...product.attributes];
    const key = buildStableKey(product);
    const displayedAttributes = formatCableProductAttributes(product);
    expect(displayedAttributes.join(' ')).not.toMatch(
      /(?:^|[ (])(?:бел|черн|розов)\.?(?=$|[ )])/u
    );
    expect(product.attributes).toEqual(attributes);
    expect(buildStableKey(product)).toBe(key);
    expect(
      buildProductMetaDescription({ ...product, title: expected })
    ).toContain(expected);
  });

  test.each([
    'ПВС 3х2.5 (бел по запросу)',
    'ПВС 3х2.5 бел/неизвестный',
    'ПВС 3х2.5 белый с красной полосой',
    'ПВС без сечения бел',
    'БЕЛ 3х2.5',
  ])('сохраняет марку и неоднозначные обозначения: %s', (title) => {
    expect(formatCableProductTitle(title, { mark: title.split(' ')[0] })).toBe(
      title
    );
  });
});
