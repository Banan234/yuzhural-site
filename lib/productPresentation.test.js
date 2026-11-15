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
  it('uses current reviewed dimensions when prerendering a legacy import row', () => {
    const prepared = prepareProductDetail({
      sku: 'YU-0002074',
      sourceName: 'FTP-5е 4х2',
      mark: 'FTP-5е',
      cores: 4,
      crossSection: 2,
      designationDecoded: { status: 'reviewed', tokens: [] },
    });
    expect(prepared.displayDimensions).toEqual({ kind: 'pairs', pairs: 4 });
    expect(prepared.specs['Количество пар']).toBe('4');
    expect(prepared.specs).not.toHaveProperty('Сечение жилы');
    expect(prepared.specs).not.toHaveProperty('Количество жил');
  });

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
