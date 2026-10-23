import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import index from '../shared/designationStandards.json' with { type: 'json' };
import guides from '../shared/designationReferenceGuides.json' with { type: 'json' };
import { searchDesignationStandards } from './searchDesignationStandards.js';
import { selectManufacturerTexts } from '../shared/manufacturerTexts.js';

describe('scoped reference and active standards corpus', () => {
  it('excludes obsolete, restricted legacy and future-effective standards from retrieval', async () => {
    for (const doc of index.standards) {
      expect(doc.currentInRussia).toBe(true);
      expect(doc.status.startsWith('active')).toBe(true);
      expect(doc.officialUrl).toMatch(/^https:\/\/protect\.gost\.ru\//u);
    }
    for (const id of [
      'gost-22483-2012',
      'gost-r-53768-2010',
      'gost-6323-79',
      'gost-26411-2024',
    ]) {
      expect(index.standards.some((doc) => doc.id === id)).toBe(false);
      expect(await searchDesignationStandards({ standard: id })).toEqual([]);
    }
    expect(
      await searchDesignationStandards({
        standard: 'gost-26411-85',
        asOf: '2027-07-01',
      })
    ).toEqual([]);
  });

  it('returns separate corrections alongside the base text instead of hiding replacement requirements', async () => {
    const hits = await searchDesignationStandards({
      standard: 'gost-31565-2012',
      query: 'дошкольных',
      limit: 10,
    });
    expect(hits.some((hit) => hit.amendmentTitle?.includes('Поправка'))).toBe(
      true
    );
    expect(hits[0].sourceUrl).toContain('/85715/');
    expect(hits[0].interpretationStatus).toBe(
      'source-evidence-requires-context-review'
    );
  });

  it('retrieves actual source pages for the requested standard and topic with provenance', async () => {
    const hits = await searchDesignationStandards({
      standard: 'ГОСТ 28763-90',
      query: 'цвет',
      limit: 3,
    });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.documentId).toBe('gost-28763-90');
      expect(hit.sourceUrl).toContain('#page=');
      expect(hit.automaticProductInference).toBe(false);
    }
    const testing = await searchDesignationStandards({
      standard: 'gost-31996-2012',
      topic: 'testing',
    });
    expect(testing.length).toBeGreaterThan(0);
    expect(testing.every((hit) => hit.topics.includes('testing'))).toBe(true);
  });

  it('preserves complete page numbering, source identity and separate unvalidated tables', async () => {
    for (const doc of index.standards) {
      const raw = await fs.readFile(doc.corpusPath);
      expect(crypto.createHash('sha256').update(raw).digest('hex')).toBe(
        doc.corpusSha256
      );
      const corpus = JSON.parse(raw);
      expect(corpus.sourceSha256).toBe(doc.sha256);
      expect(corpus.pages.map((page) => page.page)).toEqual(
        Array.from({ length: doc.pages }, (_, i) => i + 1)
      );
      expect(
        corpus.pages.every(
          (page) =>
            page.tableReviewStatus === 'not-validated-for-product-inference'
        )
      ).toBe(true);
    }
  });

  it('keeps identical symbols in different scopes and rejects normative documents as factory texts', () => {
    const scopes = guides.guides[0].scopes;
    const insulation = (id) =>
      scopes
        .find((scope) => scope.id === id)
        .rules.find((rule) => rule.field === 'insulation').values;
    expect(insulation('power-plastic-lv')['П']).toBe('halogen-free compound');
    expect(insulation('control')['П']).toBe('PE');
    expect(guides.guides[0].withheldSourceClaims.length).toBeGreaterThan(0);
    const doc = { ...index.standards[0], status: 'collected' };
    expect(
      selectManufacturerTexts(
        'test-family',
        [],
        [doc],
        [
          {
            familyIds: ['test-family'],
            documentId: doc.id,
            sourceSha256: doc.sha256,
            pages: [],
          },
        ]
      )
    ).toEqual([]);
  });
});
