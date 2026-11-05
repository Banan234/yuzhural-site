// Подготовка строк прайса: чтение раскладки Excel, нормализация и допуск позиций.

import {
  buildCategoryMap,
  createEmptyImportResult,
  normalizeImportedProduct,
  parseCombinedCell,
  resolveCategory,
} from './priceParser.js';
import {
  classifyProduct,
  decodeCable,
  isCableCatalogProduct,
} from './catalogClassifier.js';
import { buildProductDesignation } from '../../shared/productDesignation.js';
import { resolveProductDisposition } from './importDisposition.js';
import { buildStableKey } from './productRegistry.js';

const REQUIRED_HEADER_TOKENS = ['наименование', 'ед.изм', 'цена', 'остаток'];
const PAGE_COLUMNS = {
  left: [0, 1, 2, 3],
  right: [5, 6, 7, 8],
};

export function detectSchema(rows) {
  const headerRowIndexes = [];
  const detectedHeaders = new Set();

  rows.forEach((row, index) => {
    if (!isHeaderRow(row)) return;
    headerRowIndexes.push(index);
    for (const cell of row) {
      const value = String(cell ?? '')
        .trim()
        .toLowerCase();
      if (!value) continue;
      for (const token of REQUIRED_HEADER_TOKENS) {
        if (value.includes(token)) {
          detectedHeaders.add(token);
        }
      }
    }
  });

  const missingHeaders = REQUIRED_HEADER_TOKENS.filter(
    (token) => !detectedHeaders.has(token)
  );

  return {
    headerRowsFound: headerRowIndexes.length,
    detectedHeaders: [...detectedHeaders].sort(),
    missingHeaders,
    pageColumns: PAGE_COLUMNS,
    pagePattern:
      'left=cols[0,1,2,3] / right=cols[5,6,7,8]; чтение «по книге»: верх→правый,левый; низ→левый,правый',
  };
}

export function extractProducts(
  rows,
  { applyPriceOverride = (product) => product } = {}
) {
  const result = createEmptyImportResult();
  result.physicalRows = rows.length;
  result.totalRows = rows.filter((row) =>
    row.some((cell) => cell !== '' && cell != null)
  ).length;
  result.categoriesSeen = new Set();

  const orderedPages = buildBookReadingOrder(splitRowsIntoBlocks(rows));

  for (const page of orderedPages) {
    let currentCategory = 'Без категории';

    for (const item of page.rows) {
      const { row, rowIndex } = item;
      const pageCells = pickPageCells(row, page.side);
      const record = parsePageRow(pageCells, row, currentCategory, rowIndex, {
        applyPriceOverride,
      });

      if (!record) {
        continue;
      }

      const columns = PAGE_COLUMNS[page.side];
      const filled = columns.filter(
        (index) => row[index] !== '' && row[index] != null
      );
      const sourceCells = Object.fromEntries(
        ['name', 'unit', 'price', 'stock'].map((field, index) => [
          field,
          `${String.fromCharCode(65 + (filled.length === 1 ? filled[0] : columns[index]))}${rowIndex + 1}`,
        ])
      );
      const context = {
        sourceCells,
        sourceSheet: row.sheetName || null,
        sourceColumnIndex: filled.length === 1 ? filled[0] : columns[0],
      };
      if (record.value && typeof record.value === 'object') {
        if (record.type === 'product')
          Object.assign(record.value, context, {
            sourceIdentityRowIndex: row.identityRowIndex ?? rowIndex,
          });
        else Object.assign(record.value, context);
      }
      if (record.review) Object.assign(record.review, context);
      if (!['header', 'service'].includes(record.type))
        result.sourceObservations.push({
          ...context,
          rowIndex,
          type: record.type,
          combined: filled.length === 1,
          normalizedName: record.value?.name || record.value?.product || '',
          sourceName:
            record.value?.sourceName ||
            (filled.length === 1
              ? String(row[filled[0]] || '')
              : String(pageCells[0] || '')),
        });

      if (
        record.type === 'product' &&
        record.value.numberIssues?.length &&
        record.value.stock <= 0
      ) {
        result.suspiciousStockRows.push({
          ...context,
          rowIndex,
          row,
          category: currentCategory,
          product: record.value.name,
          price: record.value.price,
          stock: record.value.stock,
          code: 'non_positive_stock',
          suspicious: true,
          reason: 'Подозрительная строка: нулевой или отрицательный остаток',
        });
      }

      if (record.type === 'category') {
        currentCategory = record.value;
        result.categoriesSeen.add(currentCategory);
        continue;
      }

      if (record.type === 'header' || record.type === 'service') {
        continue;
      }

      if (record.type === 'skip' || record.type === 'invalid') {
        result.skippedRows.push(record.value);
        if (record.value.code === 'non_positive_stock')
          result.suspiciousStockRows.push(record.value);
        continue;
      }

      if (record.type === 'excluded') {
        result.excludedNonCable += 1;
        result.skippedRows.push({
          rowIndex,
          product: pageCells.join(' '),
          category: currentCategory,
          reason: `Исключена некабельная позиция (${currentCategory})`,
          expectedExclusion: true,
        });
        continue;
      }

      result.products.push(record.value);
      if (record.review) {
        result.reviewRows.push(record.review);
      }
    }
  }

  return result;
}

