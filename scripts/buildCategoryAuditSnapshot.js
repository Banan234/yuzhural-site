// Обновляет диагностические снимки классификации без публикации каталога.

import fs from 'node:fs';
import path from 'node:path';
import xlsx from '@e965/xlsx';
import {
  classifyEligibleProducts,
  extractProducts,
} from './lib/priceCatalogPreparation.js';
import { getSourceCategoryCandidate } from './lib/catalogClassifier.js';

const root = path.resolve(import.meta.dirname, '..');
const reportDir = path.join(root, 'outputs/category-restructure-2026-10-12');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const sourceFile = path.join(reportDir, 'price-local-snapshot.xls');
const previous = readJson(path.join(reportDir, 'baseline-products.json'));
const oldSummary = readJson(path.join(reportDir, 'summary-current.json'));
const workbook = xlsx.read(fs.readFileSync(sourceFile), {
  type: 'buffer',
  cellDates: false,
});
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(worksheet, {
  header: 1,
  blankrows: false,
  defval: '',
  raw: false,
});
const physicalRows = xlsx.utils.sheet_to_json(worksheet, {
  header: 1,
  blankrows: true,
  defval: '',
  raw: false,
});
const physicalRowBySourceIndex = [];
for (let index = 0; index < physicalRows.length; index += 1) {
  if (physicalRows[index].some((cell) => String(cell ?? '') !== '')) {
    physicalRowBySourceIndex.push(index + 1);
  }
}
if (physicalRowBySourceIndex.length !== rows.length) {
  throw new Error(
    'Нельзя сопоставить строки разбора с физическими строками XLS.'
  );
}
const imported = extractProducts(rows);
const products = classifyEligibleProducts(imported.products);
const norm = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU');
const sourceNorm = (value) =>
  norm(value).replace(/\s+/gu, '').replaceAll(',', '.');
const key = (value) => norm(value.name);
const cellFor = (product) => {
  const row = rows[product.sourceRowIndex];
  const side =
    sourceNorm(row?.[0]) === sourceNorm(product.sourceName)
      ? 'A'
      : sourceNorm(row?.[5]) === sourceNorm(product.sourceName)
        ? 'F'
        : null;
  if (!side) throw new Error(`Не найдена ячейка: ${product.name}`);
  return `${side}${physicalRowBySourceIndex[product.sourceRowIndex]}`;
};
const reviewProductByRowAndName = new Map(
  products.map((product) => [
    `${product.sourceRowIndex}:${product.name}`,
    product,
  ])
);
const review = imported.reviewRows.map((item) => {
  const product = reviewProductByRowAndName.get(
    `${item.rowIndex}:${item.product}`
  );
  if (!product) {
    throw new Error(`Нет товара для ручной проверки: ${item.product}`);
  }
  return {
    ...item,
    cell: cellFor(product),
    markFamily: product.markFamily || '',
    catalogCategorySlug: product.catalogCategorySlug || '',
    catalogSubcategorySlug: product.catalogSubcategorySlug || '',
    catalogClassificationSource: product.catalogClassificationSource || '',
    unit: product.unit || '',
    price: product.price ?? null,
    stock: product.stock ?? null,
    manufacturer: product.manufacturer || '',
  };
});
const previousByName = new Map();
for (const product of previous) {
  const name = key(product);
  if (!previousByName.has(name)) previousByName.set(name, []);
  previousByName.get(name).push(product);
}
const moves = [];
for (const product of products) {
  const before = previousByName.get(key(product))?.shift();
  if (!before) throw new Error(`Нет прежней позиции: ${product.name}`);
  if (
    before.catalogCategorySlug === product.catalogCategorySlug &&
    (before.catalogSubcategorySlug || '') ===
      (product.catalogSubcategorySlug || '')
  ) {
    continue;
  }
  const cell = cellFor(product);
  moves.push({
    cell,
    sourceRowIndex: product.sourceRowIndex,
    name: product.name,
    mark: product.mark || '',
    manufacturer: product.manufacturer || '',
    sourceCategory: product.sourceCategory || '',
    from: {
      category: before.catalogCategorySlug || '',
      subcategory: before.catalogSubcategorySlug || '',
      source: 'previousCatalog',
      match: null,
    },
    to: {
      category: product.catalogCategorySlug || '',
      subcategory: product.catalogSubcategorySlug || '',
      source: product.catalogClassificationSource || '',
      match: product.catalogClassificationMatch || null,
    },
  });
}
moves.sort(
  (a, b) =>
    a.sourceRowIndex - b.sourceRowIndex || a.cell.localeCompare(b.cell, 'ru')
);

