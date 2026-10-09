// Read-only audit of source cells and the complete import pipeline.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from '@e965/xlsx';
import { createProductRecord, extractProducts } from './importPrice.js';
import { buildStableKey } from './lib/productRegistry.js';
import { parseProductName } from './lib/priceParser.js';

export async function auditPriceParsing(input, output) {
  const workbook = XLSX.read(await fs.readFile(input), { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  });
  const locations = new Map();
  rows.forEach((row, index) => {
    row.forEach((value, column) => {
      if (typeof value !== 'string') return;
      const key = value.trim();
      if (!locations.has(key)) locations.set(key, []);
      locations.get(key).push(XLSX.utils.encode_cell({ r: index, c: column }));
    });
  });
  const { products, skippedRows } = extractProducts(rows);
  const errors = [];
  const keyGroups = new Map();
  const records = products.map((product) => {
    const {
      sourceName,
      name,
      mark,
      attributes,
      conductorConfiguration,
      cores,
      groupCores,
      crossSection,
      groundCores,
      groundSection,
      voltage,
      parsingWarnings,
    } = product;
    const cells = locations.get(sourceName) || [];
    const addError = (reason) => errors.push({ cells, sourceName, reason });
    if (!cells.length) addError('Source name does not match any workbook cell');
    const repeated = createProductRecord(
      { ...product, name: sourceName },
      product.sourceCategory
    ).value;
    if (
      repeated?.name !== name ||
      buildStableKey(repeated || {}) !== buildStableKey(product)
    ) {
      addError('Repeated normalization changes name or identity');
    }
    if (
      attributes.some((value) =>
        /^[хx×gG]\s*\d|^\+\d|^\/\d|^Э(?:Ф|М|А|Э)?нг/u.test(value)
      )
    ) {
      addError('Unconsumed specification or joined screen/fire attribute');
    }
    if (attributes.some((value) => /^[()]$/u.test(value)))
      addError('Loose wrapper in attributes');
    if (crossSection != null && !(crossSection > 0))
      addError('Invalid section');
    if (cores != null && (!Number.isInteger(cores) || cores <= 0))
      addError('Invalid core count');
    if (
      conductorConfiguration &&
      /AWG/iu.test(conductorConfiguration) &&
      crossSection != null
    ) {
      addError('AWG treated as square millimetres');
    }
    if (
      conductorConfiguration &&
      parsingWarnings.length &&
      crossSection != null
    ) {
      addError('Malformed configuration has a guessed numeric section');
    }
    if (cores || conductorConfiguration) {
      const reparsed = parseProductName(name);
      for (const field of [
        'mark',
        'cores',
        'groupCores',
        'crossSection',
        'groundCores',
        'groundSection',
        'conductorConfiguration',
      ]) {
        if (product[field] !== reparsed[field])
          addError(`Displayed name changes ${field}`);
      }
    }
    const key = buildStableKey(product);
    if (!keyGroups.has(key)) keyGroups.set(key, []);
    keyGroups.get(key).push({ cells, sourceName });
    return {
      cells,
      sourceName,
      name,
      mark,
      attributes,
      conductorConfiguration,
      cores,
      groupCores,
      crossSection,
      groundCores,
      groundSection,
      voltage,
      parsingWarnings,
    };
  });
  const warnings = records.filter((p) => p.parsingWarnings.length);
  const duplicates = [...keyGroups.values()].filter((p) => p.length > 1);
  const report = {
    input: path.resolve(input),
    sheet: sheetName,
    count: records.length,
    errors,
    warnings,
    skippedRows,
    duplicates,
    records,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  const escape = (value) =>
    String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
  const markdown =
    [
      '# Проверка разбора прайса',
      '',
      `Проверено строк: ${records.length}. Ошибок автоматических проверок: ${errors.length}. Строк с диагностикой исходных данных: ${warnings.length}.`,
      '',
      'Проверки: происхождение строки, повторная нормализация, полнота сечения, отсутствие обрывков в суффиксах, числовые поля, AWG, повторный разбор названия карточки.',
      '',
      'Нулевое число ошибок относится к перечисленным проверкам. Неизвестные обозначения сохраняются; их технический смысл не угадывается.',
      '',
      '## Строки с диагностикой',
      '',
      '| Ячейка | Исходное название | Диагностика |',
      '|---|---|---|',
      ...warnings.map(
        (p) =>
          `| ${p.cells.join(', ')} | ${escape(p.sourceName)} | ${p.parsingWarnings.join(', ')} |`
      ),
      '',
      '## Полный разбор',
      '',
      '| Ячейка | Исходное название | Марка | Сечение / конфигурация | Признаки |',
      '|---|---|---|---|---|',
      ...records.map(
        (p) =>
          `| ${p.cells.join(', ')} | ${escape(p.sourceName)} | ${escape(p.mark)} | ${escape(p.conductorConfiguration || (p.cores ? `${p.cores}х${p.crossSection}${p.groundCores ? `+${p.groundCores}х${p.groundSection}` : ''}` : ''))} | ${escape(p.attributes.join(', '))} |`
      ),
    ].join('\n') + '\n';
  await fs.writeFile(output.replace(/\.json$/u, '.md'), markdown);
  console.log(
    JSON.stringify({
      products: records.length,
      errors: errors.length,
      warnings: warnings.length,
      duplicateGroups: duplicates.length,
      report: output,
    })
  );
  if (errors.length) {
    console.log(JSON.stringify(errors.slice(0, 20), null, 2));
    process.exitCode = 1;
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await auditPriceParsing(
    process.argv[2] || 'data/price.xls',
    process.argv[3] || 'data/price-parsing-audit.json'
  );
}
