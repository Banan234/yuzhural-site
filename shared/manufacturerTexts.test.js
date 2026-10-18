import { describe, expect, it } from 'vitest';
import register from './manufacturerTexts.json' with { type: 'json' };
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import {
  mergeManufacturerTexts,
  selectManufacturerTexts,
} from './manufacturerTexts.js';
import { buildProductDesignation } from './productDesignation.js';
import { enrichPriceDesignations } from './productDesignationBatch.js';
import { buildProductDesignationHtml } from './productDesignationHtml.js';

describe('manufacturer application and description texts', () => {
  it('keeps all factory variants in future imports and static pages without changing the commercial data', () => {
    const input = {
      sku: 'new',
      mark: 'ПВС',
      sourceName: 'ПВС 3х1,5',
      price: 42,
    };
    const { products, report } = enrichPriceDesignations([input]);
    const { designationDecoded: decoded, ...original } = products[0];
    expect(original).toEqual(input);
    expect(decoded.manufacturerTexts.map((text) => text.documentId)).toEqual([
      'hka',
      'kam-2026',
      'samara-catalog',
    ]);
    expect(report.manufacturerTextCoverage.productsWithMultipleTexts).toBe(1);
    const html = buildProductDesignationHtml(input);
    for (const text of decoded.manufacturerTexts) {
      expect(html).toContain(text.text);
      expect(html).toContain(text.manufacturer);
      expect(text.url).toContain('#page=');
    }
    expect(enrichPriceDesignations(products).products).toEqual(products);
  });

  it('retains different texts, different publishers and historical versions; rejects silent replacement', () => {
    const first = register.records[0];
    const changed = {
      ...first,
      id: 'new-version',
      text: 'Другая версия назначения.',
    };
    const other = {
      ...first,
      id: 'other-factory',
      manufacturer: 'Другой завод',
    };
    expect(mergeManufacturerTexts([first], [first, changed, other])).toEqual([
      first,
      changed,
      other,
    ]);
    expect(() =>
      mergeManufacturerTexts([first], [{ ...first, text: 'Перезапись' }])
    ).toThrow('новый ID');
  });

  it('requires the exact resolved family, current official source and any execution restriction', () => {
    const record = register.records[0];
    const restricted = { ...record, firePattern: '^НГ\\(А\\)-?FRLS$' };
    const select = (codes, documents = knowledge.documents) =>
      selectManufacturerTexts(record.familyIds[0], codes, documents, [
        restricted,
      ]);
    expect(select([])).toEqual([]);
    expect(select(['НГ(А)-LS'])).toEqual([]);
    expect(select(['НГ(А)-FRLS'])).toHaveLength(1);
    expect(
      select(
        ['НГ(А)-FRLS'],
        knowledge.documents.map((doc) => ({ ...doc, sha256: 'changed' }))
      )
    ).toEqual([]);
    expect(selectManufacturerTexts(null, [], knowledge.documents)).toEqual([]);
    expect(
      buildProductDesignation({ mark: 'ПВСXYZ', sourceName: 'ПВСXYZ 3х1,5' })
        .manufacturerTexts
    ).toEqual([]);
    expect(
      buildProductDesignation({ mark: 'HELUKABEL' }).manufacturerTexts
    ).toEqual([]);
  });

  it('links every saved section to documented families and a collected factory source', () => {
    expect(new Set(register.records.map((text) => text.id)).size).toBe(
      register.records.length
    );
    for (const text of register.records) {
      const doc = knowledge.documents.find(
        (item) => item.id === text.documentId
      );
      expect(doc.publisherType).toBe('manufacturer');
      expect(doc.status).toBe('collected');
      expect(text.sourceSha256).toBe(doc.sha256);
      expect(
        text.familyIds.every((id) =>
          knowledge.families.some((family) => family.id === id)
        )
      ).toBe(true);
      expect(
        text.pages.every(
          (page) => Number.isInteger(page) && page > 0 && page <= doc.pages
        )
      ).toBe(true);
    }
  });

  it('keeps a base PVC construction summary off an HF execution while retaining other sections', () => {
    const record = register.records[0];
    const excluded = { ...record, excludedFirePattern: 'HF' };
    const select = (codes) =>
      selectManufacturerTexts(record.familyIds[0], codes, knowledge.documents, [
        excluded,
      ]);
    expect(select(['НГ(А)-LS'])).toHaveLength(1);
    expect(select(['НГ(А)-FRHF'])).toEqual([]);
  });
});
