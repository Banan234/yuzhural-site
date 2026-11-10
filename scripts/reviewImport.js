// Local review workflow. Never publishes a catalog or guesses a price.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './lib/importPublisher.js';
import { acquirePriceImportLock } from './lib/importLock.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const archive = path.join(root, 'data/import-reports');
const names = (await fs.readdir(archive))
  .filter((n) => n.endsWith('.json'))
  .sort()
  .reverse();
let report;
let reportPath;
for (const name of names) {
  const candidate = JSON.parse(
    await fs.readFile(path.join(archive, name), 'utf8')
  );
  if (Array.isArray(candidate.reviewRows)) {
    report = candidate;
    reportPath = path.join(archive, name);
    break;
  }
}
if (!report)
  throw Error('Нет отчёта с очередью проверки. Сначала выполните импорт.');
console.log(`Очередь из отчёта: ${reportPath}`);
const rows = report.reviewRows || [];
const csv = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
if (!args.length || args[0] === 'export') {
  const target = path.join(root, 'output/import-review.csv');
  await fs.mkdir(path.dirname(target), { recursive: true });
  const records = [
    [
      'Позиция',
      'Причина',
      'Коды',
      'Лист',
      'Строка Excel',
      'Категория',
      'Исходные ячейки',
    ],
    ...rows.map((r) => [
      r.product,
      r.reason,
      (r.codes || []).join(';'),
      r.sourceSheet,
      Number.isInteger(r.rowIndex) ? r.rowIndex + 1 : '',
      r.category,
      JSON.stringify(r.sourceCells || []),
    ]),
  ];
  // Neutralize spreadsheet formulas in all cells, including source workbook text.
  await fs.writeFile(
    target,
    '\ufeff' +
      records
        .map((row) =>
          row
            .map((v) => csv(/^[=+\-@\t\r]/.test(String(v ?? '')) ? "'" + v : v))
            .join(';')
        )
        .join('\r\n')
  );
  console.log(
    `${rows.length} строк: ${target}\nОтчёт с причинами: ${reportPath.replace(/\.json$/, '.html')}`
  );
} else if (args[0] === 'price') {
  const [, name, rawPrice, reason] = args;
  const price = Number(String(rawPrice).replace(',', '.'));
  if (!name || !reason?.trim() || !Number.isFinite(price) || price <= 0)
    throw Error(
      'Использование: price "точное название" положительная_цена "обоснование" [--apply]'
    );
  if (!rows.some((r) => r.product === name))
    throw Error('Нет такой позиции в текущей очереди проверки.');
  const file = path.join(root, 'data/priceOverrides.json');
  const release = await acquirePriceImportLock(
    path.join(root, 'data/.price-import.lock')
  );
  if (!release) throw Error('Идёт импорт; повторите после его завершения.');
  try {
    const original = await fs.readFile(file, 'utf8');
    const config = JSON.parse(original);
    const proposed = { price, reason: reason.trim() };
    console.log(
      JSON.stringify(
        { name, previous: config.overrides?.[name] || null, proposed },
        null,
        2
      )
    );
    if (args.includes('--apply')) {
      await writeFileAtomic(`${file}.review-backup-${Date.now()}`, original);
      config.overrides ||= {};
      config.overrides[name] = proposed;
      await writeFileAtomic(file, JSON.stringify(config, null, 2) + '\n');
      console.log(
        'Сохранено. Позиция не считается исправленной до повторного импорта и проверки результата. Запустите npm run import:price (без --if-changed).'
      );
    } else
      console.log(
        'Предпросмотр: файлы не изменены. Для сохранения добавьте --apply.'
      );
  } finally {
    await release();
  }
} else
  throw Error(
    'Команды: export | price "название" цена "обоснование" [--apply]'
  );