const signalEvidence =
  'https://kazkabel.kz/catalog-ru/cables-ru/kabeli-signalno-blokirovochnye-ru';
const segmentCatalog =
  'https://segmentenergo.kz/wp-content/uploads/2024/04/%D0%9E%D0%B1%D1%89%D0%B8%D0%B9-%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3-%D0%A1%D0%B5%D0%B3%D0%BC%D0%B5%D0%BD%D1%82%D0%AD%D0%9D%D0%95%D0%A0%D0%93%D0%9E.pdf';
const evidenceRules = [
  [
    /^ВЭкВКВ-ВП/u,
    'needs_exact_document',
    null,
    'Нужен паспорт точной марки; заголовок КИМЭП-М к ней не относится.',
  ],
  [
    /^Сегмент-КИ185/u,
    'needs_exact_document',
    segmentCatalog,
    'В каталоге есть КИ485, но КИ185 не найден.',
  ],
  [
    /^КОПС(?:\s|МВ)/u,
    'needs_exact_document',
    segmentCatalog,
    'В каталоге есть КОПСЭ, но точное исполнение не найдено.',
  ],
  [
    /^КСВП/u,
    'needs_exact_document',
    'https://verkkon.net/',
    'Производитель описывает исполнения -5е; в строке прайса индекс категории отсутствует.',
  ],
  [/^МКСШп/u, 'needs_exact_document', null, 'Точный паспорт марки не найден.'],
  [
    /^ПТПВ-ха/u,
    'needs_exact_document',
    null,
    'Точный паспорт марки не найден.',
  ],
  [
    /^РЭкП-ВП/u,
    'needs_individual_review',
    null,
    'Точный паспорт марки не найден.',
  ],
  [
    /^AVC ELECTRONICS/u,
    'needs_individual_review',
    null,
    'Не определено, является ли изделие кабелем.',
  ],
  [
    /^КГПЭф/u,
    'needs_individual_review',
    null,
    'Точный паспорт марки не найден.',
  ],
  [
    /^РВСБПМ.*NEXANS/u,
    'needs_individual_review',
    null,
    'Точный паспорт импортного исполнения не найден.',
  ],
  [
    /^тофлекс РКП/u,
    'needs_individual_review',
    null,
    'Точный паспорт марки не найден.',
  ],
  [
    /^ПМТК/u,
    'vendor_evidence',
    'https://avrora-arm.ru/produkcziya/elektrika/provoda/pmtk.html',
    'Найдено описание поставщика; нужен паспорт производителя.',
  ],
  [
    /^КППГ/u,
    'series_evidence',
    'https://segmentenergo.ru/catalog/cables/kvvg-kppg',
    'КППГ — контрольная серия.',
  ],
  [
    /^МКПс/u,
    'series_evidence',
    'https://storage.yandexcloud.net/catalog/intech/%D0%91%D1%83%D0%BA%D0%BB%D0%B5%D1%82%20%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D0%B8%20%D0%9C%D0%9A%D0%9Fc.pdf',
    'МКПс — монтажная серия.',
  ],
  [
    /^Транскаб-/u,
    'series_evidence',
    'https://cabletech.ru/upload/files/5.pdf',
    'Серия для подвижного состава.',
  ],
  [
    /^КОПС/u,
    'series_evidence',
    segmentCatalog,
    'КОПСЭ — огнестойкая серия для систем безопасности.',
  ],
  [
    /^К9РВСБПМ/u,
    'series_evidence',
    'https://www.mkm.ru/helpful-information/kabel-k9rvsbpmng-a-hf/',
    'К9РВСБПМ — силовой кабель.',
  ],
  [
    /^КПБП/u,
    'series_evidence',
    'https://podolskkabel.ru/catalog/kabeli-kontrolnye/kpbpng-a-frhf/',
    'Подтверждены конкретные исполнения КПБП.',
  ],
  [
    /^КПМ/u,
    'series_evidence',
    'https://www.ufimcabel.ru/documents/kpm.pdf',
    'КПМ/КПМС — монтажные кабели.',
  ],
  [
    /^ЭКС-ШВППЭ/u,
    'series_evidence',
    'https://ecmin.ru/wp-content/uploads/2024/05/deklaracziya-tr-eaes-037-2016-%E2%84%96-by-112-11.01-tr-037.01-02455.pdf',
    'Кабель для структурированных систем связи.',
  ],
  [
    /^КИП[эЭвВ]/u,
    'series_evidence',
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf',
    'Интерфейсная серия КИПэ.',
  ],
  [
    /^MEDIAstrip/u,
    'series_evidence',
    'https://www.uglichcable.ru/catalog/cables-mediastrip/',
    'MEDIAstrip H/BH — силовые кабели.',
  ],
  [
    /^АсКГ/u,
    'series_evidence',
    'https://www.bgkz.ru/elkaflex',
    'АсКГ — гибкий кабель.',
  ],
  [
    /^ПТГВэВ/u,
    'series_evidence',
    'https://uralcable.ru/upload/iblock/63e/uoilefxnyppnt65d3j4qwfdp76yx6xu7/18_KHKA_Termoelektrodnye_kabeli_i_provoda.pdf',
    'Термоэлектродное изделие.',
  ],
  [
    /^ТЕРК-Г/u,
    'series_evidence',
    'https://kazkabel.kz/catalog-ru/prod-kabelli-terk-ru',
    'Термоэлектродный кабель.',
  ],
  [
    /^ПТГВ-ХК/u,
    'series_evidence',
    'https://terkab.ru/ct/ct/4',
    'Термоэлектродный провод.',
  ],
  [
    /^H0[57]z1-/iu,
    'series_evidence',
    'https://www.prysmian.com/sites/default/files/atoms/files/Draka_Elevator_EMEA_Catalog_2020_web_FINAL_2019_1015.pdf',
    'Одножильный импортный провод.',
  ],
  [
    /^H05z-K/iu,
    'series_evidence',
    'https://www.helukabel.com/publication/DE/CATALOGUES/CW/Auswahltabellen_EN/Kap_K_284-323_en_link.pdf',
    'Одножильный импортный провод.',
  ],
  [
    /^BETA THERM/iu,
    'series_evidence',
    'https://studercables.com/wp-content/uploads/2025/03/Flyer-Cable-solutions-for-inverters-0000912-V01.pdf',
    'Одножильный импортный провод.',
  ],
  [
    /^JAMAK/iu,
    'series_evidence',
    'https://www.draka-cable.com/wp-content/uploads/2020/03/p2_MMS_Special_web2016.pdf',
    'Инструментальный кабель передачи данных.',
  ],
  [
    /^КВПВП-5е/u,
    'series_evidence',
    'https://spetskabel.ru/products/6/266/',
    'Кабель СКС.',
  ],
  [
    /^Сегмент-КИ485/u,
    'series_evidence',
    segmentCatalog,
    'Интерфейсный кабель RS-485.',
  ],
  [
    /^НИКИ-КУПсКШ/u,
    'series_evidence',
    'https://www.holdcable.com/products/niki_kupskshef_vng_a_frhf_khl_s_i/',
    'Контрольный кабель.',
  ],
  [
    /^НИКИ-КУП/u,
    'series_evidence',
    'https://www.holdcable.com/products/niki_kupsshem_vng_a_khl_s/',
    'Контрольный кабель.',
  ],
  [
    /^ВСЭК/u,
    'series_evidence',
    'https://www.ufimcabel.ru/produktsiya/31-provoda-polevoj-svyazi/70-vsek-sek',
    'Провод полевой связи.',
  ],
  [
    /^ШТЛ/u,
    'series_evidence',
    'https://www.ufimcabel.ru/produktsiya/21-shnury-svyazi/39-shts-shtsm-shtl-shtls',
    'Телефонный шнур.',
  ],
  [
    /^ТРВ/u,
    'series_evidence',
    'https://ufimcabel.ru/produktsiya/32-provoda-telefonnye-raspredelitelnye-odnoparnye/71-trp-trv',
    'Телефонный провод.',
  ],
  [
    /^ОМЗКГЦ/u,
    'series_evidence',
    'https://mk-f.ru/info/sootv/',
    'Оптический кабель связи.',
  ],
  [
    /^НРГ/u,
    'series_evidence',
    'https://www.holdcable.com/products/nrg/',
    'Силовой кабель.',
  ],
  [
    /^ПРГН/u,
    'series_evidence',
    'https://www.holdcable.com/products/prgn/',
    'Провод.',
  ],
  [
    /^ПМПЭВ/u,
    'series_evidence',
    'https://www.ufimcabel.ru/produktsiya/38-kabeli-provoda-i-shnury-montazhnye/102-pmpev',
    'Микрофонный провод.',
  ],
  [
    /^ПТФФГ/u,
    'series_evidence',
    'https://sentek.ru/upload/storage/sentek-catalogue.pdf',
    'Термоэлектродный провод.',
  ],
];
const verification = moves.map((move) => {
  if (move.to.category === 'signalno-blokirovochnye') {
    return {
      ...move,
      auditStatus: 'series_evidence',
      auditReason:
        'Сигнально-блокировочное семейство подтверждено каталогами производителей; решение распространено на маркоразмеры.',
      sourceUrl: signalEvidence,
      verificationBasis:
        'серия или марка, не отдельная проверка каждого маркоразмера',
    };
  }
  const found = evidenceRules.find(([pattern]) => pattern.test(move.name));
  if (!found) {
    throw new Error(`Нет аудиторского решения: ${move.cell} ${move.name}`);
  }
  const [, auditStatus, sourceUrl, auditReason] = found;
  return {
    ...move,
    auditStatus,
    auditReason,
    sourceUrl,
    verificationBasis:
      auditStatus === 'series_evidence'
        ? 'серия или марка, не отдельная проверка каждого маркоразмера'
        : 'требуется дополнительная проверка',
  };
});
const counts = {};
for (const item of verification) {
  counts[item.auditStatus] = (counts[item.auditStatus] || 0) + 1;
}

