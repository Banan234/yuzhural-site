import { describe, expect, it } from 'vitest';
import { buildReportHtml } from './importReport.js';

describe('buildReportHtml', () => {
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
