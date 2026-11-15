import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import enrichment from '../data/catalogEnrichment.json' with { type: 'json' };
import { createCatalogStore, loadCatalogProducts } from './catalog.js';
import { prepareProductDetail } from './productPresentation.js';
import {
  enrichProductDetail,
  getEnrichmentDecision,
} from './catalogEnrichment.js';
import { buildProductDesignation } from '../shared/productDesignation.js';
import { createProductRecord } from '../scripts/lib/priceCatalogPreparation.js';
import { classifyProduct } from '../scripts/lib/catalogClassifier.js';
import { assignStableIdentity } from '../scripts/lib/productRegistry.js';
import { enrichPriceDesignations } from '../shared/productDesignationBatch.js';
import { prerenderProducts } from '../scripts/prerender.js';

const json = async (name) =>
  JSON.parse(await fs.readFile(new URL(name, import.meta.url)));
const tempStore = (file) =>
  createCatalogStore({
    productsFile: file,
    adminDataDir: path.dirname(file),
    overridesFile: path.join(path.dirname(file), 'no-overrides.json'),
    catalogOverridesFile: path.join(
      path.dirname(file),
      'no-catalog-overrides.json'
    ),
  });

const factsFor = (record) =>
  (record.facts || enrichment.factProfiles[record.factProfileRef].facts).filter(
    (fact) =>
      fact.status === 'CONFIRMED' &&
      ['A', 'B'].includes(fact.reliability?.category) &&
      (!fact.sections || fact.sections.includes(record.identity.crossSection))
  );

