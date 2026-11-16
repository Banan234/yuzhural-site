import { expect, it } from 'vitest';
import { main } from '../runCableVisualProduction.js';
import { productionSummary } from './cableVisualProduction.js';

it('reports historical results and rejected PNGs without changing the manifest', () => {
  const group = (visualKey, action, skuCount, validation) =>
    ({ visualKey, action, skuCount, validation, bound: true });
  const records = {
    reused: group('reused', 'REUSE', 2),
    generated: group('generated', 'MISSING', 3, {}),
    rejected: group('rejected', 'MISSING', 4, {}),
  };
  const manifest = { groups: records, apiRequests: 2 };
  const before = structuredClone(manifest);
  const summary = productionSummary({
    planId: 'historical', groups: [1, 2, 3, 4], reviewSkus: ['SKU'],
  }, manifest, { rejected: { reason: 'wrong geometry' } });
  expect(summary).toMatchObject({
    reuseExisting: { visualKeys: 1, products: 2 },
    generated: { visualKeys: 1, products: 3 },
    decodedNewPngReceived: 2,
    failed: [{ visualKey: 'rejected', reason: 'wrong geometry' }],
    apiRequests: 2, productsWithIllustrations: 5, needsReviewUntouched: 1, pending: 1,
  });
  expect(manifest).toEqual(before);
});

it.each(['--prepare', '--run'])('blocks the retired production action %s', async flag => {
  await expect(main([flag])).rejects.toThrow('Legacy production generation disabled');
});
