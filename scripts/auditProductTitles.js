import fs from 'node:fs/promises';
import { auditProductTitles } from '../shared/productTitleAudit.js';
import * as xlsx from '@e965/xlsx';
import { extractProducts } from './lib/priceCatalogPreparation.js';

const files = process.argv.slice(2);
if (!files.length)
  files.push(
    'data/products.json',
    'data/catalog-current/products.json',
    'data/price.xls'
  );
for (const file of files) {
  let products;
  if (/\.xlsx?$/iu.test(file)) {
    const workbook = xlsx.read(await fs.readFile(file), {
      type: 'buffer',
      cellDates: false,
    });
    const rows = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      }
    );
    products = extractProducts(rows).products;
  } else {
    products = JSON.parse(await fs.readFile(file, 'utf8'));
  }
  const issues = auditProductTitles(products);
  console.log(
    `${file}: проверено ${products.length}, ошибок названий ${issues.length}`
  );
  for (const issue of issues) console.error(JSON.stringify(issue));
  if (issues.length) process.exitCode = 1;
}
