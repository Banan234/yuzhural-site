import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compactDesignationText } from './syncDesignationManufacturerCorpus.js';

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

function sourceOffset(text, query) {
  const mapping = [];
  const characters = [];
  for (let i = 0; i < text.length; i++) {
    const part = compactDesignationText(text[i]);
    characters.push(part);
    for (let j = 0; j < part.length; j++) mapping.push(i);
  }
  return (
    mapping[characters.join('').indexOf(compactDesignationText(query))] || 0
  );
}

export function searchDesignationManufacturerCorpus({
  root = defaultRoot,
  query = '',
  document,
  page,
  manufacturerOnly = false,
  limit = 10,
} = {}) {
  const corpusDir = path.join(root, 'data/designation-manufacturer-corpus');
  const db = new DatabaseSync(path.join(corpusDir, 'corpus.sqlite'), {
    readOnly: true,
  });
  try {
    const clauses = ['instr(p.compact_text, ?) > 0'];
    const values = [compactDesignationText(query)];
    if (document) {
      clauses.push('d.id = ?');
      values.push(document);
    }
    if (page) {
      clauses.push('p.page = ?');
      values.push(Number(page));
    }
    if (manufacturerOnly) clauses.push("d.publisher_type = 'manufacturer'");
    values.push(Math.max(1, Math.min(50, Number(limit) || 10)));
    return db
      .prepare(
        `SELECT d.id AS documentId, d.title, d.url, d.publisher_type AS publisherType,
      d.sha256, d.original_path AS originalPath, d.format, p.page, p.text,
      p.extraction_metadata AS extractionMetadata
      FROM pages p JOIN documents d ON d.id=p.document_id WHERE ${clauses.join(' AND ')}
      ORDER BY CASE WHEN d.publisher_type='manufacturer' THEN 0 ELSE 1 END, d.id, p.page LIMIT ?`
      )
      .all(...values)
      .map((row) => {
        const offset = sourceOffset(row.text, query);
        return {
          ...row,
          extractionMetadata: JSON.parse(row.extractionMetadata),
          originalPath: path.join(corpusDir, row.originalPath),
          sourceUrl:
            row.url + (row.format === 'pdf' ? '#page=' + row.page : ''),
          excerpt: row.text.slice(
            Math.max(0, offset - 100),
            Math.max(0, offset - 100) + 800
          ),
          text: page ? row.text : undefined,
          interpretationStatus: 'source-content-requires-review',
          automaticProductInference: false,
        };
      });
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const options = Object.fromEntries(
    ['query', 'document', 'page', 'limit']
      .filter((k) => args.includes('--' + k))
      .map((k) => [k, args[args.indexOf('--' + k) + 1]])
  );
  options.manufacturerOnly = args.includes('--manufacturer-only');
  console.log(
    JSON.stringify(searchDesignationManufacturerCorpus(options), null, 2)
  );
}
