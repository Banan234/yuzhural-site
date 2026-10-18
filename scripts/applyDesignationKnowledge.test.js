import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  enrichPriceDesignations,
  applyDesignationKnowledge,
} from './applyDesignationKnowledge.js';
import knowledge from '../shared/designationKnowledgeBase.json' with { type: 'json' };

describe('documentation database application', () => {
  it('publishes through a catalog symlink and retains the previous release and other files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'designation-test-'));
    try {
      const release = path.join(root, 'data/.catalog-current-releases/source');
      await fs.mkdir(path.join(release, 'public'), { recursive: true });
      const original = [
        {
          sku: 'unchanged',
          mark: 'КСБ',
          sourceName: 'КСБ 1х2х0,8',
          price: 100,
          stock: 42,
        },
      ];
      const originalText = JSON.stringify(original);
      await fs.writeFile(path.join(release, 'products.json'), originalText);
      await fs.writeFile(
        path.join(release, 'public/retained.txt'),
        'other artifact'
      );
      await fs.writeFile(path.join(root, 'data/products.json'), originalText);
      await fs.symlink(
        '.catalog-current-releases/source',
        path.join(root, 'data/catalog-current')
      );
      const report = await applyDesignationKnowledge({ root, apply: true });
      expect(report.applied).toBe(true);
      expect(
        await fs.readFile(path.join(release, 'products.json'), 'utf8')
      ).toBe(originalText);
      expect(
        await fs.readFile(
          path.join(root, 'data/catalog-current/public/retained.txt'),
          'utf8'
        )
      ).toBe('other artifact');
      const current = JSON.parse(
        await fs.readFile(
          path.join(root, 'data/catalog-current/products.json'),
          'utf8'
        )
      );
      expect(current[0].designationDecoded.family).toBe('КСБ');
      expect(current[0].price).toBe(100);
      expect(
        await fs.readFile(path.join(root, 'data/products.json'), 'utf8')
      ).toBe(
        await fs.readFile(
          path.join(root, 'data/catalog-current/products.json'),
          'utf8'
        )
      );
      await fs.access(path.join(report.backup.backupPath, 'products.json'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('preserves every original price field and can refresh idempotently', () => {
    const input = [
      {
        sku: 'fixed',
        slug: 'fixed',
        mark: 'КСБК',
        sourceName: 'КСБКнг(А)-FRHF 2х2х0,8',
        price: 123.4,
        stock: 52,
        unit: 'м',
        extra: { retained: true },
      },
    ];
    const snapshot = structuredClone(input);
    const first = enrichPriceDesignations(input);
    expect(input).toEqual(snapshot);
    const { designationDecoded, ...original } = first.products[0];
    expect(original).toEqual(input[0]);
    expect(designationDecoded.family).toBe('КСБК');
    expect(
      designationDecoded.tokens.some((t) =>
        t.text.includes('диаметр жилы 0,8 мм')
      )
    ).toBe(true);
    expect(designationDecoded.tokens.some((t) => t.text.includes('мм²'))).toBe(
      false
    );
    expect(enrichPriceDesignations(first.products).products).toEqual(
      first.products
    );
    expect(first.report.counts.familyIdentified).toBe(1);
  });
  it('keeps undocumented nominal sizes and manufacturer-only titles pending', () => {
    const result = enrichPriceDesignations([
      {
        mark: 'КПЭТИ',
        sourceName: 'КПЭТИ 2х2х0,52',
        crossSection: 0.52,
        cores: 2,
        groupCores: 2,
      },
      { mark: 'HELUKABEL', sourceName: 'HELUKABEL 4х1,5' },
      { mark: 'КГXYZ', sourceName: 'КГXYZ 3х2,5' },
    ]);
    expect(result.products[0].designationDecoded.warnings.join(' ')).toContain(
      'диаметр'
    );
    expect(
      result.products[0].designationDecoded.tokens.some((t) =>
        t.text.includes('мм²')
      )
    ).toBe(false);
    expect(result.products[1].designationDecoded.family).toBeNull();
    expect(result.products[2].designationDecoded.family).toBeNull();
  });
  it('recovers a truncated mark only from the longer literal original designation', () => {
    const result = enrichPriceDesignations([
      { mark: 'КУМП-ИЭО', sourceName: 'КУМП-ИЭОЭнг(А)-LS 3х2х0,75' },
      { mark: 'КУМП-ИЭО', sourceName: 'КУМП-ИЭОXYZ 3х2х0,75' },
    ]);
    expect(result.products[0].designationDecoded.family).toBe('КУМП-ИЭОЭ');
    expect(result.products[1].designationDecoded.family).toBeNull();
  });
  it('does not apply a base-only KIP construction to an unsupported fire execution', () => {
    const result = enrichPriceDesignations([
      {
        mark: 'КИПЭВ',
        sourceName: 'КИПЭВнг(А)-FRHF 1х2х0,60',
        attributes: ['нг(А)-FRHF'],
      },
    ]);
    expect(result.products[0].designationDecoded.family).toBeNull();
    expect(
      result.products[0].designationDecoded.tokens.some((t) =>
        t.text.includes('ПВХ оболочка')
      )
    ).toBe(false);
  });

  it('links new definitions to collected documents with valid physical pages', () => {
    const documents = new Map(knowledge.documents.map((d) => [d.id, d]));
    for (const mark of knowledge.addedInRevision) {
      const family = knowledge.families.find((f) => f.mark === mark);
      const document = documents.get(family.evidence.documentId);
      expect(document?.status, mark).toBe('collected');
      for (const page of family.evidence.pages) {
        expect(page, mark).toBeGreaterThan(0);
        expect(page, mark).toBeLessThanOrEqual(document.pages);
      }
      expect(document.sha256, mark).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});
