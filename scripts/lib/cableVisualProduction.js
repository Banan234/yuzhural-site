import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function writeProductionJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export function productionSummary(plan, manifest, qualityRejections = {}) {
  const records = Object.values(manifest.groups).map((record) =>
    qualityRejections[record.visualKey]
      ? {
          ...record,
          bound: false,
          status: 'failed',
          qualityRejected: true,
          error: qualityRejections[record.visualKey].reason,
        }
      : record
  );
  const completed = records.filter((r) => r.bound);
  const reused = completed.filter((r) => r.action === 'REUSE');
  const generated = completed.filter((r) => r.action === 'MISSING');
  return {
    updatedAt: new Date().toISOString(),
    planId: plan.planId,
    reuseExisting: {
      visualKeys: reused.length,
      products: reused.reduce((n, r) => n + r.skuCount, 0),
    },
    generated: {
      visualKeys: generated.length,
      products: generated.reduce((n, r) => n + r.skuCount, 0),
    },
    decodedNewPngReceived: records.filter(
      (r) => r.action === 'MISSING' && r.validation
    ).length,
    failed: records
      .filter((r) => r.status === 'failed')
      .map((r) => ({
        visualKey: r.visualKey,
        reason: r.error,
        image: r.image || null,
      })),
    skippedCache: manifest.skippedCache || 0,
    apiRequests: manifest.apiRequests,
    productsWithIllustrations: completed.reduce((n, r) => n + r.skuCount, 0),
    needsReviewUntouched: plan.reviewSkus.length,
    pending:
      plan.groups.length -
      completed.length -
      records.filter((r) => r.status === 'failed').length,
  };
}
