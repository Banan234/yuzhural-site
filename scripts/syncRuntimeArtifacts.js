import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeSeoArtifacts } from './lib/siteSeo.js';
import { assertProductPrerenderCoverage } from './lib/productPrerenderAudit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_PRODUCTS_PATH = path.join(projectRoot, 'data', 'products.json');
const DEFAULT_CATEGORIES_PATH = path.join(
  projectRoot,
  'shared',
  'catalogCategories.json'
);
const DEFAULT_TEMPLATE_DIR = path.join(projectRoot, 'dist');
const DEFAULT_RUNTIME_PUBLIC_DIR = path.join(projectRoot, 'data', 'public');
const DEFAULT_PRICE_SOURCE = path.join(projectRoot, 'data', 'price.xls');
const DEFAULT_REDIRECTS_JSON = path.join(
  projectRoot,
  'public',
  'redirects.json'
);
const DEFAULT_REDIRECTS_NGINX = path.join(
  projectRoot,
  'public',
  'redirects.nginx.conf'
);

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
    if (hasBackup) {
      await fsModule.rm(backupDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (hasBackup) {
      await moveDirectory(backupDir, targetDir, fsModule).catch(() => {});
    }
    throw error;
  }
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
  await fs.copyFile(sourceFile, targetFile);
  return true;
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function syncRuntimeArtifacts({
  projectDir = projectRoot,
  productsPath = DEFAULT_PRODUCTS_PATH,
  categoriesPath = DEFAULT_CATEGORIES_PATH,
  templateDir = DEFAULT_TEMPLATE_DIR,
  runtimePublicDir = DEFAULT_RUNTIME_PUBLIC_DIR,
  priceSource = DEFAULT_PRICE_SOURCE,
  redirectsJsonSource = DEFAULT_REDIRECTS_JSON,
  redirectsNginxSource = DEFAULT_REDIRECTS_NGINX,
  siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL,
  log = console.log,
  fsModule = fs,
} = {}) {
  if (siteUrl) {
    process.env.SITE_URL = siteUrl;
    process.env.VITE_SITE_URL = siteUrl;
  }

  const { extractProductsPayload, loadTemplate, prerenderProducts } =
    await import('./prerender.js');

  await fsModule.mkdir(runtimePublicDir, { recursive: true });

  const template = await loadTemplate({ outputDir: templateDir });
  const productsPayload = await loadJson(productsPath);
  const categoriesData = await loadJson(categoriesPath);
  const products = extractProductsPayload(productsPayload, {
    source: productsPath,
  });

  const seoSummary = await writeSeoArtifacts({
    outputDir: runtimePublicDir,
    siteUrl,
    products,
    categoriesData,
  });

  const tmpDir = path.join(
    path.dirname(runtimePublicDir),
    `${path.basename(runtimePublicDir)}.product-prerender-${process.pid}-${Date.now()}`
  );

  try {
    await prerenderProducts(template, products, {
      outputDir: tmpDir,
      log: null,
      validate: false,
    });
    await replaceDirectory(
      path.join(tmpDir, 'product'),
      path.join(runtimePublicDir, 'product'),
      fsModule
    );
  } finally {
    await fsModule.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const coverage = await assertProductPrerenderCoverage({
    publicDir: runtimePublicDir,
    products,
    productSitemapPaths: seoSummary.productSitemapPaths,
  });

  const copiedPrice = await syncOptionalFile(
    priceSource,
    path.join(runtimePublicDir, 'price.xls')
  );
  const copiedRedirectsJson = await syncOptionalFile(
    redirectsJsonSource,
    path.join(runtimePublicDir, 'redirects.json')
  );
  const copiedRedirectsNginx = await syncOptionalFile(
    redirectsNginxSource,
    path.join(runtimePublicDir, 'redirects.nginx.conf')
  );

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