const conflicts = products.flatMap((product) => {
  const sourceCandidate = getSourceCategoryCandidate(product.sourceCategory);
  if (
    !sourceCandidate ||
    (sourceCandidate.sectionSlug === product.catalogSectionSlug &&
      sourceCandidate.categorySlug === product.catalogCategorySlug &&
      (!sourceCandidate.subcategorySlug ||
        sourceCandidate.subcategorySlug ===
          (product.catalogSubcategorySlug || '')))
  ) {
    return [];
  }
  return [
    {
      sourceRowIndex: product.sourceRowIndex,
      name: product.name,
      sourceCategory: product.sourceCategory || '',
      sourceCandidate,
      chosen: {
        sectionSlug: product.catalogSectionSlug || '',
        categorySlug: product.catalogCategorySlug || '',
        subcategorySlug: product.catalogSubcategorySlug || '',
      },
      classificationSource: product.catalogClassificationSource || '',
      classificationMatch: product.catalogClassificationMatch || '',
    },
  ];
});
const pairs = new Map();
for (const move of moves) {
  const pair = `${move.from.category} → ${move.to.category}`;
  pairs.set(pair, (pairs.get(pair) || 0) + 1);
}
const summary = {
  ...oldSummary,
  productsBefore: previous.length,
  productsAfter: products.length,
  excluded: imported.excludedNonCable,
  review: review.length,
  moved: moves.length,
  publishGuardCategoryChangedPercent: Number(
    ((moves.length / previous.length) * 100).toFixed(2)
  ),
  fallbackOther: products.filter(
    (product) =>
      product.catalogClassificationSource === 'fallback' &&
      product.catalogCategorySlug === 'prochee'
  ).length,
  pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]),
  sourceCategoryConflicts: conflicts.length,
};
writeJson(path.join(reportDir, 'moves-current.json'), moves);
writeJson(path.join(reportDir, 'review-current.json'), review);
writeJson(path.join(reportDir, 'source-conflicts-current.json'), conflicts);
writeJson(path.join(reportDir, 'summary-current.json'), summary);
writeJson(path.join(reportDir, 'verification-current.json'), {
  sourceSha256: summary.sourceSha256,
  method:
    'Проверка первичного источника для серии/марки; это не независимая проверка каждого маркоразмера',
  counts,
  moves: verification,
  unresolvedImportReview: review,
});
console.log({
  products: products.length,
  moved: moves.length,
  review: review.length,
  conflicts: conflicts.length,
  statuses: counts,
});
