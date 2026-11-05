// Synthetic SSR bundle for filesystem/transaction tests; browser tests use Vite's real bundle.
import fs from 'node:fs/promises';
import path from 'node:path';
export async function writeCatalogRendererFixture(directory) {
  await fs.mkdir(path.join(directory, 'server'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'server/package.json'),
    '{"type":"module"}'
  );
  await fs.writeFile(
    path.join(directory, 'server/entry-server.js'),
    `
export function render(url, { prerenderData = {} } = {}) {
  const escape = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return '<main><h1>Fixture catalog</h1>' + (prerenderData.catalog?.items || []).map(p => '<a href="/product/' + escape(p.slug) + '">' + escape(p.title) + '</a>').join('') + '</main>';
}
`
  );
}
