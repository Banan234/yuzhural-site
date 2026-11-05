import { describe, it, expect } from 'vitest';
import { normalizeSip2Neutral } from './sip2Neutral.js';
import {
  parseProductName,
  normalizeImportedProduct,
} from '../scripts/lib/priceParser.js';
import { buildProductDesignation } from './productDesignation.js';
import { buildProductDesignationHtml } from './productDesignationHtml.js';
import { buildStableKey } from '../scripts/lib/productRegistry.js';
import { buildProductMetaDescription } from '../src/lib/productSeo.js';
import { createPendingProduct } from './productAvailability.js';
const sourceName = 'СИП-2 3х16+1х25';
const legacy = {
  sourceName,
  mark: 'СИП-2',
  cores: 3,
  crossSection: 16,
  hasGroundCore: true,
  groundCores: 1,
  groundSection: 25,
  attributes: [],
};
describe('documented SIP-2 neutral role, not PE', () => {
  it('corrects the generic parser only for the documented exact tuple', () => {
    const p = parseProductName(sourceName);
    expect(p).toMatchObject({
      hasGroundCore: false,
      groundCores: null,
      groundSection: null,
      neutralCores: 1,
      neutralSection: 25,
    });
    const normalized = normalizeSip2Neutral(legacy);
    expect(buildProductDesignation(normalized).officialComplete).toBe(true);
    expect(buildProductDesignationHtml(normalized)).toBe(
      buildProductDesignationHtml(legacy)
    );
    expect(buildStableKey(normalized)).toBe(buildStableKey(legacy));
    expect(buildProductMetaDescription(normalized)).toBe(
      buildProductMetaDescription(legacy)
    );
    expect(normalizeSip2Neutral(normalized)).toEqual(normalized);
    expect(createPendingProduct(normalized)).toMatchObject({
      neutralCores: 1,
      neutralSection: 25,
    });
  });
  it('propagates semantic fields through normal import normalization', () => {
    const p = normalizeImportedProduct({
      name: sourceName,
      unit: 'м',
      price: 100,
      stock: 10,
    });
    expect(p).toMatchObject({
      neutralCores: 1,
      neutralSection: 25,
      hasGroundCore: false,
      groundCores: null,
      price: 100,
      stock: 10,
    });
  });
  for (const source of [
    'СИП-2 2х70+1х70',
    'СИП-2 3х16+1х25+1х16',
    'СИП-2 3х16+1х35',
    'СИП-4 3х16+1х25',
  ]) {
    it(`does not promote unsupported combination ${source}`, () => {
      const p = { ...legacy, sourceName: source };
      expect(normalizeSip2Neutral(p)).toBe(p);
      expect(buildProductDesignation(p).officialComplete).toBe(false);
    });
  }
  it('retains conflicts and does not teach ordinary rules to ignore neutral fields', () => {
    for (const extra of [
      { mark: 'СИП-4' },
      { markFamily: 'СИП-1' },
      { groundSection: 35 },
      { groundCores: 2 },
      { crossSection: 25 },
      { voltage: 6 },
      { neutralCores: 2 },
      { neutralSection: 35 },
      { attributes: ['нг(А)-HF'] },
      { parsingWarnings: ['ambiguous'] },
    ]) {
      const p = { ...legacy, ...extra };
      expect(normalizeSip2Neutral(p)).toBe(p);
    }
    expect(
      buildProductDesignation({
        ...normalizeSip2Neutral(legacy),
        neutralSection: 35,
      }).officialComplete
    ).toBe(false);
    expect(
      buildProductDesignation({
        sourceName: 'ВВГ 3х2.5',
        mark: 'ВВГ',
        neutralCores: 1,
        neutralSection: 25,
      }).officialComplete
    ).toBe(false);
  });
});
