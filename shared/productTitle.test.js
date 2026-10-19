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
    ['ПУГВВ 1х6 красн.', 'ПУГВВ'],
    ['КУИН-ПУГВВ 1х6 красн.', 'КУИН-ПУГВВ'],
    ['ВВГ 1х6 бел', 'ВВГ'],
    ['ПУГВ 1х6 красноватый', 'ПУГВ'],
    ['ПУГВ 1х6 неизвестный', 'ПУГВ'],
    ['ПУГВ 1х6 кор/син', 'ПУГВ'],
    ['ПУГВ 1х6 (красн. по запросу)', 'ПУГВ'],
    ['ПУГВ без сечения красн.', 'ПУГВ'],
  ])('не угадывает цвет и не меняет другие марки: %s', (title, mark) => {
    expect(formatCableProductTitle(title, { mark })).toBe(title);
  });
});
