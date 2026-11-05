import { describe, expect, it } from 'vitest';
import { prepareProductDetail } from './productPresentation.js';
import {
  getProductImage,
  getProductImageAlt,
} from '../shared/productImages.js';
import { buildProductDesignation } from '../shared/productDesignation.js';
import {
  getProductImage as browserImage,
  getProductImageAlt as browserAlt,
} from '../shared/productImagePresentation.js';

describe('prepared product presentation', () => {
  it.each([
    { name: 'ПВС 3х2.5', image: '/product-placeholder.svg' },
    { name: 'Неизвестное обозначение T13-FIXTURE', image: '/fixture.png' },
    { name: 'Строка на проверке', dataStatus: 'pending', image: '' },
  ])('preserves commercial fields and exact presentation: $name', (variant) => {
    const product = Object.freeze({
      id: 123,
      sku: 'T13-SYNTHETIC',
      slug: 't13-synthetic',
      title: variant.name,
      unit: 'м',
      price: 99.99,
      stock: 2.5,
      ...variant,
    });
    const prepared = prepareProductDetail(product);
    expect(prepared).toMatchObject({
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
    });
    expect(prepared.designationDecoded).toEqual(
      buildProductDesignation(product)
    );
    // The JSON boundary is shared by API and static prerender payloads.
    const received = JSON.parse(JSON.stringify(prepared));
    expect(browserImage(received)).toBe(getProductImage(product));
    expect(browserAlt(received)).toBe(getProductImageAlt(product));
    expect(received.designationDecoded).toEqual(prepared.designationDecoded);
    expect(product).not.toHaveProperty('imageAlt');
  });
});
