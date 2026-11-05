import { writeCatalogRendererFixture } from './test/catalogRendererFixture.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import {
  prepareCatalogWebRelease,
  readWebTemplate,
  validatePublishedWebAssets,
} from './prepareCatalogWebRelease.js';
import { prerenderProducts } from './prerender.js';
import { writeSeoArtifacts } from './lib/siteSeo.js';
import { publishImportArtifacts } from './lib/importPublisher.js';
import { acquirePriceImportLock } from './lib/importLock.js';
const roots = [];
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
afterEach(async () => {
  vi.restoreAllMocks();
  for (const r of roots.splice(0))
    await fs.rm(r, { recursive: true, force: true });
});
const product = {
  id: 1,
  sku: 'SYN-1',
  slug: 'synthetic-cable',
  name: 'ВВГ 3х2.5',
  sourceName: 'ВВГ 3х2.5',
  mark: 'ВВГ',
  price: 12.345,
  stock: 5,
  unit: 'м',
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  catalogCategory: 'Силовой кабель',
  catalogCategorySlug: 'silovoy-kabel',
};
const pending = {
  ...product,
  id: 2,
  sku: 'SYN-2',
  slug: 'pending-cable',
  dataStatus: 'pending',
  price: null,
  stock: null,
  unit: null,
  inStock: false,
  description: 'Данные уточняются',
};
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-web-'));
  roots.push(root);
  await fs.symlink(scriptsDir, root + '/scripts');
  await fs.mkdir(root + '/data/baseline/public', { recursive: true });
  await fs.symlink('baseline', root + '/data/catalog-current');
  await fs.mkdir(root + '/shared');
  await fs.writeFile(root + '/shared/categories.json', '{}');
  for (const tag of ['A', 'B']) {
    await writeCatalogRendererFixture(root + '/' + tag);
    await fs.mkdir(root + '/' + tag + '/.vite', { recursive: true });
    await fs.mkdir(root + '/' + tag + '/assets');
    await fs.writeFile(
      root + '/' + tag + '/assets/' + tag + '.js',
      'console.log("synthetic ' + tag + '")'
    );
    await fs.writeFile(
      root + '/' + tag + '/.vite/manifest.json',
      JSON.stringify({ 'index.html': { file: 'assets/' + tag + '.js' } })
    );
    await fs.writeFile(
      root + '/' + tag + '/index.html',
      '<!doctype html><html><head><script type="module" src="/assets/' +
        tag +
        '.js"></script></head><body><div id="root"></div></body></html>'
    );
  }
  const products = [product, pending];
  const active = root + '/data/catalog-current';
  await fs.writeFile(active + '/products.json', JSON.stringify(products));
  await fs.writeFile(
    active + '/productRegistry.json',
    JSON.stringify({ version: 1, nextId: 4, entries: {} })
  );
  await fs.writeFile(active + '/public/price.xls', 'SYNTHETIC_XLS');
  await writeSeoArtifacts({
    outputDir: active + '/public',
    siteUrl: 'https://example.com',
    products,
    categoriesData: {},
  });
  await prerenderProducts(
    await fs.readFile(root + '/A/index.html', 'utf8'),
    products,
    { outputDir: active + '/public', log: null }
  );
  return { root, active, products };
}
async function nativeNginx(f) {
  const bin = '/opt/homebrew/bin/nginx';
  if (spawnSync(bin, ['-v']).error) return null;
  const www = f.root + '/www';
  await fs.mkdir(www);
  await fs.symlink(f.root + '/B', www + '/html');
  await fs.symlink(f.root + '/data', www + '/runtime-data');
  const config = await fs.readFile(
    path.join(scriptsDir, '../nginx.conf'),
    'utf8'
  );
  const blocks =
    config.match(
      /    location ~ \^\/product\/\(\[A-Za-z0-9-\]\+\)\$ \{[\s\S]*?\n    \}/
    )[0] +
    config.match(
      /    location ~ \^\/__active-catalog-product\/[\s\S]*?\n    \}/
    )[0];
  const reserve = net.createServer();
  await new Promise((r) => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const file = f.root + '/nginx.conf';
  await fs.writeFile(
    file,
    `pid ${f.root}/nginx.pid;error_log ${f.root}/nginx.log;events{}http{include /opt/homebrew/etc/nginx/mime.types;access_log off;server{listen 127.0.0.1:${port};root ${www}/html;${blocks.replaceAll('/usr/share/nginx', www)}location /{try_files $uri =404;}}}`
  );
  const proc = spawn(bin, ['-p', f.root, '-c', file, '-g', 'daemon off;'], {
    stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base + '/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  return {
    base,
    www,
    close: async () => {
      proc.kill('SIGTERM');
      if (proc.exitCode === null)
        await new Promise((r) => proc.once('exit', r));
    },
  };
}
it('updates and rolls back HTML/assets against actual Nginx while retaining the latest imported data', async () => {
  const f = await fixture(),
    native = await nativeNginx(f);
  const before = await fs.readFile(f.active + '/products.json', 'utf8');
  try {
    if (native) {
      expect(
        (await fetch(native.base + '/product/synthetic-cable')).status
      ).toBe(200);
      expect((await fetch(native.base + '/assets/A.js')).status).toBe(404);
    }
    await prepareCatalogWebRelease({
      projectRoot: f.root,
      templateDir: f.root + '/B',
      log: null,
    });
    expect(await fs.readFile(f.active + '/products.json', 'utf8')).toBe(before);
    expect(await fs.readFile(f.active + '/public/price.xls', 'utf8')).toBe(
      'SYNTHETIC_XLS'
    );
    if (native) {
      expect((await fetch(native.base + '/assets/B.js')).status).toBe(200);
      await validatePublishedWebAssets(
        f.active + '/public',
        f.products,
        await readWebTemplate(f.root + '/data/web-template-current'),
        { baseUrl: native.base }
      );
    }
    // A real synthetic import after the code update removes one SKU and adds another.
    const fresh = {
      ...product,
      id: 3,
      sku: 'SYN-3',
      slug: 'fresh-after-update',
      price: 17.5,
      stock: 8,
    };
    const products = [pending, fresh];
    await publishImportArtifacts({
      projectRoot: f.root,
      catalogDir: f.active,
      publicDir: f.active + '/public',
      outputFile: f.active + '/products.json',
      registryFile: f.active + '/productRegistry.json',
      reportFile: f.root + '/data/import-report.json',
      reportHtmlFile: f.root + '/data/import-report.html',
      historyFile: f.root + '/data/import-history.json',
      publicPriceFile: f.active + '/public/price.xls',
      redirectsFile: f.active + '/public/redirects.json',
      redirectsNginxFile: f.active + '/public/redirects.nginx.conf',
      inputFile: f.active + '/public/price.xls',
      categoriesFile: f.root + '/shared/categories.json',
      runtimePrerenderTemplateDir: f.root + '/data/web-template-current',
      siteUrl: 'https://example.com',
      products,
      registry: { version: 1, nextId: 4, entries: {} },
      report: { summary: {}, diagnostics: {} },
      sourcePriceBuffer: Buffer.from('SYNTHETIC_XLS'),
      slugRedirects: {},
      importConfig: { suspiciousPriceStats: { historyLimit: 5 } },
      importHistory: { imports: [] },
      generatedAt: '2026-10-27T00:00:00Z',
      source: { kind: 'synthetic' },
    });
    const imported = await fs.readFile(f.active + '/products.json', 'utf8');
    expect(
      (await readWebTemplate(f.root + '/data/web-template-current')).assets.has(
        '/assets/B.js'
      )
    ).toBe(true);
    if (native) {
      await fs.unlink(native.www + '/html');
      await fs.symlink(f.root + '/A', native.www + '/html');
      expect((await fetch(native.base + '/assets/B.js')).status).toBe(404);
    }
    await prepareCatalogWebRelease({
      projectRoot: f.root,
      templateDir: f.root + '/A',
      log: null,
    });
    expect(await fs.readFile(f.active + '/products.json', 'utf8')).toBe(
      imported
    );
    if (native) {
      await validatePublishedWebAssets(
        f.active + '/public',
        products,
        await readWebTemplate(f.root + '/data/web-template-current'),
        { baseUrl: native.base }
      );
      expect(
        (await fetch(native.base + '/product/fresh-after-update')).status
      ).toBe(200);
      expect(
        (await fetch(native.base + '/product/synthetic-cable')).status
      ).toBe(404);
      const p = await (
        await fetch(native.base + '/product/pending-cable')
      ).text();
      expect(p).toContain('Данные уточняются');
      expect(p).not.toContain('"@type":"Offer"');
    }
  } finally {
    await native?.close();
  }
});
it('keeps both old pointers on invalid assets, held import lock and failed second pointer commit', async () => {
  const f = await fixture();
  await prepareCatalogWebRelease({
    projectRoot: f.root,
    templateDir: f.root + '/A',
    log: null,
  });
  const catalog = await fs.readlink(f.active),
    template = await fs.readlink(f.root + '/data/web-template-current');
  await fs.writeFile(f.root + '/B/.vite/manifest.json', '{}');
  await expect(
    prepareCatalogWebRelease({
      projectRoot: f.root,
      templateDir: f.root + '/B',
      log: null,
    })
  ).rejects.toThrow('absent');
  expect(await fs.readlink(f.active)).toBe(catalog);
  const unlock = await acquirePriceImportLock(
    f.root + '/data/.price-import.lock'
  );
  await expect(
    prepareCatalogWebRelease({
      projectRoot: f.root,
      templateDir: f.root + '/A',
      log: null,
    })
  ).rejects.toThrow('already running');
  await unlock();
  const rename = fs.rename.bind(fs);
  let failed = false;
  vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
    if (!failed && b === f.root + '/data/web-template-current') {
      failed = true;
      throw new Error('synthetic pointer failure');
    }
    return rename(a, b);
  });
  await expect(
    prepareCatalogWebRelease({
      projectRoot: f.root,
      templateDir: f.root + '/A',
      log: null,
    })
  ).rejects.toThrow('synthetic pointer failure');
  expect(await fs.readlink(f.active)).toBe(catalog);
  expect(await fs.readlink(f.root + '/data/web-template-current')).toBe(
    template
  );
});
