import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { syncDesignationManufacturerCorpus } from './syncDesignationManufacturerCorpus.js';
import { searchDesignationManufacturerCorpus } from './searchDesignationManufacturerCorpus.js';

const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');

describe('complete source corpus independent of the price', () => {
  it('archives unpriced models, separates publishers and preserves a published DB on an incomplete rebuild', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'manufacturer-corpus-')
    );
    try {
      const shared = path.join(root, 'shared');
      const research = path.join(root, 'research');
      await fs.mkdir(shared);
      await fs.mkdir(research);
      const documents = [];
      for (const [id, publisherType] of [
        ['factory', 'manufacturer'],
        ['secondary', 'brand-owner'],
        ['gost', 'standard'],
      ]) {
        const bytes = Buffer.from('%PDF-1.7\n' + id + '\n%%EOF');
        await fs.writeFile(path.join(research, id + '.bin'), bytes);
        await fs.writeFile(
          path.join(research, id + '.pages.json'),
          JSON.stringify([
            'Вводная часть. '.repeat(100) +
              'Модель НЕ-В-ПРАЙСЕ 42, конструкция и применение.',
            '',
          ])
        );
        documents.push({
          id,
          title: id,
          url: 'https://example.test/' + id,
          status: 'collected',
          publisherType,
          sha256: hash(bytes),
          pages: 2,
        });
      }
      const knowledge = {
        revision: 'fixture',
        documents,
        families: [{ id: 'family-1', mark: 'НЕ-В-ПРАЙСЕ' }],
      };
      await fs.writeFile(
        path.join(shared, 'designationKnowledgeBase.json'),
        JSON.stringify(knowledge)
      );
      await fs.writeFile(
        path.join(shared, 'manufacturerTexts.json'),
        JSON.stringify({ records: [] })
      );
      const report = await syncDesignationManufacturerCorpus({
        root,
        researchRoots: [research],
      });
      expect(report).toMatchObject({
        documents: 2,
        pages: 4,
        emptyTextPages: 2,
        priceFiltered: false,
      });
      const hits = searchDesignationManufacturerCorpus({
        root,
        query: 'НЕ В ПРАЙСЕ',
        manufacturerOnly: true,
      });
      expect(hits).toHaveLength(1);
      expect(hits[0].excerpt).toContain('НЕ-В-ПРАЙСЕ 42');
      expect(hits[0]).toMatchObject({
        documentId: 'factory',
        page: 1,
        automaticProductInference: false,
      });
      expect(await fs.readFile(hits[0].originalPath, 'utf8')).toContain('%PDF');
      const ocrDirectory = path.join(
        root,
        'data/designation-manufacturer-corpus/ocr'
      );
      await fs.mkdir(ocrDirectory);
      const sourceHash = documents[0].sha256;
      await fs.writeFile(
        path.join(ocrDirectory, sourceHash + '.json'),
        JSON.stringify({
          sourceSha256: sourceHash,
          engine: 'test-ocr',
          pages: {
            2: {
              status: 'ok',
              text: 'Модель ТОЛЬКО-СКАН без строки в прайсе.',
            },
          },
        })
      );
      const withOcr = await syncDesignationManufacturerCorpus({
        root,
        researchRoots: [research],
      });
      expect(withOcr.ocrTextPages).toBe(1);
      expect(withOcr.originalEmptyTextPages).toBe(2);
      const scan = searchDesignationManufacturerCorpus({
        root,
        query: 'ТОЛЬКО СКАН',
      });
      expect(scan).toHaveLength(1);
      expect(scan[0]).toMatchObject({
        page: 2,
        automaticProductInference: false,
        extractionMetadata: { ocr: { engine: 'test-ocr' } },
      });
      const published = path.join(
        root,
        'data/designation-manufacturer-corpus/corpus.sqlite'
      );
      const before = hash(await fs.readFile(published));
      await fs.unlink(path.join(research, 'factory.pages.json'));
      await expect(
        syncDesignationManufacturerCorpus({ root, researchRoots: [research] })
      ).rejects.toThrow('Incomplete source archive');
      expect(hash(await fs.readFile(published))).toBe(before);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