describe('verified catalog enrichment', () => {
  it('preserves list data and separates common specifications from exact SKU facts', async () => {
    const list = await loadCatalogProducts();
    const original = structuredClone(list);
    const changed = [];
    const pilotBySku = new Map(
      enrichment.records.map((record) => [record.sku, record])
    );
    for (const p of list) {
      const record = pilotBySku.get(p.sku);
      const contentAssignment = enrichment.contentAssignments?.[p.sku];
      const decoded = record || contentAssignment?.preserveDecodedSpecs
        ? buildProductDesignation(p)
        : p.designationDecoded;
      const after = enrichProductDetail(p, decoded);
      if (contentAssignment) {
        expect(after.catalogContent?.construction).toBeTruthy();
        expect(after.catalogContent?.application).toBeTruthy();
        expect(after.catalogContent?.selection).toBeTruthy();
        expect(
          enrichProductDetail(
            { ...p, sourceName: p.sourceName + ' X' },
            decoded
          ).catalogContent
        ).toBeUndefined();
      }
      if (!record) {
        const { catalogContent, designationDecoded, specs, ...unchanged } =
          after;
        const {
          designationDecoded: originalDecoded,
          specs: originalSpecs,
          ...originalFields
        } = p;
        if (contentAssignment?.mixedThermocouplePair) {
          const { displayDimensions, ...otherFields } = unchanged;
          const {
            displayDimensions: originalDimensions,
            ...otherOriginalFields
          } = originalFields;
          expect(otherFields).toEqual(otherOriginalFields);
          expect(originalDimensions).toBeUndefined();
          expect(displayDimensions).toEqual({ kind: 'mixed-section' });
          const remainingSpecs = { ...originalSpecs };
          delete remainingSpecs['Сечение жилы'];
          delete remainingSpecs['Доп. жила'];
          const sections = [p.crossSection, p.groundSection].map((value) =>
            value.toLocaleString('ru-RU')
          );
          expect(specs).toEqual({
            ...remainingSpecs,
            'Количество жил': '2',
            'Сечения жил': `${sections.join(' и ')} мм²`,
          });
        } else {
          expect(unchanged).toEqual(originalFields);
          expect(specs).toMatchObject(originalSpecs);
        }
        expect(specs['Класс гибкости']).toBe(originalSpecs['Класс гибкости']);
        continue;
      }
      changed.push(p.sku);
      expect(after.description).toBe(
        enrichment.descriptions[record.descriptionRef].text
      );
      expect(decoded.tokens).toEqual(record.markingReview.tokens);
      if (record.descriptionRef === 'vvgng-a-ls') {
        if (record.notPublished)
          expect(record.facts.length + record.notPublished.length + 4).toBe(19);
        expect(after.specs['Особенности']).toBe('нг(А)-LS');
        expect(after.specs['Материал жилы']).toBe('Медь');
      }
      expect(Object.keys(after.specs)).toHaveLength(
        Object.keys(p.specs).length + factsFor(record).length
      );
      const screen = factsFor(record).find(
        ({ label }) => label === 'Экранированный'
      );
      expect(after.specs['Экранированный']).toBe(screen?.value);
      if (record.factProfileRef === 'vbshvng-a-ls')
        expect(after.specs['Тип брони']).toBe('Стальные ленты');
      expect(enrichProductDetail(after, decoded)).toEqual(after);
      const {
        description,
        specs,
        designationDecoded,
        catalogContent,
        ...rest
      } = after;
      const {
        description: oldDescription,
        specs: oldSpecs,
        designationDecoded: oldDesignationDecoded,
        ...oldRest
      } = p;
      if (
        !record.markingReview.detailCorrections &&
        designationDecoded !== oldDesignationDecoded
      )
        expect(designationDecoded.tokens).toEqual(
          oldDesignationDecoded.tokens.filter((token) =>
            designationDecoded.tokens.some(
              (published) =>
                published.code === token.code && published.text === token.text
            )
          )
        );
      expect(rest).toEqual(oldRest);
      for (const label of [
        'Температура эксплуатации',
        'Минимальный радиус изгиба',
        'Наружный диаметр',
        'Масса кабеля',
        'ГОСТ',
        'ТУ',
      ])
        expect(specs).not.toHaveProperty(label);
    }
    expect(changed.length - 144).toBeGreaterThanOrEqual(300);
    expect(changed.length - 144).toBeLessThanOrEqual(500);
    expect(changed.sort()).toEqual(enrichment.records.map((r) => r.sku).sort());
    expect(list).toEqual(original);
  }, 30000);

  it('keeps copper VVG out of aluminium editorial profiles', async () => {
    const products = await loadCatalogProducts();
    for (const sku of ['YU-0000896', 'YU-0000825', 'YU-0000826']) {
      const product = products.find((item) => item.sku === sku);
      const decoded = buildProductDesignation(product);
      const detail = prepareProductDetail(product);
      expect(detail.catalogContent.selection).not.toMatch(/алюмини/i);
      const entry = enrichment.contentAssignments[sku];
      const swapped = {
        ...enrichment,
        contentAssignments: { [sku]: { ...entry, profile: '0001' } },
      };
      expect(
        enrichProductDetail(product, decoded, swapped).catalogContent
      ).toBeUndefined();
    }
  }, 30000);

  it('keeps audited series distinct and leaves raw marks intact', async () => {
    const products = await loadCatalogProducts();
    for (const [family, mark, pattern] of [
      ['family-0537', 'ЛОУТОКС 20', /керамообразующей/],
      ['family-0651', 'АС', /стальной сердечник/i],
      ['family-0652', 'ПАВ', /алюминиевая жила/i],
      ['family-0146', null, /термопластичного эластомера/],
      ['family-0098', null, /стальных лент/],
    ]) {
      const product = products.find(
        (item) => enrichment.contentAssignments[item.sku]?.family === family
      );
      const detail = prepareProductDetail(product);
      expect(detail.mark).toBe(product.mark);
      if (mark) expect(detail.catalogContent.familyMark).toBe(mark);
      expect(detail.catalogContent.construction).toMatch(pattern);
    }
  }, 30000);

  it('renders the preserved editorial description and scopes selection advice', async () => {
    const products = new Map(
      (await loadCatalogProducts()).map((item) => [item.sku, item])
    );
    const copper = prepareProductDetail(products.get('YU-0000896'));
    const preserved = prepareProductDetail(
      products.get(enrichment.records[0].sku)
    );
    expect(preserved.catalogContent.text).toBeUndefined();
    expect(preserved.description).toBe(
      enrichment.descriptions[enrichment.records[0].descriptionRef].text
    );
    expect(/плоск/i.test(copper.catalogContent.selection)).toBe(
      products.get('YU-0000896').attributes.includes('плоский')
    );
    const armored = prepareProductDetail(products.get('YU-0001568'));
    expect(armored.catalogContent.selection).toMatch(/проволочную броню/i);
    expect(armored.catalogContent.selection).not.toMatch(/экран/i);
    for (const [sku, pattern] of [
      ['YU-0001696', /проволочной брони/],
      ['YU-0001786', /общий экран/],
    ]) {
      expect(
        prepareProductDetail(products.get(sku)).catalogContent.selection
      ).toMatch(pattern);
    }
    const frhf = Object.entries(enrichment.contentAssignments).find(
      ([, a]) => a.profile === 'kppg-frhf'
    );
    expect(
      prepareProductDetail(products.get(frhf[0])).catalogContent.selection
    ).toMatch(/FRHF.*линии в сборе/);
  }, 30000);

  it('suppresses duplicate fire tokens without changing the parsed configuration', () => {
    const decoded = {
      tokens: [
        { code: 'нг(А)-LS-LTx', text: 'Полный пожарный индекс' },
        { code: 'НГ(A)LS', text: 'Сокращённый дубль' },
        { code: '4х1', text: 'Четыре жилы' },
      ],
    };
    const product = { sku: 'TEST-SKU' };
    const detail = enrichProductDetail(product, decoded);
    expect(detail.designationDecoded.tokens).toEqual([
      decoded.tokens[0],
      decoded.tokens[2],
    ]);
    expect(decoded.tokens).toHaveLength(3);
  });

  it('keeps manufacturer-dependent values and conflicts out of detail cards', async () => {
    const products = new Map(
      (await loadCatalogProducts()).map((product) => [product.sku, product])
    );
    let withheld = 0;
    for (const record of enrichment.records) {
      const facts =
        record.facts || enrichment.factProfiles[record.factProfileRef].facts;
      const product = products.get(record.sku);
      const detail = prepareProductDetail(product);
      expect(detail.voltage).toBe(product.voltage);
      for (const fact of facts) {
        if (!['C', 'D'].includes(fact.reliability.category)) continue;
        if (fact.sections && !fact.sections.includes(product.crossSection))
          continue;
        withheld += 1;
        expect(detail.specs[fact.label]).toBe(fact.reliability.replacement);
        const otherFacts = facts.filter((item) => item !== fact);
        const candidate = {
          ...enrichment,
          records: [
            {
              ...record,
              factProfileRef: undefined,
              facts: [{ ...fact, status: 'CONFIRMED' }, ...otherFacts],
            },
          ],
        };
        const decision = getEnrichmentDecision(
          product,
          buildProductDesignation(product),
          candidate
        );
        expect(decision.status).toBe('applicable');
        expect(decision.facts).not.toContainEqual(
          expect.objectContaining({ value: fact.value, label: fact.label })
        );
      }
      if (record.markingReview.detailCorrections) {
        expect(
          detail.designationDecoded.tokens.find((token) => token.code === 'Н')
            .text
        ).toBe('Резиновая оболочка, не распространяющая горение');
      }
    }
    expect(withheld).toBe(279);
  }, 30000);

  it('blocks stale identities and conflicts, preserves manual text and non-pilot variants', async () => {
    const p = (await loadCatalogProducts()).find(
      (p) => p.sku === enrichment.records[0].sku
    );
    for (const change of [
      { mark: 'АВВГнг(А)-LS' },
      { voltage: 1 },
      { crossSection: 4 },
      { cores: 2 },
      { manufacturer: 'Другой завод' },
      { attributes: ['плоский'] },
      { sourceName: 'АВВГ 1х2.5 нг' },
      { groundCores: 1 },
      { dataStatus: 'pending' },
    ]) {
      const variant = { ...p, ...change };
      expect(
        enrichProductDetail(variant, buildProductDesignation(variant))
      ).toBe(variant);
    }
    const conflict = { ...p, specs: { ...p.specs, 'Материал жилы': 'Медь' } };
    expect(
      getEnrichmentDecision(conflict, buildProductDesignation(conflict)).status
    ).toBe('conflict');
    expect(
      enrichProductDetail(conflict, buildProductDesignation(conflict))
    ).toBe(conflict);
    const changedEvidence = buildProductDesignation(p);
    changedEvidence.constructionEvidence = {
      ...changedEvidence.constructionEvidence,
      revision: 'future-review',
    };
    expect(enrichProductDetail(p, changedEvidence)).toBe(p);
    const wrongDescriptionRule = {
      ...enrichment,
      descriptions: {
        ...enrichment.descriptions,
        'avvg-base': enrichment.descriptions['vvgng-a-ls'],
      },
    };
    expect(
      enrichProductDetail(p, buildProductDesignation(p), wrongDescriptionRule)
        .description
    ).toBe(p.description);
    const manual = {
      ...p,
      description: 'Проверенное ручное описание поставки.',
    };
    expect(prepareProductDetail(manual).description).toBe(manual.description);
    const outside = (await loadCatalogProducts()).filter(
      (p) =>
        /ВВГ/u.test(p.mark) && !enrichment.records.some((r) => r.sku === p.sku)
    );
    expect(outside.length).toBeGreaterThan(20);
    for (const variant of outside) {
      const { catalogContent, designationDecoded, specs, ...result } =
        enrichProductDetail(variant, variant.designationDecoded);
      const {
        designationDecoded: originalDecoded,
        specs: originalSpecs,
        ...originalFields
      } = variant;
      expect(result).toEqual(originalFields);
      expect(specs).toMatchObject(originalSpecs);
      expect(specs['Напряжение']).toBe(originalSpecs['Напряжение']);
    }
  });

  it('blocks mismatched shared facts and leaves nearby executions out of scope', async () => {
    const list = await loadCatalogProducts();
    const record = enrichment.records.find(
      (r) => r.factProfileRef === 'kvvgng-a-ls'
    );
    const product = list.find((p) => p.sku === record.sku);
    const decoded = buildProductDesignation(product);
    const swapped = {
      ...enrichment,
      records: [{ ...record, factProfileRef: 'vbshvng-a-ls' }],
    };
    expect(getEnrichmentDecision(product, decoded, swapped).status).toBe(
      'needs-review'
    );
    expect(
      getEnrichmentDecision(product, { ...decoded, officialComplete: false })
        .status
    ).toBe('needs-review');
    const rollback = {
      ...enrichment,
      records: enrichment.records.filter((r) => r.sku !== product.sku),
      contentAssignments: Object.fromEntries(
        Object.entries(enrichment.contentAssignments).filter(
          ([sku]) => sku !== product.sku
        )
      ),
    };
    const rolledBack = enrichProductDetail(product, decoded, rollback);
    expect(rolledBack.catalogContent).toBeUndefined();
    expect(rolledBack.description).toBe(product.description);
    expect(rolledBack.specs['Материал жилы']).toBe('Медь');
    expect(rolledBack.specs['Класс гибкости']).toBe(
      product.specs['Класс гибкости']
    );
    const duplicate = {
      ...enrichment,
      records: [...enrichment.records, record],
    };
    const { catalogContent, ...withoutContent } = enrichProductDetail(
      product,
      decoded,
      duplicate
    );
    expect(withoutContent).toEqual(product);
    for (const attrs of [
      ['Э', 'нг(А)-LS'],
      ['плоский', 'нг(А)-LS'],
      ['нг(А)-FRLS'],
      ['нг(А)-LS-ХЛ'],
    ]) {
      const neighbor = { ...product, attributes: attrs };
      expect(
        enrichProductDetail(neighbor, buildProductDesignation(neighbor))
      ).toBe(neighbor);
    }
  });

  it('fills common АВБбШв properties without transferring size or a rating', async () => {
    const list = await loadCatalogProducts();
    const small = list.find((p) => p.sku === 'YU-0000108');
    const large = list.find((p) => p.sku === 'YU-0000109');
    const after = prepareProductDetail(small);
    expect(after.specs).toMatchObject(small.specs);
    for (const key of [
      'Материал жилы',
      'Материал изоляции',
      'Материал оболочки',
      'Назначение',
      'Бронированный',
      'Тип брони',
    ]) {
      expect(after.specs[key]).toBeTruthy();
      expect(after.specs[key]).toBe(prepareProductDetail(large).specs[key]);
    }
    expect(after.specs['Напряжение']).toBe(small.specs['Напряжение']);
    const conflict = {
      ...small,
      specs: { ...small.specs, 'Материал жилы': 'Медь' },
    };
    expect(prepareProductDetail(conflict).specs).toEqual(conflict.specs);
    const otherExecution = {
      ...small,
      sourceName: small.sourceName + ' нг',
      attributes: ['нг'],
    };
    expect(prepareProductDetail(otherExecution).specs).toEqual(small.specs);
  });

  it('rejects a sibling execution even when its construction rule is shared', async () => {
    const record = enrichment.records.find(
      (r) => r.factProfileRef === 'ppg-hf'
    );
    const product = (await loadCatalogProducts()).find(
      (p) => p.sku === record.sku
    );
    const decoded = buildProductDesignation(product);
    const wrongFacts = {
      ...enrichment,
      records: [{ ...record, factProfileRef: 'ppg-frhf' }],
    };
    expect(getEnrichmentDecision(product, decoded, wrongFacts).status).toBe(
      'needs-review'
    );
    const wrongDescription = {
      ...enrichment,
      records: [{ ...record, descriptionRef: 'ppg-frhf' }],
    };
    expect(
      enrichProductDetail(product, decoded, wrongDescription).description
    ).toBe(product.description);
  });

  it('keeps the audited layer and screen decisions confined to their SKUs', async () => {
    const list = await loadCatalogProducts();
    const rows = new Map(list.map((product) => [product.sku, product]));
    const audited = enrichment.records.filter((record) =>
      record.descriptionRef.endsWith('-single')
    );
    expect(audited).toHaveLength(14);
    for (const record of audited) {
      const product = rows.get(record.sku);
      const detail = prepareProductDetail(product);
      expect(product.cores).toBe(1);
      expect(detail.specs).not.toHaveProperty('Материал изоляции');
      expect(detail.specs['Материал оболочки']).toBe('Резина');
      expect(detail.description).toMatch(/могут быть совмещены|один слой/);
    }
    for (const id of ['kvbbshv-base', 'kvbbshv-nga']) {
      const records = enrichment.records.filter(
        (record) => record.factProfileRef === id
      );
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        const detail = prepareProductDetail(rows.get(record.sku));
        expect(detail.specs['Экранированный']).toBe(
          id === 'kvbbshv-base' ? undefined : 'Нет'
        );
        expect(detail.specs['Тип брони']).toBe('Стальные ленты');
        expect(detail.specs).not.toHaveProperty('Тип экрана');
      }
    }
    const frhf = enrichment.records.find(
      (record) => record.factProfileRef === 'ppg-frhf'
    );
    expect(
      prepareProductDetail(rows.get(frhf.sku)).specs['Материал изоляции']
    ).toMatch(/^Основной слой/);
  });

  it('recreates price records and identities twice on a safe fixture, refreshes a warm store and prerenders the same facts', async () => {
    const original = await json('../data/catalog-current/products.json');
    const registry = await json('../data/catalog-current/productRegistry.json');
    const pilot = original.filter((p) =>
      enrichment.records.some((r) => r.sku === p.sku)
    );
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'yuek-enrichment-')
    );
    try {
      const file = path.join(directory, 'products.json');
      await fs.writeFile(file, JSON.stringify(pilot));
      const store = tempStore(file);
      await store.loadCatalogProducts();
      for (let round = 1; round <= 2; round++) {
        const imported = pilot.map((p) => {
          const record = createProductRecord(
            {
              name: p.sourceName,
              unit: p.unit,
              price: p.price + round,
              stock: p.stock + round,
            },
            p.sourceCategory
          );
          expect(record.type).toBe('product');
          const classified = {
            ...record.value,
            ...classifyProduct(record.value),
          };
          const identity = assignStableIdentity(
            registry,
            classified,
            '2026-11-12T10:00:00Z'
          );
          expect(identity.sku).toBe(p.sku);
          return {
            ...classified,
            id: identity.id,
            slug: identity.slug,
            sku: identity.sku,
          };
        });
        const regenerated = enrichPriceDesignations(imported).products;
        expect(regenerated.every((p) => !p.description && !p.specs)).toBe(true);
        await fs.writeFile(file, JSON.stringify(regenerated));
        const warm = await store.loadCatalogProducts();
        const cold = await tempStore(file).loadCatalogProducts();
        expect(warm).toEqual(cold);
        expect(warm).toHaveLength(enrichment.records.length);
        for (const p of warm) {
          const detail = prepareProductDetail(p);
          const source = pilot.find((r) => r.sku === p.sku);
          expect(p.price).toBe(source.price + round);
          expect(p.stock).toBe(source.stock + round);
          expect(detail.description).toBe(
            enrichment.descriptions[
              enrichment.records.find((r) => r.sku === p.sku).descriptionRef
            ].text
          );
          const record = enrichment.records.find(
            (record) => record.sku === p.sku
          );
          for (const { label, value } of factsFor(record)) {
            const isLsMaterial =
              value === 'ПВХ-пластикат' &&
              ['Материал изоляции', 'Материал оболочки'].includes(label) &&
              p.attributes?.includes('нг(А)-LS') &&
              detail.specs[label] ===
                'ПВХ-пластикат пониженной пожарной опасности';
            expect(
              isLsMaterial ? value : detail.specs[label],
              `${p.sku}: ${label}`
            ).toBe(value);
          }
          const researched =
            record.facts ||
            enrichment.factProfiles[record.factProfileRef].facts;
          for (const fact of researched) {
            if (fact.status === 'CONFIRMED') continue;
            if (fact.sections && !fact.sections.includes(p.crossSection))
              continue;
            expect(detail.specs[fact.label], `${p.sku}: ${fact.label}`).toBe(
              fact.reliability.replacement
            );
          }
        }
        await prerenderProducts(
          '<html><head></head><body><div id="root"></div></body></html>',
          warm,
          { outputDir: directory, log: null }
        );
        for (const p of warm) {
          const html = await fs.readFile(
            path.join(directory, 'product', p.slug + '.html'),
            'utf8'
          );
          const payload = JSON.parse(
            html.match(
              /<script type="application\/json" id="yuzhural-prerender-data">([^]*?)<\/script>/
            )[1]
          ).product;
          expect(payload.description).toBe(prepareProductDetail(p).description);
          expect(payload.specs).toEqual(prepareProductDetail(p).specs);
          expect(html).toContain('Материал оболочки');
        }
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 60000);
});
