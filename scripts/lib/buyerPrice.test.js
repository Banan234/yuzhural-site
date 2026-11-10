import { describe, expect, it } from 'vitest';
import XLSX from '@e965/xlsx';
import { buildBuyerPrice, buyerPriceRows } from './buyerPrice.js';

const base = {
  id: 1,
  sku: 'A1',
  name: 'ВВГ 3х1,5',
  mark: 'ВВГ',
  catalogCategory: 'Силовой кабель',
  price: 100.25,
  stock: 0.005,
  unit: 'м',
};

describe('buyer price', () => {
  it('preserves independent offers, exact decimals and pending blanks in an XLSX with filters', async () => {
    const products = [
      base,
      { ...base, id: 2, sku: 'A2', price: 90 },
      {
        ...base,
        id: 3,
        sku: 'A3',
        dataStatus: 'pending',
        price: null,
        stock: null,
        unit: null,
      },
      {
        ...base,
        id: 4,
        sku: 'A4',
        name: '=HYPERLINK("https://example.test") < & >',
      },
    ];
    const buffer = await buildBuyerPrice(products, {
      generatedAt: '2026-11-07T07:00:00Z',
    });
    const book = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(book.Sheets['Прайс'], {
      header: 1,
      range: 6,
      defval: null,
    });
    expect(rows).toEqual(buyerPriceRows(products));
    expect(rows).toHaveLength(4);
    expect(book.Sheets['Прайс'].B7.f).toBeUndefined();
    const zip = XLSX.CFB.read(buffer, { type: 'buffer' });
    const entry = (name) =>
      Buffer.from(XLSX.CFB.find(zip, '/' + name).content).toString();
    expect(entry('xl/tables/table1.xml')).toContain('ref="A6:I10"');
    expect(entry('xl/worksheets/sheet1.xml')).toContain('state="frozen"');
    expect(entry('xl/worksheets/sheet1.xml')).not.toContain('{{DATE}}');
  });
  it('rejects invalid active commercial data and invalid publication dates', async () => {
    expect(() => buyerPriceRows([{ ...base, stock: null }])).toThrow();
    await expect(
      buildBuyerPrice([base], { generatedAt: 'bad' })
    ).rejects.toThrow();
    await expect(
      buildBuyerPrice([], { generatedAt: '2026-11-07' })
    ).rejects.toThrow();
  });
});
