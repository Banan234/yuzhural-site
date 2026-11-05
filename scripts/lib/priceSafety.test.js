import { describe, it, expect } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { loadWorkbookRows } from '../importPrice.js';
import { normalizeImportedProduct } from './priceParser.js';
import {
  extractProducts,
  classifyEligibleProducts,
} from './priceCatalogPreparation.js';
import { validateNormalizedProducts } from './importDiagnostics.js';
import { quarantineInvalidProducts } from './quarantineProducts.js';
import { buildStableKey, assignStableIdentity } from './productRegistry.js';
import { buildReportHtml } from './importReport.js';

const cable = { name: 'ВВГ 3х2.5', unit: 'м', price: 100, stock: 10 };

describe('explicit commercial parsing', () => {
  it('never infers a missing unit or silently scales its commercial values', () => {
    const p = normalizeImportedProduct({
      ...cable,
      unit: '',
      price: 10000,
      stock: 0.2,
    });
    expect(p).toMatchObject({ unit: '', price: 10000, stock: 0.2 });
    const parsed = extractProducts([
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
      ['ВВГ 3х2.5', '', 10000, 0.2],
    ]);
    const classified = classifyEligibleProducts(parsed.products, parsed);
    const diagnostics = validateNormalizedProducts(classified);
    const result = quarantineInvalidProducts(
      classified,
      diagnostics.errors,
      parsed.reviewRows
    );
    expect(result.eligible).toEqual([]);
    expect(parsed.reviewRows).toEqual([
      expect.objectContaining({
        rowIndex: 1,
        sourceCells: { name: 'A2', unit: 'B2', price: 'C2', stock: 'D2' },
        codes: expect.arrayContaining(['invalid_unit']),
      }),
    ]);
  });
  it.each([
    ['1 234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1,234.56', 1234.56],
    ['98,700', 98700],
    [1234.567, 1234.567],
  ])('applies the documented source format to %s', (price, expected) => {
    expect(normalizeImportedProduct({ ...cable, price }).price).toBe(expected);
  });
  it.each(['1.234,56', '1,23,45', '12,345,67', '12x34', '1 23', Infinity, NaN])(
    'diagnoses unsupported/ambiguous numeric input %s',
    (price) => {
      const p = normalizeImportedProduct({ ...cable, price });
      expect(Number.isNaN(p.price)).toBe(true);
      expect(p.numberIssues).toEqual([
        expect.objectContaining({ field: 'price', code: 'number_format' }),
      ]);
      const diagnostics = validateNormalizedProducts([p]);
      expect(diagnostics.errors.map((e) => e.code)).toContain('number_format');
      expect(diagnostics.errors.map((e) => e.code)).toContain('invalid_price');
    }
  );
  it('converts only explicitly supplied units', () => {
    expect(
      normalizeImportedProduct({
        ...cable,
        unit: 'км',
        price: 10000,
        stock: 0.2,
      })
    ).toMatchObject({ unit: 'м', price: 10, stock: 200 });
  });
});

describe('physical spreadsheet coordinates', () => {
  it('anchors A1, preserves leading/inner blanks and both page columns, without changing duplicate identity', async () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      [],
      [
        'Наименование',
        'Ед.изм',
        'Цена',
        'Остаток',
        '',
        'Наименование',
        'Ед.изм',
        'Цена',
        'Остаток',
      ],
      [],
      ['ВВГ 3х2.5', 'м', 100, 10, '', 'ВВГ 3х2.5', 'м', 200, 20],
      [],
      ['ВВГ 3х4', '', '1.234,56', 10],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Fixture');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });
    const physical = await loadWorkbookRows({ sourceBuffer: buffer });
    const result = extractProducts(physical);
    const left = result.products.find((p) => p.price === 100),
      right = result.products.find((p) => p.price === 200);
    expect(left).toMatchObject({
      sourceRowIndex: 3,
      sourceIdentityRowIndex: 1,
      sourceCells: { name: 'A4', unit: 'B4', price: 'C4', stock: 'D4' },
    });
    expect(right).toMatchObject({
      sourceRowIndex: 3,
      sourceIdentityRowIndex: 1,
      sourceCells: { name: 'F4', unit: 'G4', price: 'H4', stock: 'I4' },
    });
    expect(result.totalRows).toBe(3);
    expect(result.physicalRows).toBe(6);
    const registry = { version: 1, nextId: 1, entries: {} };
    const ids = (ps) => {
      const occurrences = new Map();
      return ps.map((p) => {
        const key = buildStableKey(p),
          n = occurrences.get(key) || 0;
        occurrences.set(key, n + 1);
        return assignStableIdentity(registry, p, '2026-10-27', {
          ...(n
            ? {
                identityDiscriminator: `row-${p.sourceIdentityRowIndex ?? p.sourceRowIndex}-occurrence-${n}`,
              }
            : {}),
        });
      });
    };
    const compact = XLSX.utils.sheet_to_json(wb.Sheets.Fixture, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
    const old = extractProducts(compact).products.filter((p) => p.price > 0);
    const previous = ids(old);
    const before = registry.nextId;
    expect(ids(result.products.filter((p) => p.price > 0))).toEqual(previous);
    expect(registry.nextId).toBe(before);
    const classified = classifyEligibleProducts(result.products, result),
      diagnostics = validateNormalizedProducts(classified);
    quarantineInvalidProducts(
      classified,
      diagnostics.errors,
      result.reviewRows
    );
    expect(result.reviewRows[0]).toMatchObject({
      rowIndex: 5,
      sourceCells: { name: 'A6', unit: 'B6', price: 'C6', stock: 'D6' },
    });
    const html = buildReportHtml({
      summary: {},
      skippedRows: [],
      reviewRows: result.reviewRows,
      diagnostics: {},
    });
    expect(html).toContain('A6, B6, C6, D6');
    expect(
      buildReportHtml({
        summary: {},
        skippedRows: [],
        reviewRows: [],
        diagnostics,
      })
    ).toContain('A6, B6, C6, D6');
  });
});

