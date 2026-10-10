// Проверки нормализованных товаров и единый формат замечаний импорта.

import { buildStableKey } from './productRegistry.js';

const VALID_UNITS = new Set(['м', 'шт', 'кг', 'тн', 'км', 'упак', 'бухта']);

function productDiagnostic(product, code, severity, message) {
  return {
    code,
    severity,
    message,
    rowIndex: Number.isInteger(product?.sourceRowIndex)
      ? product.sourceRowIndex
      : null,
    product: String(product?.name || product?.sourceName || ''),
    category: String(product?.sourceCategory || ''),
  };
}

export function validateNormalizedProducts(
  products = [],
  { excludedNonCable = 0, reviewRows = [] } = {}
) {
  const errors = [];
  const warnings = [];
  const info = [];
  const stableKeyGroups = new Map();

  for (const product of products) {
    if (!String(product?.name || '').trim()) {
      errors.push(
        productDiagnostic(
          product,
          'missing_name',
          'error',
          'Не заполнено нормализованное наименование.'
        )
      );
    }
    if (
      !Number.isFinite(Number(product?.price)) ||
      Number(product.price) <= 0
    ) {
      errors.push(
        productDiagnostic(
          product,
          'invalid_price',
          'error',
          'Цена должна быть числом больше нуля.'
        )
      );
    }
    if (
      !Number.isFinite(Number(product?.stock)) ||
      Number(product.stock) <= 0
    ) {
      errors.push(
        productDiagnostic(
          product,
          'invalid_stock',
          'error',
          'Остаток должен быть числом больше нуля.'
        )
      );
    }
    if (
      !VALID_UNITS.has(
        String(product?.unit || '')
          .trim()
          .toLowerCase()
      )
    ) {
      errors.push(
        productDiagnostic(
          product,
          'invalid_unit',
          'error',
          `Неизвестная единица измерения: ${product?.unit || '(пусто)'}.`
        )
      );
    }

    for (const warning of product?.parsingWarnings || []) {
      warnings.push(
        productDiagnostic(
          product,
          'parse_warning',
          'warning',
          `Предупреждение разбора: ${warning}.`
        )
      );
    }

    if (product?.manufacturerMatch?.ambiguous) {
      warnings.push(
        productDiagnostic(
          product,
          'ambiguous_manufacturer',
          'warning',
          `Неоднозначный производитель: ${(product.manufacturerMatch.candidates || []).join(', ')}.`
        )
      );
    }

    if (product?.importDisposition === 'review') {
      warnings.push(
        productDiagnostic(
          product,
          'disposition_review',
          'warning',
          'Исходная категория не подтверждает кабельный раздел; товар сохранён.'
        )
      );
    }

    if (
      product?.catalogClassificationSource === 'fallback' &&
      product?.catalogCategorySlug === 'prochee'
    ) {
      warnings.push(
        productDiagnostic(
          product,
          'fallback_category',
          'warning',
          'Категория не распознана; товар отнесён в «Прочее».'
        )
      );
    }

    const stableKey = buildStableKey(product);
    if (String(product?.mark || '').trim()) {
      const group = stableKeyGroups.get(stableKey) || [];
      group.push(product);
      stableKeyGroups.set(stableKey, group);
    }
  }

  const duplicateGroups = [];
  for (const [stableKey, group] of stableKeyGroups) {
    if (group.length < 2) continue;
    const rows = group
      .map((product) => product.sourceRowIndex)
      .filter(Number.isInteger);
    const names = [...new Set(group.map((product) => product.name))];
    const diagnostic = {
      code: 'duplicate_stable_key',
      severity: 'info',
      message: `Найдено ${group.length} отдельных строк с одинаковыми характеристиками; все позиции сохраняются раздельно, остатки не складываются.`,
      stableKey,
      rows,
      products: names,
    };
    duplicateGroups.push(diagnostic);
    info.push(diagnostic);
  }

  for (const row of reviewRows) {
    if (row?.manufacturerAmbiguous) continue;
    // Review уже представлен на товаре выше. Это fallback для диагностических
    // записей, созданных до нормализации (если товар не попал в products).
    if (!products.some((product) => product.sourceRowIndex === row.rowIndex)) {
      warnings.push({
        code: 'review_without_product',
        severity: 'warning',
        message: row.reason || 'Строка требует ручной проверки.',
        rowIndex: Number.isInteger(row.rowIndex) ? row.rowIndex : null,
        product: String(row.product || ''),
        category: String(row.category || ''),
      });
    }
  }

  if (excludedNonCable > 0) {
    info.push({
      code: 'excluded_non_cable',
      severity: 'info',
      message: `Явно некабельных строк исключено: ${excludedNonCable}.`,
      count: excludedNonCable,
    });
  }

  const missingManufacturer = products.filter(
    (product) => !product?.manufacturer
  ).length;
  if (missingManufacturer > 0) {
    info.push({
      code: 'manufacturer_not_detected',
      severity: 'info',
      message: `Производитель не распознан у ${missingManufacturer} товаров; это не считается ошибкой.`,
      count: missingManufacturer,
    });
  }

  return {
    errors,
    warnings,
    info,
    duplicateGroups,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
      duplicateGroups: duplicateGroups.length,
      reviewRows: reviewRows.length,
    },
  };
}
