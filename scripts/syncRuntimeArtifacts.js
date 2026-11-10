import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeSeoArtifacts } from './lib/siteSeo.js';
import { assertProductPrerenderCoverage } from './lib/productPrerenderAudit.js';
import { resolveCatalogSnapshot } from './lib/catalogSnapshot.js';
import {
  mapSeoSummaryToPublishedPaths,
  writeFileAtomic,
} from './lib/importPublisher.js';
import { formatCableProductTitle } from '../shared/productTitle.js';
import { buildBuyerPrice } from './lib/buyerPrice.js';
import { publicPriceContacts } from './lib/publicPriceContacts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_CATEGORIES_PATH = path.join(
  projectRoot,
  'shared',
  'catalogCategories.json'
);
const DEFAULT_TEMPLATE_DIR = path.join(projectRoot, 'dist');
const DEFAULT_RUNTIME_PUBLIC_DIR = path.join(projectRoot, 'data', 'public');

async function replaceDirectory(sourceDir, targetDir, fsModule = fs) {
  const backupDir = `${targetDir}.${process.pid}.${Date.now()}.old`;
  let hasBackup = false;

  try {
    await moveDirectory(targetDir, backupDir, fsModule);
    hasBackup = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  try {
    await moveDirectory(sourceDir, targetDir, fsModule);
  } catch (error) {
    if (hasBackup) {
      await moveDirectory(backupDir, targetDir, fsModule).catch(
        (rollbackError) => {
          throw new Error(
            `Runtime sync failed (${error.message}); rollback failed: ${rollbackError.message}; previous output: ${backupDir}`
          );
        }
      );
    }
    throw error;
  }
  if (hasBackup)
    await fsModule
      .rm(backupDir, { recursive: true, force: true })
      .catch(() => {});
}

async function moveDirectory(sourceDir, targetDir, fsModule = fs) {
  try {
    await fsModule.rename(sourceDir, targetDir);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;

    await fsModule.cp(sourceDir, targetDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    await fsModule.rm(sourceDir, { recursive: true, force: true });
  }
}

async function syncOptionalFile(sourceFile, targetFile) {
  try {
    await fs.access(sourceFile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.rm(targetFile, { force: true }).catch(() => {});
      return false;
    }
    throw error;
  }

  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await writeFileAtomic(targetFile, await fs.readFile(sourceFile), {
    mode: (await fs.stat(sourceFile)).mode & 0o777,
  });
  return true;
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function syncRuntimeArtifacts({
  projectDir = projectRoot,
  productsPath,
  categoriesPath = DEFAULT_CATEGORIES_PATH,
  templateDir = DEFAULT_TEMPLATE_DIR,
  runtimePublicDir = DEFAULT_RUNTIME_PUBLIC_DIR,
  priceSource,
  redirectsJsonSource,
  redirectsNginxSource,
  siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL,
  log = console.log,
  fsModule = fs,
} = {}) {
  if (siteUrl) {
    process.env.SITE_URL = siteUrl;
    process.env.VITE_SITE_URL = siteUrl;
  }

  const {
    extractProductsPayload,
    loadTemplate,
    prerenderProducts,
    prerenderCatalogRelease,
  } = await import('./prerender.js');

  const snapshot = await resolveCatalogSnapshot(projectDir);
  productsPath ||= snapshot.productsPath;
  priceSource ||= snapshot.priceSource;
  const redirectDir =
    snapshot.catalogDir === path.join(projectDir, 'data')
      ? path.join(projectDir, 'public')
      : snapshot.publicDir;
  redirectsJsonSource ||= path.join(redirectDir, 'redirects.json');
  redirectsNginxSource ||= path.join(redirectDir, 'redirects.nginx.conf');
  // Never rewrite the immutable active release via an output override.
  const targetReal = await fs.realpath(runtimePublicDir).catch((error) => {
    if (error.code === 'ENOENT') return path.resolve(runtimePublicDir);
    throw error;
  });
  if (
    snapshot.catalogDir !== path.join(projectDir, 'data') &&
    (targetReal === snapshot.catalogDir ||
      targetReal.startsWith(snapshot.catalogDir + path.sep))
  )
    throw new Error('runtime sync output не должен изменять активный выпуск.');
  await fsModule.mkdir(path.dirname(runtimePublicDir), { recursive: true });

  const template = await loadTemplate({ outputDir: templateDir });
  const productsPayload = await loadJson(productsPath);
  const categoriesData = await loadJson(categoriesPath);
  const products = extractProductsPayload(productsPayload, {
    source: productsPath,
  }).map((product) => {
    const sourceTitle = product.fullName || product.name || product.title;
    const title = formatCableProductTitle(sourceTitle, product);
    return { ...product, title, fullName: title, name: title };
  });

  const tmpDir = await fsModule.mkdtemp(
    path.join(path.dirname(runtimePublicDir), '.runtime-public-stage-')
  );
  let seoSummary,
    coverage,
    copiedPrice,
    copiedRedirectsJson,
    copiedRedirectsNginx;
  try {
    seoSummary = await writeSeoArtifacts({
      outputDir: tmpDir,
      siteUrl,
      products,
      categoriesData,
    });
    await prerenderProducts(template, products, {
      outputDir: tmpDir,
      log: null,
    });
    await prerenderCatalogRelease(template, products, {
      outputDir: tmpDir,
      templateDir,
      categoriesData,
    });
    coverage = await assertProductPrerenderCoverage({
      publicDir: tmpDir,
      products,
      productSitemapPaths: seoSummary.productSitemapPaths,
    });
    copiedPrice = await syncOptionalFile(
      priceSource,
      path.join(tmpDir, 'price.xls')
    );
    if (copiedPrice) {
      const publicPricePath = path.join(tmpDir, 'price.xls');
      await fs.writeFile(
        publicPricePath,
        publicPriceContacts(await fs.readFile(publicPricePath))
      );
    }
    const buyerPriceTarget = path.join(tmpDir, 'price-buyer.xlsx');
    const copiedBuyerPrice = await syncOptionalFile(
      path.join(snapshot.publicDir, 'price-buyer.xlsx'),
      buyerPriceTarget
    );
    if (!copiedBuyerPrice) {
      // Bootstrap an older release using its data-file timestamp, never build time.
      await writeFileAtomic(
        buyerPriceTarget,
        await buildBuyerPrice(products, {
          generatedAt:
            productsPayload.generatedAt ||
            (await fs.stat(productsPath)).mtime.toISOString(),
          dateLabel: productsPayload.generatedAt
            ? 'Дата выпуска'
            : 'Дата файла каталога',
        })
      );
    }
    copiedRedirectsJson = await syncOptionalFile(
      redirectsJsonSource,
      path.join(tmpDir, 'redirects.json')
    );
    copiedRedirectsNginx = await syncOptionalFile(
      redirectsNginxSource,
      path.join(tmpDir, 'redirects.nginx.conf')
    );
    if (!copiedPrice)
      throw new Error('Не найден price.xls для runtime выпуска.');
    // Precompress runs next: its source metadata must match the runtime release,
    // otherwise nginx could serve stale .br/.gz siblings copied from public/.
    for (const name of await fs.readdir(tmpDir)) {
      if (
        /^(?:sitemap(?:-[A-Za-z0-9-]+)?\.xml|robots\.txt|price\.xls|price-buyer\.xlsx|redirects\.(?:json|nginx\.conf))$/.test(
          name
        )
      ) {
        await syncOptionalFile(
          path.join(tmpDir, name),
          path.join(templateDir, name)
        );
      }
    }
    await replaceDirectory(tmpDir, runtimePublicDir, fsModule);
    seoSummary = mapSeoSummaryToPublishedPaths(
      seoSummary,
      tmpDir,
      runtimePublicDir
    );
  } finally {
    await fsModule.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const result = {
    runtimePublicDir,
    seoSummary,
    coverage,
    copiedPrice,
    copiedRedirectsJson,
    copiedRedirectsNginx,
  };

  log?.(
    [
      `[runtime-sync] publicDir=${path.relative(projectDir, runtimePublicDir)}`,
      `pages=${seoSummary.counts.pages}`,
      `categories=${seoSummary.counts.categories}`,
      `products=${seoSummary.counts.products}`,
      `productHtml=${coverage.htmlCount}`,
    ].join(' ')
  );

  return result;
}

async function main() {
  await syncRuntimeArtifacts();
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isMainModule) {
  main().catch((error) => {
    console.error('[runtime-sync] Error:', error.message);
    process.exitCode = 1;
  });
}