export function splitRowsIntoBlocks(rows) {
  const headerIndexes = [];

  rows.forEach((row, index) => {
    if (isHeaderRow(row)) {
      headerIndexes.push(index);
    }
  });

  return headerIndexes.map((startIndex, blockIndex) => {
    const endIndex = headerIndexes[blockIndex + 1] ?? rows.length;
    const blockRows = [];
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      blockRows.push({ row: rows[i], rowIndex: i });
    }

    return {
      index: blockIndex,
      rows: blockRows,
    };
  });
}

export function buildBookReadingOrder(blocks) {
  const orderedPages = [];

  for (let index = 0; index < blocks.length; index += 2) {
    const topBlock = blocks[index];
    const bottomBlock = blocks[index + 1];

    if (topBlock) {
      orderedPages.push({
        blockIndex: topBlock.index,
        side: 'right',
        rows: topBlock.rows,
      });
      orderedPages.push({
        blockIndex: topBlock.index,
        side: 'left',
        rows: topBlock.rows,
      });
    }

    if (bottomBlock) {
      orderedPages.push({
        blockIndex: bottomBlock.index,
        side: 'left',
        rows: bottomBlock.rows,
      });
      orderedPages.push({
        blockIndex: bottomBlock.index,
        side: 'right',
        rows: bottomBlock.rows,
      });
    }
  }

  return orderedPages;
}

export function pickPageCells(row, side) {
  const indexes = PAGE_COLUMNS[side];

  return indexes.map((columnIndex, index) =>
    index >= 2 && typeof row?.[columnIndex] === 'number'
      ? row[columnIndex]
      : String(row?.[columnIndex] ?? '').trim()
  );
}

export function parsePageRow(
  cells,
  sourceRow,
  category,
  rowIndex = null,
  { applyPriceOverride = (product) => product } = {}
) {
  const filledCells = cells.filter(Boolean);

  if (filledCells.length === 0) {
    return null;
  }

  if (isHeaderRow(cells)) {
    return { type: 'header' };
  }

  if (isServiceRow(cells)) {
    return { type: 'service' };
  }

  if (filledCells.length === 1) {
    const singleValue = filledCells[0];

    const parsed = parseCombinedCell(singleValue);

    if (parsed) {
      return createProductRecord(
        parsed,
        category,
        sourceRow,
        rowIndex,
        applyPriceOverride
      );
    }

    if (looksLikeCategoryHeading(singleValue)) {
      return {
        type: 'category',
        value: singleValue,
      };
    }

    return {
      type: 'invalid',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Не удалось распознать товарную строку из одной ячейки',
      },
    };
  }

  return createProductRecord(
    {
      name: cells[0],
      unit: cells[1] || '',
      price: cells[2] || 0,
      stock: cells[3] || 0,
    },
    category,
    sourceRow,
    rowIndex,
    applyPriceOverride
  );
}

