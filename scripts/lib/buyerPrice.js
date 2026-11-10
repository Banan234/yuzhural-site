import fs from 'node:fs/promises';
import XLSX from '@e965/xlsx';
import { SITE_EMAIL } from '../../src/lib/siteConfig.js';
import { isProductPending } from '../../shared/productAvailability.js';

const templateUrl = new URL('../templates/buyer-price.xlsx', import.meta.url);
const collator = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});
const columns = 'ABCDEFGHI';
const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function buyerPriceRows(products) {
  return [...products]
    .sort((a, b) => {
      for (const field of [
        'catalogCategory',
        'mark',
        'name',
        'manufacturer',
        'sku',
      ]) {
        const order = collator.compare(a[field] || '', b[field] || '');
        if (order) return order;
      }
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    })
    .map((p) => {
      const pending = isProductPending(p);
      if (
        !pending &&
        (!Number.isFinite(p.price) ||
          p.price <= 0 ||
          !Number.isFinite(p.stock) ||
          p.stock <= 0 ||
          !p.unit)
      ) {
        throw new Error(
          `Некорректные коммерческие данные для прайса: ${p.sku || p.id}`
        );
      }
      return [
        p.catalogCategory || p.category || 'Без категории',
        p.fullName || p.name,
        p.mark || '',
        p.manufacturer || 'Не указан',
        pending ? null : p.unit,
        pending ? null : p.price,
        pending ? null : p.stock,
        pending ? 'Данные уточняются' : 'В наличии',
        p.sku || String(p.id),
      ];
    });
}

// The layout is authored in Artifact Tool. Runtime only fills the OOXML template;
// the deployed Node service needs no desktop authoring runtime or extra packages.
export async function buildBuyerPrice(
  products,
  { generatedAt, dateLabel = 'Дата выпуска' } = {}
) {
  if (!products.length) throw new Error('Нельзя сформировать пустой прайс.');
  const date = new Date(generatedAt);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Не задана дата выпуска прайса.');
  const rows = buyerPriceRows(products);
  const archive = XLSX.CFB.read(await fs.readFile(templateUrl), {
    type: 'buffer',
  });
  const read = (name) => {
    const entry = XLSX.CFB.find(archive, `/${name}`);
    if (!entry) throw new Error(`Неполный шаблон прайса: ${name}`);
    return Buffer.from(entry.content).toString('utf8');
  };
  const write = (name, content) =>
    XLSX.CFB.utils.cfb_add(archive, `/${name}`, Buffer.from(content));
  // Contact text in the design template follows the same config as the header.
  for (const entry of archive.FileIndex) {
    if (entry.name?.endsWith('.xml') && entry.content) {
      const text = Buffer.from(entry.content).toString('utf8');
      if (text.includes('yuek.sales@yandex.com'))
        entry.content = Buffer.from(
          text.replaceAll('yuek.sales@yandex.com', xml(SITE_EMAIL))
        );
    }
  }
  let sheet = read('xl/worksheets/sheet1.xml');
  const sample = sheet.match(/<x:row r="7"[^>]*>[\s\S]*?<\/x:row>/)?.[0];
  if (!sample) throw new Error('В шаблоне отсутствует строка данных.');
  const styles = [...sample.matchAll(/<x:c r="([A-I])7" s="(\d+)"/g)].map(
    (m) => m[2]
  );
  if (styles.length !== 9) throw new Error('В шаблоне изменены колонки.');
  const body = rows
    .map((values, index) => {
      const row = index + 7;
      // Keep long designations readable without truncating stored text.
      const lines = Math.max(
        1,
        ...values.map((v, i) =>
          Math.ceil(
            String(v ?? '').length / [30, 58, 22, 24, 8, 20, 16, 22, 16][i]
          )
        )
      );
      const cells = values
        .map((value, i) => {
          const attrs = `r="${columns[i]}${row}" s="${styles[i]}"`;
          if (value == null) return `<x:c ${attrs}/>`;
          return typeof value === 'number'
            ? `<x:c ${attrs} t="n"><x:v>${value}</x:v></x:c>`
            : `<x:c ${attrs} t="inlineStr"><x:is><x:t xml:space="preserve">${xml(value)}</x:t></x:is></x:c>`;
        })
        .join('');
      return `<x:row r="${row}" ht="${Math.max(28, lines * 16)}" customHeight="1">${cells}</x:row>`;
    })
    .join('');
  const displayDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
  sheet = sheet
    .replace('{{DATE_LABEL}}', xml(dateLabel))
    .replace(sample, body)
    .replace('{{DATE}}', xml(`${displayDate} (Екатеринбург)`));
  write('xl/worksheets/sheet1.xml', sheet);
  write(
    'xl/tables/table1.xml',
    read('xl/tables/table1.xml').replaceAll('A6:I7', `A6:I${rows.length + 6}`)
  );
  return Buffer.from(
    XLSX.CFB.write(archive, {
      type: 'buffer',
      fileType: 'zip',
      compression: true,
    })
  );
}
