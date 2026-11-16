import fs from 'node:fs/promises';
import path from 'node:path';
import { applyApprovedBindingPatches, digest } from './cableStyleBatch.js';
import { CABLE_SHARED_VISUAL_REUSE, cableSharedVisualKey, CABLE_VISUAL_GROUP_REUSE, cableVisibleConstructionKey } from './cableReferenceCompatibility.js';

export function galleryPlacement(library, rows, { skipAmbiguous = false } = {}) {
  const claimed = new Set();
  return rows.map(({ sha256, visualKey }) => {
    const item = library.files.get(sha256);
    if (!item || item.protected) throw Error('Изображение недоступно для размещения.');
    const matches = item.placement.filter(row => row.visualKey === (visualKey ?? item.visualKey));
    if (matches.length > 1 && !skipAmbiguous) throw Error('Выберите однозначный технический профиль.');
    const scope = matches.length === 1 ? matches[0] : null;
    const skus = (scope?.skus ?? []).filter(sku => !claimed.has(sku));
    skus.forEach(sku => claimed.add(sku));
    return { sha256, visualKey:visualKey ?? item.visualKey, profileHash:scope?.profileHash, skus };
  });
}

function archiveDir(library, row) {
  const item = library.files.get(row.sha256);
  const entry = item?.archived.find(entry => entry.APPROVED_FOR_CATALOG &&
    entry.visualKey === (row.visualKey ?? item.visualKey) && (!row.profileHash || entry.profileHash === row.profileHash));
  if (!entry) throw Error('Сначала утвердите PNG для каталога.');
  return path.join(library.root, entry.draftDir);
}

export async function placeGalleryImages(library, preview, { skipUnapproved = false } = {}) {
  const rows = galleryPlacement(library, preview.rows, { skipAmbiguous:skipUnapproved });
  if (preview.catalogRevision !== library.catalogRevision || digest(rows) !== preview.hash)
    throw Error('Охват изменился. Откройте предварительный расчёт заново.');
  const registry = JSON.parse(await fs.readFile(path.join(library.root,'data/cable-approved-results/registry.json'), 'utf8'));
  const assignments = await Promise.all(rows.filter(row => row.skus.length && (!skipUnapproved ||
    !registry.reviewBySha256?.[row.sha256]?.at(-1)?.after.visualApproval)).map(async row => {
    const entry = registry.byVisualKey[row.visualKey];
    if (entry?.APPROVED_FOR_CATALOG !== true || entry.sha256 !== row.sha256 || entry.profileHash !== row.profileHash)
      throw Error('Утверждение PNG изменилось. Обновите галерею.');
    const archive = path.join(library.root,'data/cable-approved-results');
    const draftDir = await fs.realpath(path.resolve(library.root,entry.draftDir));
    if (!draftDir.startsWith(archive + path.sep)) throw Error('Неверный путь архива PNG.');
    const group = JSON.parse(await fs.readFile(path.join(draftDir,'group.json'), 'utf8'));
    return { draftDir, onlyUnboundInFamily:true, typicalVvg:Boolean(cableVisibleConstructionKey(group.profile)), reusePolicy:cableSharedVisualKey(group.profile) ? CABLE_SHARED_VISUAL_REUSE : CABLE_VISUAL_GROUP_REUSE,
      currentGroup: { ...group, eligibleSkus:row.skus, members:row.skus.map(sku => ({
        sku, productHash:digest(library.catalog.get(sku).product), oldBinding:null,
      })) } };
  }));
  return applyApprovedBindingPatches({ root:library.root, assignments, catalogRevision:preview.catalogRevision });
}

export async function restoreGalleryImages(library, rows) {
  return applyApprovedBindingPatches({ root:library.root,
    restore:rows.map(row => ({ draftDir:archiveDir(library,row),
      placementHash:row.placementHash, expectedHead:row.head })), catalogRevision:library.catalogRevision });
}