export function createProductRecord(
  product,
  category,
  sourceRow = null,
  rowIndex = null,
  applyPriceOverride = (product) => product
) {
  const sourceName = product.sourceName || product.name;
  if (!String(sourceName ?? '').trim()) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Пустое наименование после нормализации',
      },
    };
  }
  const disposition = resolveProductDisposition({
    name: sourceName,
    sourceCategory: category,
    unit: product.unit,
  });
  if (disposition.status === 'exclude') {
    return { type: 'excluded' };
  }

  const normalizedProduct = applyPriceOverride(
    normalizeImportedProduct({
      ...product,
      category,
    })
  );
  const preliminaryClassification =
    disposition.status === 'review' ? classifyProduct(normalizedProduct) : null;
  const confirmedByMark =
    preliminaryClassification &&
    isCableCatalogProduct(preliminaryClassification) &&
    preliminaryClassification.catalogCategorySlug !== 'prochee' &&
    ['rule', 'keywordPrefix'].includes(
      preliminaryClassification.catalogClassificationSource
    );
  const effectiveDisposition = confirmedByMark
    ? {
        status: 'publish',
        reason: 'classified_cable_mark',
        evidence: preliminaryClassification.catalogClassificationMatch,
      }
    : disposition;
  const normalized = {
    ...normalizedProduct,
    sourceRowIndex: rowIndex,
    importDisposition: effectiveDisposition.status,
    dispositionReason: effectiveDisposition.reason,
    dispositionEvidence: effectiveDisposition.evidence,
  };

  if (!normalized.name) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Пустое наименование после нормализации',
      },
    };
  }

  if (
    normalized.price <= 0 &&
    normalized.stock <= 0 &&
    isCategoryRow(normalized.name)
  ) {
    return {
      type: 'category',
      value: normalized.name,
    };
  }

  if (normalized.numberIssues?.length)
    return { type: 'product', value: normalized };

  if (normalized.stock <= 0) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        code: 'non_positive_stock',
        suspicious: true,
        reason: 'Подозрительная строка: нулевой или отрицательный остаток',
        product: normalized.name,
        price: normalized.price,
        stock: normalized.stock,
      },
    };
  }

  if (normalized.price <= 0) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Отсутствует цена',
        product: normalized.name,
        stock: normalized.stock,
      },
    };
  }

  return {
    type: 'product',
    value: normalized,
    ...(effectiveDisposition.status === 'review' ||
    normalized.manufacturerMatch?.ambiguous
      ? {
          review: {
            rowIndex,
            row: sourceRow,
            category,
            product: normalized.name,
            sourceName: normalized.sourceName,
            reason:
              [
                effectiveDisposition.status === 'review'
                  ? `Требуется проверить решение импорта: ${effectiveDisposition.reason} (${effectiveDisposition.evidence})`
                  : null,
                normalized.manufacturerMatch?.ambiguous
                  ? 'В названии найдено несколько возможных производителей'
                  : null,
              ]
                .filter(Boolean)
                .join('; ') + '; позиция сохранена, требуется проверка',
          },
        }
      : {}),
  };
}

