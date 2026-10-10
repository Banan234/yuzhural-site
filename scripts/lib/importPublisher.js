// Подготовка файлов импорта, SEO/prerender и транзакционная установка.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  loadTemplate as loadPrerenderTemplate,
  prerenderProducts,
  validatePrerenderProducts,
} from '../prerender.js';
import { assertProductPrerenderCoverage } from './productPrerenderAudit.js';
import { writeSeoArtifacts } from './siteSeo.js';
import { saveProductRegistry } from './productRegistry.js';
import { commitArtifactBatch } from './artifactTransaction.js';
import {
  buildHistorySnapshot,
  buildNextImportHistory,
} from './priceImportComparison.js';
import { buildReportHtml } from './importReport.js';

export async function writeFileAtomic(filePath, data, { mode } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(tmpPath, 'wx', mode ?? 0o666);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmpPath, filePath);
    if (mode != null) {
      await fs.chmod(filePath, mode);
    }
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function getStagedPath(stageRoot, targetPath, projectRoot) {
  const relativePath = path.relative(projectRoot, path.resolve(targetPath));
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Артефакт импорта должен находиться внутри проекта: ${targetPath}`
    );
  }
  return path.join(stageRoot, relativePath);
}

async function listFilesRecursively(rootDir) {
  const files = [];
  async function visit(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  await visit(rootDir);
  return files;
}

async function countHtmlFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.endsWith('.html')).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function writeRuntimeProductPrerender({
  enabled,
  products,
  seoSummary,
  outputDir,
  templateDir,
  sourceFile,
}) {
  if (!enabled) return null;
  if (!seoSummary) {
    throw new Error(
      'Runtime product-prerender требует свежий sitemap из writeSeoArtifacts.'
    );
  }

  let template;
  try {
    template = await loadPrerenderTemplate({ outputDir: templateDir });
  } catch (error) {
    throw new Error(
      `Не удалось прочитать шаблон runtime-prerender карточек товара: ${error.message}`
    );
  }

  validatePrerenderProducts(products, { source: sourceFile });
  await prerenderProducts(template, products, {
    outputDir,
    log: null,
    validate: false,
  });
  const productDir = path.join(outputDir, 'product');
  const writtenCount = await countHtmlFiles(productDir);
  const coverage = await assertProductPrerenderCoverage({
    publicDir: outputDir,
    productDir,
    products,
    productSitemapPaths: seoSummary?.productSitemapPaths || [],
  });
  if (writtenCount !== coverage.htmlCount) {
    throw new Error(
      `Runtime prerender записал ${writtenCount} HTML, но product sitemap содержит ${coverage.htmlCount} URL.`
    );
  }
  return writtenCount;
}

const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

export function buildRedirectsNginxConf(redirects) {
  const lines = [
    '# Сгенерировано scripts/importPrice.js — не редактируй вручную.',
    '# Подключается из nginx.conf через include.',
  ];
  const entries = Object.entries(redirects || {})
    .filter(
      ([oldSlug, newSlug]) =>
        SAFE_SLUG_RE.test(oldSlug) && SAFE_SLUG_RE.test(newSlug)
    )
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [oldSlug, newSlug] of entries) {
    lines.push(
      `location = /product/${oldSlug} { return 301 /product/${newSlug}; }`
    );
  }
  return lines.join('\n') + '\n';
}

export function mapSeoSummaryToPublishedPaths(
  seoSummary,
  stagedPublicDir,
  publicDir
) {
  const mapPath = (filePath) =>
    path.join(publicDir, path.relative(stagedPublicDir, filePath));
  return {
    ...seoSummary,
    ...(seoSummary.indexPath
      ? { indexPath: mapPath(seoSummary.indexPath) }
      : {}),
    ...(seoSummary.robotsPath
      ? { robotsPath: mapPath(seoSummary.robotsPath) }
      : {}),
    ...(seoSummary.productSitemapPaths
      ? {
          productSitemapPaths: seoSummary.productSitemapPaths.map(mapPath),
        }
      : {}),
  };
}

export async function publishImportArtifacts({
  projectRoot,
  publicDir,
  outputFile,
  registryFile,
  reportFile,
  reportHtmlFile,
  historyFile,
  publicPriceFile,
  redirectsFile,
  redirectsNginxFile,
  inputFile,
  categoriesFile,
  runtimePrerenderTemplateDir,
  runtimePrerenderEnabled,
  siteUrl,
  products,
  registry,
  report,
  sourcePriceBuffer,
  downloadedPriceBuffer,
  slugRedirects,
  importConfig,
  importHistory,
  generatedAt,
  source,
}) {
  const dataStageRoot = await fs.mkdtemp(
    path.join(projectRoot, '.price-import-stage-data-')
  );
  let stagedPublicDir;
  try {
    await fs.mkdir(path.dirname(publicDir), { recursive: true });
    stagedPublicDir = await fs.mkdtemp(
      path.join(
        path.dirname(publicDir),
        `.${path.basename(publicDir)}.price-import-stage-`
      )
    );
  } catch (error) {
    await fs
      .rm(dataStageRoot, { recursive: true, force: true })
      .catch(() => {});
    throw error;
  }

  try {
    const stagedProductsFile = getStagedPath(
      dataStageRoot,
      outputFile,
      projectRoot
    );
    const stagedRegistryFile = getStagedPath(
      dataStageRoot,
      registryFile,
      projectRoot
    );
    const stagedReportFile = getStagedPath(
      dataStageRoot,
      reportFile,
      projectRoot
    );
    const stagedReportHtmlFile = getStagedPath(
      dataStageRoot,
      reportHtmlFile,
      projectRoot
    );
    const stagedHistoryFile = getStagedPath(
      dataStageRoot,
      historyFile,
      projectRoot
    );

    await writeFileAtomic(
      stagedProductsFile,
      JSON.stringify(products, null, 2)
    );
    await saveProductRegistry(stagedRegistryFile, registry);
    await writeFileAtomic(
      path.join(stagedPublicDir, path.basename(publicPriceFile)),
      sourcePriceBuffer
    );
    if (downloadedPriceBuffer) {
      await writeFileAtomic(
        getStagedPath(dataStageRoot, inputFile, projectRoot),
        downloadedPriceBuffer
      );
    }
    await writeFileAtomic(
      path.join(stagedPublicDir, path.basename(redirectsFile)),
      JSON.stringify(slugRedirects, null, 2)
    );
    await writeFileAtomic(
      path.join(stagedPublicDir, path.basename(redirectsNginxFile)),
      buildRedirectsNginxConf(slugRedirects),
      { mode: 0o444 }
    );

    const categoriesData = JSON.parse(
      await fs.readFile(categoriesFile, 'utf-8')
    );
    const seoSummary = await writeSeoArtifacts({
      outputDir: stagedPublicDir,
      siteUrl,
      products,
      categoriesData,
    });
    const runtimeProductPrerenderCount = await writeRuntimeProductPrerender({
      enabled: runtimePrerenderEnabled,
      products,
      seoSummary,
      outputDir: stagedPublicDir,
      templateDir: runtimePrerenderTemplateDir,
      sourceFile: outputFile,
    });
    report.seo = seoSummary.counts;
    report.runtimeProductPrerenderCount = runtimeProductPrerenderCount;
    await writeFileAtomic(stagedReportFile, JSON.stringify(report, null, 2));
    await writeFileAtomic(
      stagedReportHtmlFile,
      buildReportHtml(report, {
        fallbackSourceFile: inputFile,
        jsonReportPath: path.relative(projectRoot, reportFile),
      })
    );
    const nextHistory = buildNextImportHistory(
      importConfig,
      importHistory,
      buildHistorySnapshot(products, {
        generatedAt,
        sourceFile: inputFile,
        sourceUrl: source.requestedUrl,
        source,
      }),
      generatedAt
    );
    await writeFileAtomic(
      stagedHistoryFile,
      JSON.stringify(nextHistory, null, 2)
    );

    const stagedDataFiles = await listFilesRecursively(dataStageRoot);
    const artifacts = [
      ...stagedDataFiles.map((stagedPath) => ({
        stagedPath,
        targetPath: path.join(
          projectRoot,
          path.relative(dataStageRoot, stagedPath)
        ),
      })),
      {
        stagedPath: stagedPublicDir,
        targetPath: publicDir,
        atomicDirectory: true,
      },
    ];

    await commitArtifactBatch(artifacts);
    return {
      seoSummary: mapSeoSummaryToPublishedPaths(
        seoSummary,
        stagedPublicDir,
        publicDir
      ),
      runtimeProductPrerenderCount,
    };
  } finally {
    await Promise.all([
      fs.rm(dataStageRoot, { recursive: true, force: true }),
      fs.rm(stagedPublicDir, { recursive: true, force: true }),
    ]).catch(() => {});
  }
}
