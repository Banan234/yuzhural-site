import { describe, expect, it } from 'vitest';
import {
  expandProductOffers,
  getProductPurchaseItem,
  groupProductOffers,
} from './productOffers.js';
import { buildProductJsonLd } from '../src/lib/productSeo.js';
import {
  applyCatalogFiltersAndSortCore,
  buildCatalogFacetsCore,
} from './catalogQueryCore.js';

const cable = (id, extra = {}) => ({
  id,
  slug: `cable-${id}`,
  sku: `SKU-${id}`,
  title: 'ВВГнг(А)-LS 3х2.5',
  mark: 'ВВГнг(А)-LS',
  cores: 3,
  crossSection: 2.5,
  unit: 'м',
  stock: id * 10,
  price: 100,
  ...extra,
});

describe('automatic product offers', () => {
  it('groups any number of source offers, retaining each balance and price', () => {
    const source = [
      cable(1, { price: 150 }),
      cable(2, { price: 120 }),
      cable(3),
    ];
    const [group] = groupProductOffers(source);
    expect(group).toMatchObject({
      id: 1,
      slug: 'cable-1',
      price: 100,
      stock: 60,
      priceVaries: true,
    });
    expect(
      group.offers.map(({ id, price, stock }) => ({ id, price, stock }))
    ).toEqual([
      { id: 3, price: 100, stock: 30 },
      { id: 2, price: 120, stock: 20 },
      { id: 1, price: 150, stock: 10 },
    ]);
    expect(source[0]).not.toHaveProperty('offers');
    expect(groupProductOffers([...source].reverse())[0]).toEqual(group);
    expect(groupProductOffers([group])[0]).toEqual(group);
  });

  it('keeps equal-price balances as individual rows', () => {
    const [group] = groupProductOffers([cable(1), cable(2)]);
    expect(group).toMatchObject({ price: 100, stock: 30, priceVaries: false });
    expect(group.offers).toHaveLength(2);
  });

  it.each([
    { title: 'ВВГнг(А)-LS 3х4', crossSection: 4 },
    { manufacturer: 'Другой завод' },
    { catalogBrand: 'Другой бренд' },
    { voltage: 1 },
    { unit: 'кг' },
    { title: 'ВВГнг(А)-LS 3х2.5 чёрный' },
    { screenCrossSection: 1 },
    { conductorConfiguration: '3х24 AWG' },
    { dataStatus: 'pending' },
  ])('does not merge a distinct or unconfirmed execution: %j', (different) => {
    expect(groupProductOffers([cable(1), cable(2, different)])).toHaveLength(2);
  });

  it('recognizes existing normalized color aliases and case differences', () => {
    expect(
      groupProductOffers([
        cable(1, {
          title: 'ПУГВ 1х4 бел.',
          mark: 'ПУГВ',
          cores: 1,
          crossSection: 4,
        }),
        cable(2, {
          title: 'ПУГВ 1х4 белый',
          mark: 'ПУГВ',
          cores: 1,
          crossSection: 4,
        }),
      ])
    ).toHaveLength(1);
  });

  it('uses a source identity and its exact limit for purchase and lookup', () => {
    const [group] = groupProductOffers([cable(1), cable(2, { price: 150 })]);
    expect(getProductPurchaseItem(group, 2)).toMatchObject({
      id: 2,
      slug: 'cable-2',
      sku: 'SKU-2',
      stock: 20,
      price: 150,
    });
    expect(getProductPurchaseItem(group, 2)).not.toHaveProperty('offers');
    expect(
      expandProductOffers([group]).map((p) => [p.id, p.price, p.stock])
    ).toEqual([
      [1, 100, 10],
      [2, 150, 20],
    ]);
  });

  it('reports the price range and each individual offer in product metadata', () => {
    const [group] = groupProductOffers([cable(1), cable(2, { price: 150 })]);
    expect(buildProductJsonLd(group).offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: '100.00',
      highPrice: '150.00',
      offerCount: 2,
      offers: [
        { sku: 'SKU-1', price: '100.00' },
        { sku: 'SKU-2', price: '150.00' },
      ],
    });
  });

  it('matches a price filter when an individual offer is within both bounds', () => {
    const products = groupProductOffers([cable(1), cable(2, { price: 150 })]);
    expect(
      applyCatalogFiltersAndSortCore(products, { priceMin: 140, priceMax: 160 })
    ).toHaveLength(1);
    expect(
      applyCatalogFiltersAndSortCore(products, { priceMin: 110, priceMax: 140 })
    ).toHaveLength(0);
    expect(buildCatalogFacetsCore(products)).toMatchObject({
      minPrice: 100,
      maxPrice: 150,
    });
  });
});
