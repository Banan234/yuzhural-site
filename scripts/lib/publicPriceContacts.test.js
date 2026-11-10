import { describe, expect, it } from 'vitest';
import XLSX from '@e965/xlsx';
import { publicPriceContacts } from './publicPriceContacts.js';
import { SITE_EMAIL } from '../../src/lib/siteConfig.js';

describe('publicPriceContacts', () => {
  it('updates public XLS contacts while preserving product values and the source', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['E-mail: kabelhome@mail.ru'],
        ['Кабель', 123.45, 500],
      ]),
      'Прайс'
    );
    const source = XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' });
    const before = Buffer.from(source);
    const output = publicPriceContacts(source);
    const sheet = XLSX.read(output).Sheets['Прайс'];
    expect(sheet.A1.v).toBe(`E-mail: ${SITE_EMAIL}`);
    expect([sheet.A2.v, sheet.B2.v, sheet.C2.v]).toEqual([
      'Кабель',
      123.45,
      500,
    ]);
    expect(source.equals(before)).toBe(true);
    expect(publicPriceContacts(output).equals(output)).toBe(true);
  });
  it('leaves unrelated buffers unchanged', () => {
    const source = Buffer.from('test fixture');
    expect(publicPriceContacts(source)).toBe(source);
  });
});
