import { describe, expect, it } from 'vitest';
import { getFeaturedProducts } from './featuredProducts.js';

describe('homepage product selection', () => {
  it('shows 15 unique products by default', () => {
    const products = Array.from({ length: 20 }, (_, id) => ({
      id,
      name: `Кабель ${id}`,
      stock: 1000,
      price: 100,
    }));
    const selected = getFeaturedProducts([...products, ...products]);
    expect(selected).toHaveLength(15);
    expect(new Set(selected.map((item) => item.id)).size).toBe(15);
  });
  it('prefers typical variants over a large stock of specialized wire', () => {
    const products = [
      { id: 1, name: 'БПВЛМЭ 1х0.35', stock: 40000, price: 15 },
      { id: 2, name: 'ВВГнг(A)-LS 3×2,5', stock: 800, price: 120 },
      { id: 3, name: 'ПВС 3х2.5 бел', stock: 700, price: 100 },
    ];
    expect(getFeaturedProducts(products, 2).map((item) => item.id)).toEqual([
      2, 3,
    ]);
  });

  it('skips tiny remnants and additional-core versions in preferred slots', () => {
    const products = [
      { id: 1, name: 'ПВС 3х1.5+1х1.5', stock: 5000, price: 75 },
      { id: 2, name: 'ПВС 3х1.5', stock: 22, price: 61 },
      { id: 3, name: 'ПВС 4х2.5', stock: 600, price: 115 },
    ];
    expect(getFeaturedProducts(products, 1)[0].id).toBe(3);
  });

  it('returns unique available products with a price and respects promotion', () => {
    const ordinary = {
      id: 1,
      name: 'ВВГнг(А)-LS 3х2.5',
      stock: 500,
      price: 120,
    };
    const products = [
      ordinary,
      ordinary,
      { id: 2, name: 'ПВС 3х2.5', stock: 0, price: 100 },
      { id: 3, name: 'ПВС 4х2.5', stock: 1000, price: 0 },
      { id: 4, name: 'Другой кабель', stock: 200, price: 150, promoted: true },
    ];
    expect(getFeaturedProducts(products).map((item) => item.id)).toEqual([
      4, 1,
    ]);
  });
});
