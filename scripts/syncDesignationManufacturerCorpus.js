import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
export const compactDesignationText = (text) =>
  String(text || '')
    .toUpperCase()
    .replace(/Ё/gu, 'Е')
    .replace(/,/gu, '.')
    .replace(/[\s\u00ad\uFFFE\uFFFD\-–—‑]+/gu, '');

async function walk(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(item)));
    else if (entry.isFile()) found.push(item);
  }
  return found;
}

function htmlText(bytes) {
  return bytes
    .toString('utf8')
    .replace(/<!--[^]*?-->/gu, ' ')
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#(x[\da-f]+|\d+);/giu, (_, code) => {
      const n =
        code[0].toLowerCase() === 'x'
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/gu,
      (_, name) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name]
    )
    .replace(/\s+/gu, ' ')
    .trim();
}

// Archive all obtained source content, independently of current price coverage.
// Retrieval candidates never become reviewed decoding rules through this import.
export async function syncDesignationManufacturerCorpus({
  root = defaultRoot,
  researchRoots = [],
} = {}) {
  const knowledge = JSON.parse(
    await fs.readFile(
      path.join(root, 'shared/designationKnowledgeBase.json'),
      'utf8'
    )
  );
  const texts = JSON.parse(
    await fs.readFile(path.join(root, 'shared/manufacturerTexts.json'), 'utf8')
  );
  const documents = knowledge.documents.filter(
    (d) =>
      d.status === 'collected' &&
      !['standard', 'reference'].includes(d.publisherType)
  );
  const files = (await Promise.all(researchRoots.map(walk))).flat();
  const byHash = new Map();
  for (const file of files.filter((f) => /\.(bin|pdf|html)$/iu.test(f))) {
    const hash = sha256(await fs.readFile(file));
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(file);
  }
  const output = path.join(root, 'data/designation-manufacturer-corpus');
  await fs.mkdir(path.join(output, 'originals'), { recursive: true });
  const stage = path.join(output, `corpus.${process.pid}.staged.sqlite`);
  const report = {
    revision: knowledge.revision,
    documents: 0,
    manufacturerDocuments: 0,
    pages: 0,
    pdfPages: 0,
    emptyTextPages: 0,
    originalEmptyTextPages: 0,
    ocrProcessedPages: 0,
    ocrTextPages: 0,
    ocrFailedPages: 0,
    originalBytes: 0,
    missingOriginals: [],
    missingPageExtractions: [],
    priceFiltered: false,
    automaticProductInference: false,
  };
  const db = new DatabaseSync(stage);
  try {
    db.exec(`
      PRAGMA journal_mode=DELETE;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
        publisher_type TEXT, sha256 TEXT NOT NULL, original_path TEXT NOT NULL,
        original_bytes INTEGER NOT NULL, format TEXT NOT NULL, source_metadata TEXT NOT NULL);
      CREATE TABLE pages (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id),
        page INTEGER NOT NULL, text TEXT NOT NULL, compact_text TEXT NOT NULL,
        raw_text TEXT NOT NULL, ocr_text TEXT NOT NULL, extraction_metadata TEXT NOT NULL,
        UNIQUE(document_id,page));
      CREATE INDEX pages_document ON pages(document_id,page);
      CREATE VIRTUAL TABLE pages_fts USING fts5(text,content='pages',content_rowid='id');
      CREATE TABLE reviewed_families (id TEXT PRIMARY KEY, mark TEXT NOT NULL, record_json TEXT NOT NULL);
      CREATE TABLE reviewed_texts (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, record_json TEXT NOT NULL);
      BEGIN;
    `);
    const insertDoc = db.prepare(
      'INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?)'
    );
    const insertPage = db.prepare(
      'INSERT INTO pages(document_id,page,text,compact_text,raw_text,ocr_text,extraction_metadata) VALUES (?,?,?,?,?,?,?)'
    );
    for (const doc of documents) {
      const originals = byHash.get(doc.sha256) || [];
      if (!originals.length) {
        report.missingOriginals.push(doc.id);
        continue;
      }
      const original = originals[0];
      const bytes = await fs.readFile(original);
      const isPdf = bytes.subarray(0, 4).toString() === '%PDF';
      const archivePath = `originals/${doc.sha256}.${isPdf ? 'pdf' : 'html'}`;
      const archive = path.join(output, archivePath);
      try {
        await fs.copyFile(original, archive, fs.constants.COPYFILE_EXCL);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      if (sha256(await fs.readFile(archive)) !== doc.sha256)
        throw new Error(`Corrupted original: ${doc.id}`);
      let pages;
      if (isPdf) {
        const candidates = originals.flatMap((f) => [
          f.replace(/\.(bin|pdf)$/iu, '.pages.json'),
        ]);
        for (const candidate of candidates) {
          try {
            const extracted = JSON.parse(await fs.readFile(candidate, 'utf8'));
            if (
              Array.isArray(extracted) &&
              extracted.length === doc.pages &&
              extracted.every((t) => typeof t === 'string')
            ) {
              pages = extracted;
              break;
            }
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        if (!pages) report.missingPageExtractions.push(doc.id);
      } else pages = [htmlText(bytes)];
      let ocr;
      try {
        ocr = JSON.parse(
          await fs.readFile(
            path.join(output, 'ocr', doc.sha256 + '.json'),
            'utf8'
          )
        );
        if (ocr.sourceSha256 !== doc.sha256)
          throw new Error(`OCR source hash mismatch: ${doc.id}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      insertDoc.run(
        doc.id,
        doc.title,
        doc.url,
        doc.publisherType || 'other',
        doc.sha256,
        archivePath,
        bytes.length,
        isPdf ? 'pdf' : 'html',
        JSON.stringify(doc)
      );
      for (const [index, raw] of (pages || []).entries()) {
        const recognized = ocr?.pages?.[index + 1];
        const ocrText =
          recognized?.status === 'ok' ? String(recognized.text || '') : '';
        const text =
          raw +
          (ocrText
            ? '\n\n[OCR: требует проверки по оригиналу]\n' + ocrText
            : '');
        insertPage.run(
          doc.id,
          index + 1,
          text,
          compactDesignationText(text),
          raw,
          ocrText,
          JSON.stringify({
            textLayer: isPdf ? 'pdf-extraction' : 'html-extraction',
            ocr: recognized
              ? { engine: ocr.engine, ...recognized, text: undefined }
              : null,
          })
        );
        report.pages++;
        if (isPdf) report.pdfPages++;
        if (!raw.trim()) report.originalEmptyTextPages++;
        if (!text.trim()) report.emptyTextPages++;
        if (recognized?.status === 'ok') report.ocrProcessedPages++;
        if (recognized?.status === 'failed') report.ocrFailedPages++;
        if (ocrText.trim()) report.ocrTextPages++;
      }
      report.documents++;
      report.manufacturerDocuments += Number(
        doc.publisherType === 'manufacturer'
      );
      report.originalBytes += bytes.length;
    }
    // Never replace a complete archive with a silent partial rebuild.
    if (report.missingOriginals.length || report.missingPageExtractions.length)
      throw new Error(`Incomplete source archive: ${JSON.stringify(report)}`);
    const familyInsert = db.prepare(
      'INSERT INTO reviewed_families VALUES (?,?,?)'
    );
    for (const f of knowledge.families)
      familyInsert.run(f.id, f.mark, JSON.stringify(f));
    const textInsert = db.prepare('INSERT INTO reviewed_texts VALUES (?,?,?)');
    for (const t of texts.records)
      textInsert.run(t.id, t.documentId, JSON.stringify(t));
    report.reviewedFamilies = knowledge.families.length;
    report.reviewedTexts = texts.records.length;
    report.uniqueOriginals = db
      .prepare('SELECT COUNT(DISTINCT sha256) AS count FROM documents')
      .get().count;
    report.originalBytes =
      db
        .prepare(
          'SELECT SUM(bytes) AS bytes FROM (SELECT sha256, MAX(original_bytes) AS bytes FROM documents GROUP BY sha256)'
        )
        .get().bytes || 0;
    db.prepare('INSERT INTO metadata VALUES (?,?)').run(
      'manifest',
      JSON.stringify(report)
    );
    db.exec("INSERT INTO pages_fts(pages_fts) VALUES('rebuild'); COMMIT;");
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed');
    db.close();
    await fs.rename(stage, path.join(output, 'corpus.sqlite'));
    await fs.writeFile(
      path.join(output, 'manifest.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
    await fs.writeFile(
      path.join(root, 'shared/designationManufacturerCorpus.json'),
      JSON.stringify(
        {
          ...report,
          databasePath: 'data/designation-manufacturer-corpus/corpus.sqlite',
          originalsDirectory: 'data/designation-manufacturer-corpus/originals',
          contentScope:
            'All obtained document pages and originals, including models absent from the price',
          structuredRulePolicy:
            'Only reviewed rules are applied to product decoding; source retrieval and OCR do not grant officialComplete',
        },
        null,
        2
      ) + '\n'
    );
    return report;
  } catch (error) {
    if (db.isOpen) db.close();
    await fs.rm(stage, { force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const roots = process.argv
    .slice(2)
    .filter((arg, i, all) => all[i - 1] === '--research-root');
  if (!roots.length)
    throw new Error(
      'Укажите --research-root с папкой полученных оригиналов и постраничных текстов.'
    );
  console.log(
    JSON.stringify(
      await syncDesignationManufacturerCorpus({ researchRoots: roots }),
      null,
      2
    )
  );
}
