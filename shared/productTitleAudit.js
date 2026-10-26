import { formatCableProductTitle } from './productTitle.js';

const PARAMETERS = new Set([
  'x',
  'х',
  'awg',
  'мм',
  'м',
  'км',
  'mm',
  'mm²',
  'mm2',
  'кв',
  'в',
  'kv',
  'v',
  'шт',
  'пар',
  'pr',
  'pair',
  'pairs',
  'кабель',
  'провод',
  'провода',
  'белый',
  'чёрный',
  'черный',
  'синий',
  'голубой',
  'серый',
  'красный',
  'жёлтый',
  'зелёный',
  'жёлто',
  'бело',
  'коричневый',
  'оранжевый',
]);

export function hasProductTitleIdentity(title) {
  const words =
    String(title || '')
      .toLocaleLowerCase('ru')
      .match(/[\p{L}]+/gu) || [];
  return words.some(
    (word) => !PARAMETERS.has(word.replace(/^[xх]+(?=awg$)/u, ''))
  );
}

export function auditProductTitles(products) {
  return products.flatMap((product) => {
    const title = product.title || product.fullName || product.name || '';
    const displayTitle = formatCableProductTitle(title, product);
    return hasProductTitleIdentity(displayTitle)
      ? []
      : [
          {
            code: 'title_missing_identity',
            sku: product.sku || null,
            rowIndex: product.sourceRowIndex ?? null,
            sourceName: product.sourceName || '',
            title: displayTitle,
            manufacturer: product.manufacturer || null,
            message:
              'В названии остались только параметры: нужна марка, модель или производитель.',
          },
        ];
  });
}
