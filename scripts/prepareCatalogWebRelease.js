// Rebind immutable catalog HTML to the selected web image without changing data.
// Also executable via stdin so rollback does not require this file in an old image.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const digest = (value) => createHash('sha256').update(value).digest('hex');
export function htmlAssetPaths(html) {
  return [
    ...new Set(
      [
        ...String(html).matchAll(
          /(?:src|href)=["'](\/assets\/[^"'#?]+)(?:[^"']*)["']/g
        ),
      ].map((m) => m[1])
    ),
  ];
}
async function rendererDigest(directory) {
  const chunks = [];
  async function visit(relative) {
    for (const entry of (
      await fs.readdir(path.join(directory, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile())
        chunks.push(file, await fs.readFile(path.join(directory, file)));
      else throw new Error('Unexpected renderer symlink: ' + file);
    }
  }
  await fs.access(path.join(directory, 'server/entry-server.js'));
  await visit('server');
  return digest(
    Buffer.concat(
      chunks.map((chunk) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk + '\0')
      )
    )
  );
}
export async function readWebTemplate(directory) {
  const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
  const manifestText = await fs.readFile(
    path.join(directory, '.vite/manifest.json'),
    'utf8'
  );
  const manifest = JSON.parse(manifestText);
  const assets = new Set(
    Object.values(manifest)
      .flatMap((entry) => [
        entry.file,
        ...(entry.css || []),
        ...(entry.assets || []),
      ])
      .filter((p) => typeof p === 'string' && p.startsWith('assets/'))
      .map((p) => '/' + p)
  );
  if (!htmlAssetPaths(html).some((asset) => /\.m?js$/.test(asset)))
    throw new Error('Missing web JavaScript entry.');
  for (const asset of htmlAssetPaths(html))
    if (!assets.has(asset))
      throw new Error(
        'Template references an asset absent from its manifest: ' + asset
      );
  const renderer = await rendererDigest(directory);
  return {
    html,
    manifestText,
    renderer,
    assets,
    fingerprint: digest(html + '\0' + manifestText + '\0' + renderer),
  };
}
export async function copyWebTemplate(source, destination) {
  const template = await readWebTemplate(source);
  await fs.mkdir(path.join(destination, '.vite'), { recursive: true });
  await fs.writeFile(path.join(destination, 'index.html'), template.html);
  if (template.manifestText)
    await fs.writeFile(
      path.join(destination, '.vite/manifest.json'),
      template.manifestText
    );
  await fs.cp(path.join(source, 'server'), path.join(destination, 'server'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(destination, 'release.json'),
    JSON.stringify({
      fingerprint: template.fingerprint,
      tag: process.env.DEPLOY_TAG || '',
    }) + '\n'
  );
  return template;
}
export async function validatePublishedWebAssets(
  publicDir,
  products,
  template,
  { baseUrl, fetchImpl = fetch } = {}
) {
  const required = htmlAssetPaths(template.html).filter((p) =>
    /\.m?js$/.test(p)
  );
  for (const product of products) {
    if (!/^[A-Za-z0-9-]+$/.test(product.slug || ''))
      throw new Error('Unsafe product slug.');
    const html = await fs.readFile(
      path.join(publicDir, 'product', product.slug + '.html'),
      'utf8'
    );
    const assets = htmlAssetPaths(html);
    for (const asset of assets)
      if (!template.assets.has(asset))
        throw new Error(
          'Stale product asset: ' + product.slug + ' -> ' + asset
        );
    for (const entry of required)
      if (!assets.includes(entry))
        throw new Error('Missing current web entry: ' + product.slug);
    if (
      product.dataStatus === 'pending' &&
      (!html.includes('Данные уточняются') || html.includes('"@type":"Offer"'))
    )
      throw new Error('Pending product lost its non-commercial state.');
  }
  const pages = JSON.parse(
    await fs.readFile(path.join(publicDir, 'catalog/pages.json'), 'utf8')
  );
  for (const { file } of pages) {
    if (!/^catalog\/(?:[a-z0-9-]+\/)?(?:index|page-[1-9]\d*)\.html$/.test(file))
      throw new Error('Unsafe catalog page path.');
    const html = await fs.readFile(path.join(publicDir, file), 'utf8');
    const assets = htmlAssetPaths(html);
    for (const asset of assets)
      if (!template.assets.has(asset))
        throw new Error('Stale catalog asset: ' + file);
    for (const entry of required)
      if (!assets.includes(entry))
        throw new Error('Missing catalog web entry: ' + file);
  }
  if (baseUrl)
    for (const asset of template.assets) {
      const response = await fetchImpl(new URL(asset, baseUrl), {
        signal: AbortSignal.timeout(10000),
      });
      await response.arrayBuffer();
      if (response.status !== 200)
        throw new Error('Web asset HTTP ' + response.status + ': ' + asset);
      // A universal SPA fallback is not proof that JS/CSS actually exists.
      const type = response.headers.get('content-type') || '';
      if (/\.m?js$/.test(asset) && !/(?:javascript|ecmascript)/i.test(type))
        throw new Error('Invalid JavaScript MIME: ' + asset);
      if (/\.css$/.test(asset) && !/text\/css/i.test(type))
        throw new Error('Invalid CSS MIME: ' + asset);
    }
  return {
    products: products.length,
    assets: template.assets.size,
    fingerprint: template.fingerprint,
  };
}
async function replaceLink(target, value) {
  const next = target + '.next-' + randomUUID();
  try {
    await fs.symlink(value, next);
    await fs.rename(next, target);
  } finally {
    await fs.rm(next, { force: true });
  }
}
async function commitAliases(entries) {
  const records = [];
  // Validate both targets before switching either pointer.
  for (const entry of entries) {
    const old = await fs.lstat(entry.target).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (old && !old.isSymbolicLink())
      throw new Error('Release target must be a symlink: ' + entry.target);
    records.push({
      ...entry,
      previous: old ? await fs.readlink(entry.target) : null,
      installed: false,
    });
  }
  try {
    for (const record of records) {
      const releases = path.join(
        path.dirname(record.target),
        '.' + path.basename(record.target) + '-releases'
      );
      await fs.mkdir(releases, { recursive: true });
      record.release = path.join(
        releases,
        `release-${Date.now()}-${process.pid}-${randomUUID()}`
      );
      await fs.rename(record.staged, record.release);
      await replaceLink(
        record.target,
        path.relative(path.dirname(record.target), record.release)
      );
      record.installed = true;
    }
  } catch (error) {
    const failures = [];
    for (const record of [...records].reverse())
      if (record.installed) {
        try {
          if (record.previous === null)
            await fs.rm(record.target, { force: true });
          else await replaceLink(record.target, record.previous);
        } catch (e) {
          failures.push(e.message);
        }
      }
    if (failures.length)
      throw new Error(
        error.message + '; pointer rollback failed: ' + failures.join('; ')
      );
    throw error;
  }
}

export async function prepareCatalogWebRelease({
  projectRoot = process.cwd(),
  templateDir = process.env.CATALOG_WEB_TEMPLATE_DIR,
  log = console.log,
} = {}) {
  if (!templateDir) throw new Error('CATALOG_WEB_TEMPLATE_DIR is required.');
  const { acquirePriceImportLock } = await import(
    pathToFileURL(path.join(projectRoot, 'scripts/lib/importLock.js'))
  );
  const { loadTemplate, prerenderProducts, prerenderCatalogRelease } =
    await import(pathToFileURL(path.join(projectRoot, 'scripts/prerender.js')));
  const { assertProductPrerenderCoverage } = await import(
    pathToFileURL(
      path.join(projectRoot, 'scripts/lib/productPrerenderAudit.js')
    )
  );
  const data = path.join(projectRoot, 'data'),
    active = path.join(data, 'catalog-current');
  const unlock = await acquirePriceImportLock(
    path.join(data, '.price-import.lock')
  );
  if (!unlock) throw new Error('Import/restore/build is already running.');
  let staged, templateStage;
  try {
    const current = await fs.lstat(active).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current && !current.isSymbolicLink())
      throw new Error(
        'Active catalog must be a symlink; migrate it explicitly before deployment.'
      );
    const source = current ? await fs.realpath(active) : data;
    staged = await fs.mkdtemp(path.join(data, '.catalog-web-stage-'));
    if (current) await fs.cp(source, staged, { recursive: true });
    else {
      for (const file of ['products.json', 'productRegistry.json'])
        await fs.copyFile(path.join(data, file), path.join(staged, file));
      await fs.cp(path.join(data, 'public'), path.join(staged, 'public'), {
        recursive: true,
      });
      await fs.copyFile(
        path.join(data, 'price.xls'),
        path.join(staged, 'public/price.xls')
      );
    }
    const productsText = await fs.readFile(
      path.join(staged, 'products.json'),
      'utf8'
    );
    const products = JSON.parse(productsText);
    if (!Array.isArray(products) || !products.length)
      throw new Error('Empty/invalid catalog.');
    for (const p of products)
      if (!/^[A-Za-z0-9-]+$/.test(p.slug || ''))
        throw new Error('Unsafe product slug.');
    templateStage = await fs.mkdtemp(path.join(data, '.catalog-web-template-'));
    const copiedTemplate = templateStage;
    const expected = await copyWebTemplate(templateDir, copiedTemplate);
    const template = await loadTemplate({ outputDir: copiedTemplate });
    const publicDir = path.join(staged, 'public');
    await fs.rm(path.join(publicDir, 'product'), {
      recursive: true,
      force: true,
    });
    await prerenderProducts(template, products, {
      outputDir: publicDir,
      log: null,
    });
    await prerenderCatalogRelease(template, products, {
      outputDir: publicDir,
      templateDir: copiedTemplate,
    });
    await assertProductPrerenderCoverage({ publicDir, products });
    const checked = await validatePublishedWebAssets(
      publicDir,
      products,
      expected
    );
    if (
      (await fs.readFile(path.join(staged, 'products.json'), 'utf8')) !==
      productsText
    )
      throw new Error('Catalog data changed during HTML preparation.');
    await commitAliases([
      { staged, target: active },
      {
        staged: templateStage,
        target: path.join(data, 'web-template-current'),
      },
    ]);
    staged = null;
    templateStage = null;
    log?.('[catalog-web] prepared ' + JSON.stringify(checked));
    return checked;
  } finally {
    if (staged) await fs.rm(staged, { recursive: true, force: true });
    if (templateStage)
      await fs.rm(templateStage, { recursive: true, force: true });
    await unlock();
  }
}
async function main() {
  if (process.argv.includes('--check')) {
    const root = process.cwd(),
      active = await fs.realpath(path.join(root, 'data/catalog-current'));
    const products = JSON.parse(
      await fs.readFile(path.join(active, 'products.json'), 'utf8')
    );
    const template = await readWebTemplate(
      path.join(root, 'data/web-template-current')
    );
    console.log(
      '[catalog-web] checked ' +
        JSON.stringify(
          await validatePublishedWebAssets(
            path.join(active, 'public'),
            products,
            template,
            { baseUrl: process.env.CATALOG_WEB_BASE_URL }
          )
        )
    );
  } else await prepareCatalogWebRelease();
}
if (
  process.argv[1] === '-' ||
  import.meta.url === pathToFileURL(process.argv[1] || '').href
)
  main().catch((error) => {
    console.error('[catalog-web] ' + error.message);
    process.exitCode = 1;
  });
