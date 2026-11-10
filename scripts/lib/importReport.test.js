import { describe, expect, it } from 'vitest';
import { buildReportHtml } from './importReport.js';

describe('buildReportHtml', () => {
  it('отдельно показывает количество и полный список нерасшифрованных позиций', () => {
    const html = buildReportHtml({
      designationDecoding: {
        counts: { unresolved: 1, partial: 1, officialComplete: 0 },
        pending: [
          {
            sku: 'NEW-1',
            sourceName: '<неизвестная марка>',
            status: 'unresolved',
            reason: 'Нет семейства',
            unknown: ['<индекс>'],
          },
          {
            sku: 'OLD-2',
            sourceName: 'Кабель 2х1',
            status: 'partial',
            family: 'Кабель',
            reason: 'Неизвестный суффикс',
            warnings: ['Проверить размер'],
          },
        ],
      },
    });
    expect(html).toContain('Позиции без полной расшифровки (2)');
    expect(html).toContain(
      'Полностью без расшифровки: 1. Частично разобраны: 1.'
    );
    expect(html).toContain('NEW-1');
    expect(html).toContain('OLD-2');
    expect(html).toContain('&lt;неизвестная марка&gt;');
    expect(html).toContain('&lt;индекс&gt;');
    expect(html).toContain('Проверить размер');
  });
  it('показывает время импорта в часовом поясе Екатеринбурга', () => {
    const html = buildReportHtml({
      generatedAt: '2026-10-10T09:00:00.000Z',
      sourceFile: 'data/price.xls',
      summary: {},
      diff: {},
      productsByCategory: {},
      skippedRows: [],
      reviewRows: [],
      diagnostics: {},
      manufacturers: {},
      suspiciousPriceStats: {},
    });

    expect(html).toContain('14:00 (Екатеринбург)');
  });
});
