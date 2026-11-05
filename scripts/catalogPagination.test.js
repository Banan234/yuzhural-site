import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { prerenderCatalogRelease } from './prerender.js';

it('writes finite SSR pages, isolates pending/query URLs, and removes obsolete pages on regeneration', async () => {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'catalog-pagination-')
  );
  const products = Array.from({ length: 57 }, (_, i) => ({
    id: i + 1,
    slug: `fixture-${i + 1}`,
    title: `Fixture ${i + 1}`,
    price: 10 + i,
    stock: 20,
    unit: 'м',
  }));
  const pending = { id: 58, slug: 'pending-fixture', dataStatus: 'pending' };
  const template =
    '<html><head><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
  const options = {
    outputDir,
    categoriesData: { sections: [] },
    manifest: {},
    renderApp: (url, { prerenderData }) =>
      `<main><h1>Fixture</h1>${(prerenderData.catalog?.items || []).map((p) => `<a href="/product/${p.slug}">${p.title}</a>`).join('')}</main>`,
  };
  try {
    const pages = await prerenderCatalogRelease(
      template,
      [...products, pending],
      options
    );
    expect(pages.map((p) => p.ids)).toEqual([
      products.slice(0, 28).map((p) => p.id),
      products.slice(28, 56).map((p) => p.id),
      [57],
    ]);
    const page2 = await fs.readFile(
      path.join(outputDir, 'catalog/page-2.html'),
      'utf8'
    );
    expect(page2).toContain('/catalog/?page=2');
    expect(page2).toContain('href="/product/fixture-29"');
    expect(page2).not.toContain('href="/product/fixture-1"');
    expect(page2).not.toContain('data-client-render="true"');
    expect(page2).not.toContain('pending-fixture');
    const query = await fs.readFile(
      path.join(outputDir, 'catalog/query.html'),
      'utf8'
    );
    expect(query).toContain('noindex,follow');
    expect(query).toContain('data-client-render="true"');
    expect(query).not.toContain('rel="canonical"');
    await prerenderCatalogRelease(template, products.slice(0, 28), options);
    await expect(
      fs.access(path.join(outputDir, 'catalog/page-2.html'))
    ).rejects.toThrow();
    const records = JSON.parse(
      await fs.readFile(path.join(outputDir, 'catalog/pages.json'))
    );
    expect(records).toHaveLength(1);
    await expect(
      prerenderCatalogRelease(template, products, {
        ...options,
        renderApp: () => '<main><h1>Wrong loading shell</h1></main>',
      })
    ).rejects.toThrow('Incomplete catalog SSR');
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
