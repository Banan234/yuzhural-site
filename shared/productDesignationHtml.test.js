import { describe, expect, it } from 'vitest';
import { buildProductDesignationHtml } from './productDesignationHtml.js';
import { buildCompactProductBodyShell } from '../scripts/prerender.js';

describe('product designation static HTML', () => {
  it('includes the block in runtime product pages without JavaScript', () => {
    const html = buildCompactProductBodyShell({
      title: 'ВВГ 3х2,5',
      mark: 'ВВГ',
      sourceName: 'ВВГ 3х2,5',
    });
    expect(html).toContain('Расшифровка обозначения');
    expect(html).toContain('сечение каждой жилы 2,5 мм²');
    expect(html).toContain('Источники расшифровки');
  });
  it('escapes catalogue text and preserves unconfirmed marks', () => {
    const html = buildProductDesignationHtml({
      mark: '<img src=x onerror=alert(1)>',
      sourceName: '<script>evil()</script> 3х2,5',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Требует уточнения:');
  });
});
