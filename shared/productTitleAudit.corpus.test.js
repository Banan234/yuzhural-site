import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { auditProductTitles } from './productTitleAudit.js';

// Import diagnostics always validate new rows. These additional checks audit
// locally generated catalogs, which are intentionally absent in clean clones.
for (const path of [
  '../data/products.json',
  '../data/catalog-current/products.json',
]) {
  const file = new URL(path, import.meta.url);
  test.skipIf(!existsSync(file))(
    `весь каталог ${path} имеет осмысленные названия`,
    () => {
      const products = JSON.parse(readFileSync(file, 'utf8'));
      expect(products.length).toBeGreaterThan(0);
      expect(auditProductTitles(products)).toEqual([]);
    }
  );
}
