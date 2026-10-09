// Файл покрывает серверную сборку каталога, нормализацию данных и стабильность выходной структуры.

import { describe, expect, it } from 'vitest';
import { createCatalogStore } from './catalog.js';

const PRODUCTS_FILE = 'products.json';
const PRICE_OVERRIDES_FILE = 'priceOverrides.json';
const CATALOG_OVERRIDES_FILE = 'catalogOverrides.json';

function createMemoryFs(initialFiles) {
  const files = new Map(Object.entries(initialFiles));
  let nextIno = 1;

  function normalizeFile(file) {
    const body = String(file.body ?? '');
    return {
      body,
      mtimeMs: file.mtimeMs ?? 1,
      ctimeMs: file.ctimeMs ?? file.mtimeMs ?? 1,
      size: file.size ?? Buffer.byteLength(body),
      ino: file.ino ?? nextIno++,
    };
  }

  for (const [filePath, file] of files) {
    files.set(filePath, normalizeFile(file));
  }

  return {
    setFile(filePath, body, mtimeMs, extraStat = {}) {
      files.set(filePath, normalizeFile({ body, mtimeMs, ...extraStat }));
    },
    async stat(filePath) {
      const file = files.get(filePath);
      if (!file) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return {
        mtimeMs: file.mtimeMs,
        ctimeMs: file.ctimeMs,
        size: file.size,
        ino: file.ino,
      };
    },
    async readFile(filePath) {
      const file = files.get(filePath);
      if (!file) {
        const error = new Error(`ENOENT: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return file.body;
    },
  };
}

function createProduct(overrides = {}) {
  return {
    id: 1,
    slug: 'alpha-cable',
    sku: 'SKU-1',
    fullName: 'Alpha Cable',
    name: 'Alpha Cable',
    mark: 'ALPHA',
    category: 'Power',
    unit: 'm',
    stock: 10,
    price: 100,
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    catalogCategory: 'Power cable',
    catalogCategorySlug: 'power-cable',
    ...overrides,
  };
}

function createStoreFixture({
  products = [createProduct()],
  image = '/alpha-a.svg',
  catalogOverrides = {},
  priceMatchers = [],
} = {}) {
  const fs = createMemoryFs({
    [PRODUCTS_FILE]: { body: JSON.stringify(products), mtimeMs: 1 },
    [PRICE_OVERRIDES_FILE]: {
      body: JSON.stringify({
        matchers: priceMatchers,
        overrides: {
          'Alpha Cable': { image },
        },
      }),
      mtimeMs: 1,
    },
    [CATALOG_OVERRIDES_FILE]: {
      body: JSON.stringify(catalogOverrides),
      mtimeMs: 1,
    },
  });
  const store = createCatalogStore({
    fs,
    productsFile: PRODUCTS_FILE,
    overridesFile: PRICE_OVERRIDES_FILE,
    catalogOverridesFile: CATALOG_OVERRIDES_FILE,
  });

  return { fs, store };
}

describe('createCatalogStore', () => {
  it('keeps image overrides isolated between store instances', async () => {
    const first = createStoreFixture({ image: '/alpha-a.svg' });
    const second = createStoreFixture({ image: '/alpha-b.svg' });

    expect((await first.store.loadCatalogProducts())[0].image).toBe(
      '/alpha-a.svg'
    );
    expect((await second.store.loadCatalogProducts())[0].image).toBe(
      '/alpha-b.svg'
    );
    expect(first.store.getCatalogProductListItems()[0].image).toBe(
      '/alpha-a.svg'
    );
  });

  it('reloads products when image override mtime changes', async () => {
    const { fs, store } = createStoreFixture({ image: '/alpha-a.svg' });

    expect((await store.loadCatalogProducts())[0].image).toBe('/alpha-a.svg');

    fs.setFile(
      PRICE_OVERRIDES_FILE,
      JSON.stringify({
        overrides: {
          'Alpha Cable': { image: '/alpha-next.svg' },
        },
      }),
      2
    );

    expect((await store.loadCatalogProducts())[0].image).toBe(
      '/alpha-next.svg'
    );
  });

  it('applies catalog overrides and scoped category indexes', async () => {
    const hiddenProduct = createProduct({
      id: 2,
      slug: 'hidden-cable',
      sku: 'SKU-HIDDEN',
      fullName: 'Hidden Cable',
      name: 'Hidden Cable',
      catalogCategorySlug: 'hidden-cable',
    });
    const { store } = createStoreFixture({
      products: [createProduct(), hiddenProduct],
      catalogOverrides: {
        hide: [{ sku: 'SKU-HIDDEN' }],
        promote: [{ sku: 'SKU-1' }],
      },
    });

    const items = await store.loadCatalogProducts();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sku: 'SKU-1', promoted: true });
    expect(store.getCatalogProductsByCategory('power-cable')).toEqual(items);
    expect(store.getCatalogProductListItemsByCategory('power-cable')).toEqual([
      expect.objectContaining({ sku: 'SKU-1', image: '/alpha-a.svg' }),
    ]);
  });

  it('reloads category index when products.json is replaced with same mtime', async () => {
    const { fs, store } = createStoreFixture();

    expect(await store.loadCatalogProductsByCategory('power-cable')).toEqual([
      expect.objectContaining({ sku: 'SKU-1' }),
    ]);

    fs.setFile(
      PRODUCTS_FILE,
      JSON.stringify([
        createProduct({
          id: 2,
          slug: 'beta-control',
          sku: 'SKU-2',
          fullName: 'Beta Control',
          name: 'Beta Control',
          mark: 'BETA',
          catalogCategory: 'Control cable',
          catalogCategorySlug: 'control-cable',
        }),
      ]),
      1,
      { ctimeMs: 2 }
    );

    expect(await store.loadCatalogProductsByCategory('power-cable')).toEqual(
      []
    );
    expect(await store.loadCatalogProductsByCategory('control-cable')).toEqual([
      expect.objectContaining({ sku: 'SKU-2' }),
    ]);
    expect(store.getCatalogProductListItemsByCategory('control-cable')).toEqual(
      [expect.objectContaining({ sku: 'SKU-2' })]
    );
  });

  it('reset clears loaded state for tests', async () => {
    const { store } = createStoreFixture();

    await store.loadCatalogProducts();
    expect(store.getCatalogProductListItems()).toHaveLength(1);

    store.reset();

    expect(store.getCatalogProductListItems()).toEqual([]);
  });

  it('preserves grouped conductor configuration in product cards', async () => {
    const { store } = createStoreFixture({
      products: [
        createProduct({
          fullName: 'РУТЕКзнг(А)LSxh(KH)14х(2х1)э ВВБ-80',
          name: 'РУТЕКзнг(А)LSxh(KH)14х(2х1)э ВВБ-80',
          mark: 'РУТЕКз',
          cores: 14,
          groupCores: 2,
          crossSection: 1,
          conductorConfiguration: '14х(2х1)',
          attributes: ['нг(А)', 'LSxh(KH)', 'Э', 'ВВБ-80'],
        }),
      ],
    });

    const [product] = await store.loadCatalogProducts();
    const [listProduct] = store.getCatalogProductListItems();

    expect(product.specs).toMatchObject({
      'Конфигурация жил': '14х(2х1)',
      Особенности: 'нг(А), LSxh(KH), Э, ВВБ-80',
    });
    expect(product.shortDescription).toContain('14х(2х1)');
    expect(product.shortDescription).not.toContain('мм2');
    expect(listProduct.conductorConfiguration).toBe('14х(2х1)');
    expect(listProduct.groupCores).toBe(2);
    expect(listProduct.attributes).toEqual(product.attributes);
  });

  it.each([
    '2х2х0,52',
    '1,8х4,0/1,92',
    '3х2,5+1х1,5',
    '2х(2х0,5)+1х(2х1)',
    '4х24 AWG',
    '3х2,5+',
  ])(
    'preserves configuration %s without inventing units',
    async (configuration) => {
      const fullName = `Кабель ${configuration} нг(А)-LS`;
      const { store } = createStoreFixture({
        products: [
          createProduct({
            fullName,
            conductorConfiguration: configuration,
            cores: 3,
            crossSection: 2.5,
            groundCores: 1,
            groundSection: 1.5,
            attributes: ['нг(А)-LS'],
            sourceName: `Исходное ${fullName}`,
            parsingWarnings: ['incomplete-specification'],
          }),
        ],
      });
      const [product] = await store.loadCatalogProducts();
      expect(product.fullName).toBe(fullName);
      expect(product.sourceName).toBe(`Исходное ${fullName}`);
      expect(product.parsingWarnings).toEqual(['incomplete-specification']);
      expect(product.specs['Конфигурация жил']).toBe(configuration);
      expect(product.shortDescription).toBe(
        `ALPHA · ${configuration} · нг(А)-LS`
      );
      expect(product.description).toContain(configuration);
      expect(product.description).not.toContain('incomplete-specification');
      expect(product.specs).not.toHaveProperty('Доп. жила');
      expect(product.specs).not.toHaveProperty('Количество жил');
    }
  );

  it('includes additional conductor sections in legacy descriptions and list data', async () => {
    const { store } = createStoreFixture({
      products: [
        createProduct({
          cores: 3,
          crossSection: 2.5,
          groundCores: 1,
          groundSection: 1.5,
          voltage: 0.66,
        }),
      ],
    });
    const [product] = await store.loadCatalogProducts();
    expect(product.shortDescription).toContain('3х2,5+1х1,5 мм2');
    expect(product.description).toContain('3х2,5+1х1,5 мм2');
    expect(product.description).toContain('0,66 кВ');
    expect(store.getCatalogProductListItems()[0]).toMatchObject({
      groundCores: 1,
      groundSection: 1.5,
      voltage: 0.66,
    });
  });

  it('restricts image and catalog overrides to matching attributes and configuration', async () => {
    const matcher = {
      mark: 'ВВГ',
      attributes: ['нг(А)-LS'],
      conductorConfiguration: '3х2,5+1х1,5',
      groundSection: 1.5,
    };
    const target = createProduct({
      id: 1,
      name: 'target',
      fullName: 'target',
      mark: 'ВВГ',
      attributes: ['нг(А)-LS'],
      conductorConfiguration: '3х2,5+1х1,5',
      groundSection: 1.5,
    });
    const products = [
      target,
      { ...target, id: 2, attributes: [] },
      { ...target, id: 3, conductorConfiguration: '3х2,5' },
      { ...target, id: 4, groundSection: 2.5 },
    ];
    const { store } = createStoreFixture({
      products,
      priceMatchers: [{ ...matcher, image: '/specific.svg' }],
    });
    const items = await store.loadCatalogProducts();
    expect(
      items.filter((p) => p.image === '/specific.svg').map((p) => p.id)
    ).toEqual([1]);
    const hidden = createStoreFixture({
      products,
      catalogOverrides: { hide: [matcher] },
    });
    expect((await hidden.store.loadCatalogProducts()).map((p) => p.id)).toEqual(
      [2, 3, 4]
    );
  });
});
