import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/\s+/gu, ' ')
    .trim();

// Retrieval of source evidence, not an automatic decoder. Raw standards text
// never grants a product a manufacturer, material or complete-review status.
export async function searchDesignationStandards({
  root = defaultRoot,
  query = '',
  standard,
  topic,
  limit = 5,
  asOf = new Date().toISOString().slice(0, 10),
} = {}) {
  const index = JSON.parse(
    await fs.readFile(
      path.join(root, 'shared/designationStandards.json'),
      'utf8'
    )
  );
  const terms = normalize(query).split(' ').filter(Boolean);
  const hits = [];
  for (const doc of index.standards) {
    if (!doc.currentInRussia || !doc.status.startsWith('active')) continue;
    if (doc.replacementEffectiveDate && asOf >= doc.replacementEffectiveDate)
      continue;
    if (
      standard &&
      standard !== doc.id &&
      normalize(standard) !== normalize(doc.title)
    )
      continue;
    const corpus = JSON.parse(
      await fs.readFile(path.join(root, doc.corpusPath), 'utf8')
    );
    const sourcePages = [
      ...(corpus.amendments || [])
        .slice()
        .reverse()
        .flatMap((amendment) =>
          amendment.pages.map((page) => ({
            ...page,
            amendmentTitle: amendment.title,
          }))
        ),
      ...corpus.pages,
    ];
    for (const page of sourcePages) {
      if (topic && !page.topics.includes(topic)) continue;
      const text = normalize(page.text);
      if (!terms.every((term) => text.includes(term))) continue;
      const offset = terms.length ? text.indexOf(terms[0]) : 0;
      hits.push({
        standard: doc.title,
        documentId: doc.id,
        page: page.page,
        topics: page.topics,
        excerpt: page.text.slice(
          Math.max(0, offset - 80),
          Math.max(0, offset - 80) + 600
        ),
        sourceUrl:
          page.sourceUrl || `${doc.url.split('#')[0]}#page=${page.page}`,
        officialUrl: doc.officialUrl,
        sourceSha256: page.sourceSha256 || doc.sha256,
        amendmentTitle: page.amendmentTitle || null,
        editionCompleteness: doc.editionCompleteness,
        registeredAmendments: doc.registeredAmendments,
        interpretationStatus: 'source-evidence-requires-context-review',
        automaticProductInference: false,
      });
    }
  }
  return hits.slice(0, Math.max(1, Math.min(50, Number(limit) || 5)));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  const options = Object.fromEntries(
    ['query', 'standard', 'topic', 'limit']
      .filter((key) => args.includes('--' + key))
      .map((key) => [key, value('--' + key)])
  );
  console.log(
    JSON.stringify(await searchDesignationStandards(options), null, 2)
  );
}
