import { describe, expect, it } from 'vitest';
import { buildSpecs } from './catalog.js';
import { getCatalogDisplayDimensions } from './catalogDisplayDimensions.js';
import { isCatalogBlockText } from './catalogEnrichment.js';

describe('catalog dimension presentation', () => {
  it('uses a reviewed diameter without rewriting imported identity fields', () => {
    const product = {
      mark: 'ВП',
      cores: 1,
      crossSection: 0.8,
      designationDecoded: {
        status: 'reviewed',
        tokens: [{ code: '1×0,8', text: 'Одна жила диаметром 0,8 мм' }],
      },
    };
    expect(buildSpecs(product)['Диаметр жилы']).toBe('0,8 мм');
    expect(buildSpecs(product)).not.toHaveProperty('Сечение жилы');
    expect(product.crossSection).toBe(0.8);
  });

  it('does not treat LAN pairs or AWG as a conductor area', () => {
    const product = {
      sourceName: 'U/UTP cat.5e 24AWG 4x2',
      catalogSubcategorySlug: 'lan-kabeli',
      cores: 4,
      crossSection: 2,
    };
    expect(getCatalogDisplayDimensions(product)).toEqual({
      kind: 'awg',
      gauge: 24,
      pairs: 4,
    });
    expect(buildSpecs(product)).toMatchObject({
      'Количество пар': '4',
      'Калибр проводника': '24 AWG',
    });
    expect(buildSpecs(product)).not.toHaveProperty('Сечение жилы');
  });

  it.each([
    ['FTP-5е 4х2', 4, 2],
    ['FTP-5е 1х2х24', 1, 24],
  ])('shows the documented pair count for %s without assigning a conductor size', (sourceName, pairs, crossSection) => {
    const product = {
      sourceName,
      cores: pairs,
      crossSection,
      designationDecoded: {
        status: 'reviewed',
        tokens: [{ code: `${pairs}×2`, text: `Количество пар: ${pairs}.` }],
      },
    };
    expect(getCatalogDisplayDimensions(product)).toEqual({ kind: 'pairs', pairs });
    const specs = buildSpecs(product);
    expect(specs['Количество пар']).toBe(String(pairs));
    expect(specs).not.toHaveProperty('Количество жил');
    expect(specs).not.toHaveProperty('Сечение жилы');
    expect(specs).not.toHaveProperty('Калибр проводника');
  });

  it('keeps optical modules and fibers separate from conductor dimensions', () => {
    const product = {
      catalogSubcategorySlug: 'optovolokonnye-kabeli',
      cores: 2,
      crossSection: 8,
      designationDecoded: {
        status: 'reviewed',
        tokens: [
          { code: '16У', text: '16 оптических волокон' },
          { code: '2×8', text: '2 оптических модуля, по 8 волокон' },
        ],
      },
    };
    expect(buildSpecs(product)).toMatchObject({
      'Количество оптических волокон': '16',
      'Оптические модули': '2 × 8 волокон',
    });
    expect(buildSpecs(product)).not.toHaveProperty('Количество жил');
    expect(
      buildSpecs({ ...product, designationDecoded: { status: 'partial' } })
    ).not.toHaveProperty('Количество оптических волокон');
    expect(buildSpecs(product)).not.toHaveProperty('Сечение жилы');
  });

  it('rejects unresolved template fields and preserves ordinary marking', () => {
    for (const value of [
      'Число пар — None',
      'undefined',
      'null×2',
      'NaN',
      '${pairs}',
      '{{pairs}}',
      '%s',
    ]) {
      expect(isCatalogBlockText(value)).toBe(false);
    }
    expect(isCatalogBlockText('24 пары. Сечение каждой жилы 0,5 мм².')).toBe(
      true
    );
  });
});
