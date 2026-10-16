// Enrich the existing price without reclassifying or reimporting commercial data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { enrichPriceDesignations } from '../shared/productDesignationBatch.js';
export { enrichPriceDesignations } from '../shared/productDesignationBatch.js';
import { DESIGNATION_KNOWLEDGE_REVISION } from '../shared/productDesignationReference.js';
import { acquirePriceImportLock } from './lib/importLock.js';
import { commitArtifactBatch } from './lib/artifactTransaction.js';
import { createBackup } from './backupData.js';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export async function applyDesignationKnowledge({
  root = projectRoot,
  apply = false,
} = {}) {
  const catalogDir = path.join(root, 'data/catalog-current');
  let unlock;
  let stage;
  if (apply) {
    unlock = await acquirePriceImportLock(
      path.join(root, 'data/.price-import.lock')
    );
    if (!unlock)
      throw new Error('Прайс сейчас обрабатывается другим процессом.');
  }
  try {
    const input = JSON.parse(
      await fs.readFile(path.join(catalogDir, 'products.json'), 'utf8')
    );
    const { products, report } = enrichPriceDesignations(input);
    report.applied = apply;
    if (!apply) return report;
    const backup = await createBackup({ projectPath: root });
    report.backup = { id: backup.id, backupPath: backup.backupPath };
    stage = await fs.mkdtemp(path.join(root, 'data/.designation-stage-'));
    await fs.cp(await fs.realpath(catalogDir), stage, { recursive: true });
    const text = JSON.stringify(products, null, 2) + '\n';
    await fs.writeFile(path.join(stage, 'products.json'), text);
    await fs.writeFile(
      path.join(stage, 'designation-coverage.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
    const compatibility = path.join(
      root,
      'data/.designation-products-stage.json'
    );
    await fs.writeFile(compatibility, text);
    await commitArtifactBatch([
      { stagedPath: stage, targetPath: catalogDir, atomicDirectory: true },
      {
        stagedPath: compatibility,
        targetPath: path.join(root, 'data/products.json'),
      },
    ]);
    stage = null;
    return report;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    if (unlock) await unlock();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const report = await applyDesignationKnowledge({
    apply: process.argv.includes('--apply'),
  });
  const reportIndex = process.argv.indexOf('--report');
  if (reportIndex >= 0) {
    const target = process.argv[reportIndex + 1];
    if (!target) throw new Error('Укажите путь после --report.');
    await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
    await fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(
    JSON.stringify(
      {
        applied: report.applied,
        knowledgeRevision: report.knowledgeRevision,
        ...report.counts,
        backup: report.backup,
      },
      null,
      2
    )
  );
}
