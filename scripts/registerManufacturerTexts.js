import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mergeManufacturerTexts } from '../shared/manufacturerTexts.js';

// Append curated sections without replacing earlier factory or document versions.
export async function registerManufacturerTexts(
  inputPath,
  root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
) {
  const target = path.join(root, 'shared/manufacturerTexts.json');
  const current = JSON.parse(await fs.readFile(target, 'utf8'));
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const knowledge = JSON.parse(
    await fs.readFile(
      path.join(root, 'shared/designationKnowledgeBase.json'),
      'utf8'
    )
  );
  const additions = Array.isArray(input) ? input : input.records;
  if (!Array.isArray(additions))
    throw new Error('Нужен массив записей records.');
  for (const record of additions) {
    const doc = knowledge.documents.find(
      (item) => item.id === record.documentId
    );
    if (
      !record.id ||
      !record.contentHash ||
      !record.text?.trim() ||
      !record.manufacturer?.trim() ||
      !record.familyIds?.length ||
      record.familyIds.some(
        (id) => !knowledge.families.some((family) => family.id === id)
      ) ||
      doc?.status !== 'collected' ||
      doc.publisherType !== 'manufacturer' ||
      record.sourceSha256 !== doc.sha256 ||
      !Array.isArray(record.pages) ||
      record.pages.some(
        (page) => !Number.isInteger(page) || page < 1 || page > (doc.pages || 0)
      )
    )
      throw new Error(
        `Недопустимая связь с заводской документацией: ${record.id}`
      );
  }
  const records = mergeManufacturerTexts(current.records, additions);
  const next = { ...current, records };
  const staged = `${target}.${process.pid}.tmp`;
  try {
    await fs.writeFile(staged, JSON.stringify(next, null, 2) + '\n');
    await fs.rename(staged, target);
  } finally {
    await fs.rm(staged, { force: true });
  }
  return {
    added: records.length - current.records.length,
    total: records.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (!process.argv[2])
    throw new Error('Укажите JSON с новыми заводскими разделами.');
  console.log(
    JSON.stringify(
      await registerManufacturerTexts(path.resolve(process.argv[2]))
    )
  );
}
