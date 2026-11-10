import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCatalogSnapshot } from './lib/catalogSnapshot.js';
import { buildBuyerPrice } from './lib/buyerPrice.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = await resolveCatalogSnapshot(root);
const payload = JSON.parse(await fs.readFile(snapshot.productsPath, 'utf8'));
const products = Array.isArray(payload)
  ? payload
  : payload.items || payload.products;
const generatedAt =
  payload.generatedAt ||
  (await fs.stat(snapshot.productsPath)).mtime.toISOString();
const destination = path.resolve(
  process.argv[2] || path.join(root, 'public/price-buyer.xlsx')
);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(
  destination,
  await buildBuyerPrice(products, {
    generatedAt,
    dateLabel: payload.generatedAt ? 'Дата выпуска' : 'Дата файла каталога',
  })
);
console.log(
  `Прайс для покупателей: ${products.length} позиций → ${destination}`
);