it('quarantines only the invalid column when identical names share an XLS row', () => {
  const parsed = extractProducts([
    [
      'Наименование',
      'Ед.изм',
      'Цена',
      'Остаток',
      '',
      'Наименование',
      'Ед.изм',
      'Цена',
      'Остаток',
    ],
    ['ВВГ 3х2.5', 'м', '1.234,56', 10, '', 'ВВГ 3х2.5', 'м', 100, 10],
  ]);
  const classified = classifyEligibleProducts(parsed.products, parsed);
  const diagnostics = validateNormalizedProducts(classified);
  const { eligible, quarantined } = quarantineInvalidProducts(
    classified,
    diagnostics.errors,
    parsed.reviewRows
  );
  expect(eligible).toHaveLength(1);
  expect(eligible[0]).toMatchObject({ price: 100, sourceColumnIndex: 5 });
  expect(quarantined).toHaveLength(1);
  expect(parsed.reviewRows[0].sourceCells.price).toBe('C2');
});

it('retains physical columns when the worksheet starts at F3 and reads underlying numeric values', async () => {
  const wb = XLSX.utils.book_new();
  const sheet = {
    '!ref': 'F3:I7',
    F3: { t: 's', v: 'Наименование' },
    G3: { t: 's', v: 'Ед.изм' },
    H3: { t: 's', v: 'Цена' },
    I3: { t: 's', v: 'Остаток' },
    F7: { t: 's', v: 'ВВГ 3х2.5' },
    G7: { t: 's', v: 'м' },
    H7: { t: 'n', v: 1234.567, z: '#,##0.00' },
    I7: { t: 'n', v: 0.123, z: '0.000' },
  };
  XLSX.utils.book_append_sheet(wb, sheet, 'Offset');
  const rows = await loadWorkbookRows({
    sourceBuffer: XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }),
  });
  const parsed = extractProducts(rows);
  expect(parsed.products).toHaveLength(1);
  expect(parsed.products[0]).toMatchObject({
    sourceRowIndex: 6,
    sourceIdentityRowIndex: 1,
    sourceCells: { name: 'F7', unit: 'G7', price: 'H7', stock: 'I7' },
    price: 1234.567,
    stock: 0.123,
  });
});

it('attributes a combined-cell product to its actual physical column', () => {
  const result = extractProducts([
    [
      'Наименование',
      'Ед.изм',
      'Цена',
      'Остаток',
      '',
      'Наименование',
      'Ед.изм',
      'Цена',
      'Остаток',
    ],
    ['', '', '', '', '', '', '', 'ВВГ 3х2.5 м 100 10', ''],
  ]);
  expect(result.products).toHaveLength(1);
  expect(result.products[0]).toMatchObject({
    sourceColumnIndex: 7,
    sourceCells: { name: 'H2', unit: 'H2', price: 'H2', stock: 'H2' },
  });
});

it('still flags zero stock when the same row has an ambiguous price', () => {
  const parsed = extractProducts([
    ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
    ['ВВГ 3х2.5', 'м', '1.234,56', 0],
  ]);
  expect(parsed.suspiciousStockRows).toEqual([
    expect.objectContaining({
      code: 'non_positive_stock',
      suspicious: true,
      stock: 0,
      rowIndex: 1,
    }),
  ]);
  const classified = classifyEligibleProducts(parsed.products, parsed);
  const diagnostics = validateNormalizedProducts(classified);
  expect(diagnostics.errors.map((e) => e.code)).toContain('number_format');
  expect(
    quarantineInvalidProducts(classified, diagnostics.errors, parsed.reviewRows)
      .eligible
  ).toEqual([]);
});

it('keeps the original malformed number from a combined source cell in diagnostics', () => {
  const parsed = extractProducts([
    ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
    ['ВВГ 3х2.5 м 1.234,56 10'],
  ]);
  expect(parsed.products).toHaveLength(1);
  expect(parsed.products[0].numberIssues[0]).toMatchObject({
    field: 'price',
    value: '1.234,56',
  });
  expect(parsed.products[0].sourceCells.price).toBe('A2');
});
