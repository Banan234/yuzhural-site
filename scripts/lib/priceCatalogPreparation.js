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
import { resolveProductDisposition } from './importDisposition.js';

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
  result.totalRows = rows.length;
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
        continue;
      }

      if (record.type === 'excluded') {
        result.excludedNonCable += 1;
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

  return indexes.map((columnIndex) => String(row?.[columnIndex] ?? '').trim());
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
  const normalized = {
    ...normalizedProduct,
    sourceRowIndex: rowIndex,
    importDisposition: disposition.status,
    dispositionReason: disposition.reason,
    dispositionEvidence: disposition.evidence,
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

  if (normalized.stock <= 0) {
    return {
      type: 'skip',
      value: {
        rowIndex,
        row: sourceRow,
        category,
        reason: 'Нулевой или отрицательный остаток',
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
    ...(disposition.status === 'review' ||
    normalized.manufacturerMatch?.ambiguous
      ? {
          review: {
            rowIndex,
            row: sourceRow,
            category,
            product: normalized.name,
            reason:
              [
                disposition.status === 'review'
                  ? `Требуется проверить решение импорта: ${disposition.reason} (${disposition.evidence})`
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

export function classifyEligibleProducts(products) {
  const categoryByFamily = buildCategoryMap(products);
  const classifiedProducts = products.map((product) => {
    const resolved = {
      ...product,
      category: resolveCategory(product, categoryByFamily),
    };

    return {
      ...resolved,
      ...classifyProduct(resolved),
      cableDecoded: decodeCable(resolved.mark),
    };
  });

  const conflicts = classifiedProducts.filter(
    (product) => !isCableCatalogProduct(product)
  );
  if (conflicts.length > 0) {
    const examples = conflicts
      .slice(0, 10)
      .map(
        (product) =>
          `${product.name} [${product.sourceCategory || 'Без категории'}]`
      )
      .join('; ');
    throw new Error(
      `Классификатор вернул некабельные позиции после решения импорта (${conflicts.length}). ` +
        `Расширь правила importDisposition. Примеры: ${examples}`
    );
  }

  return classifiedProducts;
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