export function classifyEligibleProducts(
  products,
  { reviewRows = [], skippedRows = [], previousProducts = [], registry } = {}
) {
  const nameKey = (value) =>
    String(value || '')
      .trim()
      .replace(/\s+/gu, ' ')
      .toLowerCase();
  const categoryByFamily = buildCategoryMap(products);
  const classifiedProducts = products.map((product) => {
    const resolved = {
      ...product,
      category: resolveCategory(product, categoryByFamily),
    };

    const classified = {
      ...resolved,
      ...classifyProduct(resolved),
      cableDecoded: decodeCable(resolved.mark),
    };
    return {
      ...classified,
      designationDecoded: buildProductDesignation(classified),
    };
  });

  return classifiedProducts.filter((product) => {
    const row = {
      rowIndex: product.sourceRowIndex,
      sourceCells: product.sourceCells,
      sourceColumnIndex: product.sourceColumnIndex,
      sourceSheet: product.sourceSheet,
      product: product.name,
      sourceName: product.sourceName,
      category: product.sourceCategory,
    };
    if (!isCableCatalogProduct(product)) {
      skippedRows.push({
        ...row,
        reason: 'Классификатор подтвердил некабельный товар',
        expectedExclusion: true,
      });
      return false;
    }
    if (product.importDisposition === 'review') {
      const previousMatches = previousProducts.filter(
        (item) =>
          nameKey(item.sourceName || item.name) === nameKey(product.sourceName)
      );
      const sourceMatches = products.filter(
        (item) => nameKey(item.sourceName) === nameKey(product.sourceName)
      );
      const previous = previousMatches[0];
      const knownIdentity =
        previousMatches.length === 1 &&
        sourceMatches.length === 1 &&
        buildStableKey(previous) === buildStableKey(product) &&
        registry?.entries?.[buildStableKey(product)]?.id === previous.id;
      const review = reviewRows.find(
        (item) =>
          item.rowIndex === product.sourceRowIndex &&
          item.product === product.name
      );
      const reason = knownIdentity
        ? 'Классификация требует проверки; коммерческие данные известного товара проходят отдельную строгую проверку'
        : 'Кабельное назначение или идентификация не подтверждены; обновление позиции отложено';
      if (review) review.reason = reason;
      else reviewRows.push({ ...row, reason });
      if (knownIdentity) {
        // Keep the existing public taxonomy; this does not confirm cable construction.
        for (const field of [
          'name',
          'fullName',
          'title',
          'catalogSection',
          'catalogSectionSlug',
          'catalogCategory',
          'catalogCategorySlug',
          'catalogSubcategory',
          'catalogSubcategorySlug',
        ])
          if (previous[field] !== undefined) product[field] = previous[field];
        product.classificationReview = {
          reason: product.dispositionReason,
          previousId: previous.id,
          sourceCells: product.sourceCells,
        };
        return true; // Value errors are quarantined by the normal diagnostics below.
      }
      return false;
    }
    return true;
  });
}

export function isHeaderRow(cells) {
  const joined = cells
    .map((cell) => String(cell ?? ''))
    .join(' ')
    .toLowerCase();

  return (
    joined.includes('наименование') ||
    joined.includes('ед.изм') ||
    (joined.includes('цена') && joined.includes('остаток'))
  );
}

export function isCategoryRow(value) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (/\d/.test(normalized)) {
    return false;
  }

  return normalized.length > 2;
}

// Эвристика для подзаголовков внутри страницы, когда parseCombinedCell
// не смог распознать товар. Разрешаем цифры (например, «Кабель КВПЭфВП-5е»),
// но отсекаем мусор: слишком короткое, без букв, одни числа.
export function looksLikeCategoryHeading(value) {
  const normalized = String(value || '').trim();

  if (normalized.length < 3) {
    return false;
  }

  const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(normalized);
  if (!hasLetters) {
    return false;
  }

  // Отфильтровываем строки-хвосты прайса (ИНН, телефон и т.п.)
  if (isServiceRow([normalized])) {
    return false;
  }

  return true;
}

export function isServiceRow(cells) {
  const joined = cells.join(' ').toLowerCase();

  return (
    joined.includes('ооо') ||
    joined.includes('инн') ||
    joined.includes('адрес') ||
    joined.includes('телефон') ||
    joined.includes('e-mail') ||
    joined.includes('р/с') ||
    joined.includes('к/с') ||
    joined.includes('прайс-лист') ||
    joined.includes('цены действительны')
  );
}
