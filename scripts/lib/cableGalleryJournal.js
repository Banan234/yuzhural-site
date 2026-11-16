import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, recordCableStyleReview, cableStyleReviewRequirements } from './cableStyleBatch.js';
import { archiveApprovedCableResult } from './cableApprovedResults.js';
import { prepareCableStyleRequest } from './cableImageStyle.js';
import { compareCableReferenceProfile } from './cableApprovedStyleReference.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { readGalleryPng } from './cableGalleryFiles.js';
import { vvgCutHold } from './cableVvgCutQuality.js';
import { blocksCableReuse, catalogDecisions, referenceDecisions } from './cableReviewPolicy.js';

const empty = { catalog: null, reference: null, referenceScope: null };
const positive = status => ['PRIMARY', 'ADDITIONAL'].includes(status);
const catalogApproval = status => ['APPROVED', 'WITH_NOTES'].includes(status);
const schema = 'cable-gallery-review-1';
const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export function exportGalleryReviews(registry) {
  const reviews = registry.reviewBySha256 ?? {};
  return { schema, reviews, checksum: digest(reviews) };
}

export function galleryRevision(item) {
  return digest({ journal: item.journal, legacy: item.legacyRevision,
    scopes: item.scopes, bindings: item.bindings, hold: item.hold });
}

export function validateGalleryHistory(sha, events) {
  if (!isSha(sha) || !Array.isArray(events) || !events.length)
    throw Error('Неверная запись журнала: ' + sha);
  let previous = null;
  for (const event of events) {
    const { hash, ...data } = event;
    const { catalog, reference, referenceScope, visualApproval } = event.after ?? {};
    if (hash !== digest(data) || data.sha256 !== sha || data.parent !== (previous?.hash ?? null) ||
        (previous && digest(previous.after) !== digest(data.before)) ||
        ![null, ...catalogDecisions].includes(catalog) || ![null, ...referenceDecisions].includes(reference) ||
        (positive(reference) ? !isSha(referenceScope?.profileHash) ||
          typeof referenceScope?.visualKey !== 'string' || referenceScope.APPROVED_AS_REFERENCE !== true ||
          (referenceScope.preferredRole !== undefined && !['FAMILY_PRIMARY','GEOMETRY_MATCH'].includes(referenceScope.preferredRole)) : referenceScope !== null) ||
        !Number.isFinite(Date.parse(data.at)) || (previous && data.at < previous.at) ||
        (visualApproval !== undefined && (visualApproval?.status !== 'APPROVED' ||
          typeof visualApproval.reason !== 'string' || typeof visualApproval.name !== 'string' ||
          typeof visualApproval.family !== 'string')) ||
        typeof data.note !== 'string' || typeof data.reviewer !== 'string' || !data.reviewer.trim())
      throw Error('Нарушена целостность журнала: ' + sha);
    previous = event;
  }
}

function checkScope(item, state, archiveEntries, { catalog = true, reference = true } = {}) {
  if (catalog && catalogApproval(state.catalog) && !archiveEntries.some(entry => entry.APPROVED_FOR_CATALOG &&
      item.scopes.some(scope => scope.visualKey === entry.visualKey && scope.profileHash === entry.profileHash)))
    throw Error('Допуск в каталог требует утверждённой записи с точным профилем.');
  if (!reference || !positive(state.reference)) return;
  if (item.hold || blocksCableReuse(state.catalog) ||
      (state.catalog === null && blocksCableReuse(item.legacyCatalog)) ||
      (blocksCableReuse(item.durableStatus) && state.supersedes !== digest(item.decision.decision)))
    throw Error('Удержание, отклонение или исправление запрещает положительный референс.');
  const { visualKey, profileHash } = state.referenceScope ?? {};
  const archive = archiveEntries.find(entry => entry.visualKey === visualKey && entry.profileHash === profileHash);
  const scope = item.scopes.find(row => row.visualKey === visualKey && row.profileHash === profileHash);
  if (!archive || !scope || archive.approval?.acceptedCatalogChecks?.some(check => archive.approval.checks?.[check] !== true) ||
      compareCableReferenceProfile(scope.profile, scope.profile)?.role !== 'GEOMETRY_MATCH')
    throw Error('Для референса нужен утверждённый PNG с подтверждённым visualKey и профилем.');
}

export async function commitGalleryReviews(library, body, { importing = false, directApproval = false } = {}) {
  const base = path.join(library.root, 'data/cable-approved-results');
  const file = path.join(base, 'registry.json');
  const lockPath = path.join(base, '.registry.lock');
  const lock = await fs.open(lockPath, 'wx').catch(error => {
    if (error.code === 'EEXIST') throw Error('Реестр занят. Повторите сохранение.');
    throw error;
  });
  try {
    const registry = JSON.parse(await fs.readFile(file, 'utf8'));
    if (digest(registry) !== digest(library.registry))
      throw Error('Реестр изменился. Обновите галерею и проверьте решения.');
    const [products, bindings, overrides] = await Promise.all([
      'data/catalog-current/products.json', 'shared/generatedProductImages.json', 'data/priceOverrides.json',
    ].map(relative => fs.readFile(path.join(library.root, relative), 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT' && relative.endsWith('priceOverrides.json')) return null;
      throw error;
    })));
    if (library.catalogRevision !== digest({products, bindings, overrides}))
      throw Error('Данные каталога изменились. Обновите галерею и проверьте совместимость.');
    const durable = new Map((await loadCableReviewDecisions(library.root)).map(row => [row.decision.sha256, row.decision]));
    registry.reviewBySha256 ??= {};
    const changes = [];
    const prepared = [];
    const visualCopies = [];
    if (importing && (!body || body.schema !== schema || !body.reviews ||
        Array.isArray(body.reviews) || typeof body.reviews !== 'object' || body.checksum !== digest(body.reviews)))
      throw Error('Неверный формат или контрольная сумма JSON.');
    const rows = importing ? Object.keys(body.reviews).map(sha256 => ({ sha256 })) : body.rows;
    if (!Array.isArray(rows) || (!importing && !rows.length) || new Set(rows.map(row => row?.sha256)).size !== rows.length)
      throw Error('Укажите уникальные PNG для сохранения.');
    const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim().slice(0, 120) : '';
    if (!importing && !reviewer) throw Error('Укажите имя проверяющего.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    const errors = [];
    const newCatalogKeys = new Set();
    for (const row of rows) {
      const item = library.files.get(row?.sha256);
      try {
        if (!item || item.protected) throw Error('PNG отсутствует в инвентаре или является защищённым эталоном.');
        if (digest(durable.get(item.sha256) ?? null) !== digest(item.decision?.decision ?? null))
          throw Error('История проверки изменилась. Обновите галерею.');
        const events = registry.reviewBySha256[item.sha256] ?? [];
        if (events.length) validateGalleryHistory(item.sha256, events);
        if (importing) {
          const incoming = body.reviews[item.sha256];
          validateGalleryHistory(item.sha256, incoming);
          if (!events.every((event, index) => event.hash === incoming[index]?.hash))
            throw Error('История расходится с текущей или JSON устарел. Откройте карточку и разрешите конфликт вручную.');
          if (events.length === incoming.length) continue;
          if (incoming.at(-1).legacyRevision !== item.legacyRevision)
            throw Error('Исходное утверждение или прежнее решение изменилось.');
          await readGalleryPng(library.root, item);
          const after = incoming.at(-1).after;
          if (after.supersedes && (events.at(-1)?.after.supersedes !== after.supersedes) &&
              !item.archived.some(entry => entry.approval.manualGallery && entry.approval.sha256 === item.sha256))
            throw Error('Для восстановления переутверждения нужна подтверждённая архивная запись.');
          if (!blocksCableReuse(after.catalog)) checkScope(item, after, item.archived);
          changes.push([item.sha256, incoming]);
          continue;
        }
        if (row.revision !== galleryRevision(item)) throw Error('Решение изменилось. Обновите карточку.');
        const last = events.at(-1);
        const before = last?.after ?? empty;
        let after, directVerification, visualOnly;
        if (directApproval && item.hold) {
          visualOnly = 'Действует ограничение ' + item.hold + '; текущие привязки сохранены.';
        } else if (directApproval && !item.archived.some(entry => entry.APPROVED_FOR_CATALOG)) {
          const scopes = item.scopes.filter(scope => scope.visualKey === row.visualKey);
          const scope = scopes.length === 1 ? scopes[0] : null;
          const draft = item.groups.find(({dir, group}) => !dir.startsWith(base + path.sep) &&
            group.visualKey === scope?.visualKey && digest(group.profile) === scope.profileHash &&
            group.standardVersion === library.style.version);
          if (!draft) visualOnly = 'Профиль PNG не подтверждён для текущего каталога.';
          else if (newCatalogKeys.has(scope.visualKey) ||
              (registry.byVisualKey[scope.visualKey] && registry.byVisualKey[scope.visualKey].sha256 !== item.sha256))
            visualOnly = 'Для профиля уже сохранён другой эталон каталога.';
          else {
            const { required, composition } = cableStyleReviewRequirements(draft.group, draft.request);
            const observations = [...item.history, ...item.journal.map(event => event.verification)]
              .find(record => record?.observations?.sha256 === item.sha256)?.observations;
            if (composition && !observations)
              visualOnly = 'Геометрия PNG ещё не подтверждена измерениями.';
            else {
              try {
                directVerification = await recordCableStyleReview({
                  root:library.root, draftDir:draft.dir, verifyOnly:true,
                  decision:{ sha256:item.sha256, reviewer, note, status:'APPROVED',
                    checks:Object.fromEntries(required.map(key=>[key,true])),
                    observations, preserveExistingApproval:true, manualGallery:true,
                    APPROVED_FOR_CATALOG:true, visualAttestation:true },
                });
              } catch (error) {
                if (!/^(Catalog |Draft |NEEDS_TECHNICAL_REVIEW:|Multicore verification incomplete:)/u.test(error.message)) throw error;
                visualOnly = error.message;
              }
            }
          }
        }
        if (visualOnly) {
          after = { ...before, visualApproval:{ status:'APPROVED', reason:visualOnly, name:item.name,
            family:item.family, visualKey:item.visualKey } };
        } else if (body.undo) {
          if (!last) throw Error('В журнале галереи пока нет решения для отмены.');
          if (row.expectedHead !== undefined && row.expectedHead !== last.hash)
            throw Error('После утверждения появились новые решения. Отмена остановлена.');
          after = last.before;
        } else {
          after = { ...before };
          if (body.catalog) delete after.visualApproval;
          if (body.catalog && body.catalog !== 'NEEDS_CORRECTION') delete after.correction;
          if (body.correction) {
            const { reason, references } = body.correction;
            if (body.catalog !== 'NEEDS_CORRECTION' || typeof reason !== 'string' || !reason.trim() ||
                Object.values(references ?? {}).some(value => !isSha(value)))
              throw Error('Укажите причину исправления и допустимые референсы.');
            const scope = item.scopes.find(scope => scope.visualKey === (row.visualKey ?? item.visualKey));
            if (references?.primary || references?.geometry) {
              if (!scope) throw Error('Для выбора референса нужен технический профиль.');
              await prepareCableStyleRequest(library.root, scope.profile, { referenceChoices: references });
            }
            after.correction = { reason: reason.trim().slice(0,120),
              ...(scope && { visualKey:scope.visualKey, profileHash:scope.profileHash }), references: {
              ...(references?.primary && { primary:references.primary }),
              ...(references?.geometry && { geometry:references.geometry }),
            } };
          }
          if (body.catalog !== undefined) {
            if (!catalogDecisions.includes(body.catalog)) throw Error('Неизвестное решение по каталогу.');
            after.catalog = body.catalog;
          }
          if (body.reference !== undefined) {
            if (!referenceDecisions.includes(body.reference)) throw Error('Неизвестное решение по референсу.');
            after.reference = body.reference;
            after.referenceScope = null;
            if (positive(after.reference)) {
              const scope = item.scopes.find(scope => scope.visualKey === row.visualKey) ??
                (item.scopes.length === 1 && !row.visualKey ? item.scopes[0] : null);
              if (!scope) throw Error('Выберите подтверждённый visualKey.');
              after.referenceScope = { visualKey: scope.visualKey, profileHash: scope.profileHash, APPROVED_AS_REFERENCE: true,
                ...(body.preferReferenceRole === true && { preferredRole:after.reference === 'PRIMARY' ? 'FAMILY_PRIMARY' : 'GEOMETRY_MATCH' }) };
            }
          }
          if (!body.catalog && !body.reference && !note) throw Error('Выберите решение или добавьте комментарий.');
          if ((item.conflict || (item.legacyCatalog !== 'UNDECIDED' && body.catalog &&
              body.catalog !== item.legacyCatalog && !(catalogApproval(body.catalog) && item.legacyCatalog === 'APPROVED'))) && body.resolve !== true)
            throw Error('Подтвердите ручное разрешение расхождения с прежним решением.');
          if (blocksCableReuse(after.catalog) && positive(after.reference)) {
            if (positive(body.reference)) throw Error('Отклонённый PNG или PNG на исправлении не может быть референсом.');
            // Keep both decisions in history. A negative catalog decision blocks runtime use.
          }
        }
        if (item.bindings.length && after.catalog !== before.catalog &&
            (blocksCableReuse(after.catalog) || (body.undo && item.archived.some(entry =>
              entry.APPROVED_FOR_CATALOG && entry.approval.manualGallery) && !catalogApproval(after.catalog))))
          throw Error('PNG используется в каталоге. Сначала восстановите привязки или выполните штатную миграцию.');
        const referenceExplicit = !visualOnly && !body.undo && positive(body.reference);
        if (digest(before) === digest(after) && !note && !referenceExplicit) continue;
        const image = await readGalleryPng(library.root, item);
        if (visualOnly) visualCopies.push({ sha256:item.sha256, image });
        let entries = item.archived;
        const needsCatalog = !visualOnly && catalogApproval(body.catalog) && !entries.some(entry => entry.APPROVED_FOR_CATALOG);
        const needsReference = !visualOnly && (positive(body.reference) || catalogApproval(body.catalog)) && positive(after.reference) && !blocksCableReuse(after.catalog) &&
          !entries.some(entry => entry.visualKey === after.referenceScope.visualKey && entry.profileHash === after.referenceScope.profileHash);
        const recertify = !visualOnly && catalogApproval(body.catalog) && blocksCableReuse(item.durableStatus) &&
          after.supersedes !== digest(item.decision.decision);
        let staging, verification;
        if (needsCatalog || needsReference || recertify) {
          const scope = item.scopes.find(scope => scope.visualKey === (after.referenceScope?.visualKey ?? row.visualKey ?? item.visualKey));
          const draft = item.groups.find(group => group.group.visualKey === scope?.visualKey &&
            group.group.standardVersion === library.style.version && digest(group.group.profile) === scope.profileHash &&
            !group.dir.startsWith(base + path.sep));
          if (!draft || item.hold || vvgCutHold(item.sha256)) throw Error('Нужен черновик с подтверждённым профилем текущего каталога.');
          if (needsCatalog && (newCatalogKeys.has(scope.visualKey) ||
              (registry.byVisualKey[scope.visualKey] && registry.byVisualKey[scope.visualKey].sha256 !== item.sha256)))
            throw Error('Для этого visualKey уже выбран PNG каталога.');
          const approval = directVerification ? { ...directVerification, archiveOnly:!needsCatalog,
            APPROVED_FOR_CATALOG:needsCatalog, APPROVED_AS_REFERENCE:positive(after.reference) } :
            await recordCableStyleReview({ root: library.root, draftDir: draft.dir, verifyOnly: true,
            decision: { sha256: item.sha256, reviewer, note, status: 'APPROVED', checks: row.checks,
              observations: row.observations, preserveExistingApproval: true, archiveOnly: !needsCatalog,
              ...(row.acceptedCatalogChecks && { acceptedCatalogChecks: row.acceptedCatalogChecks }),
              APPROVED_FOR_CATALOG: needsCatalog, APPROVED_AS_REFERENCE: positive(after.reference), manualGallery: true } });
          if (recertify) {
            after.supersedes = digest(item.decision.decision);
            verification = approval;
          }
          if (needsCatalog || needsReference) {
            const group = { ...draft.group, draftKey:draft.group.draftKey ??
              digest({ visualKey:scope.visualKey, standard:draft.group.standardVersion, sha256:item.sha256 }) };
            staging = { root: library.root, draftDir: draft.dir, group, approval };
            entries = [...entries, { visualKey: scope.visualKey, profileHash: scope.profileHash,
              APPROVED_FOR_CATALOG: needsCatalog, approval }];
          }
        }
        if (!visualOnly && !blocksCableReuse(after.catalog)) checkScope(item, after, entries, {
          catalog: catalogApproval(body.catalog) || Boolean(body.undo),
          reference: positive(after.reference) && (positive(body.reference) || catalogApproval(body.catalog) || Boolean(body.undo)),
        });
        if (staging) {
          prepared.push(staging);
          if (needsCatalog) newCatalogKeys.add(staging.group.visualKey);
        }
        const event = { sha256: item.sha256, parent: last?.hash ?? null, before, after, reviewer, note,
          at: new Date(Math.max(Date.now(), Date.parse(last?.at) || 0)).toISOString(),
          legacyRevision: item.legacyRevision, ...(body.resolve === true && { resolved: true }),
          effectiveBefore: { catalog: before.catalog ?? item.legacyCatalog,
            reference: before.reference ?? item.legacyReference },
          effectiveAfter: { catalog: after.catalog ?? item.legacyCatalog,
            reference: after.reference ?? item.legacyReference },
          ...(verification && { verification }), ...(referenceExplicit && { referenceExplicit }),
          ...(body.undo && { undoOf: last.hash }) };
        changes.push([item.sha256, [...events, { ...event, hash: digest(event) }]]);
      } catch (error) {
        errors.push((item?.name ?? row?.sha256 ?? 'PNG') + ' · ' + error.message);
      }
    }
    if (errors.length) throw Error(errors.join('\n'));
    if (!changes.length) return 0;
    for (const { sha256, image } of visualCopies) {
      const dir = path.join(library.root, 'data/product-image-metadata/review-decisions', sha256);
      await fs.mkdir(dir, { recursive:true });
      const png = path.join(dir,'image.png');
      try { await fs.writeFile(png,image,{ flag:'wx' }); }
      catch (error) {
        if (error.code !== 'EEXIST' || digest(await fs.readFile(png)) !== sha256) throw error;
      }
    }
    for (const approval of prepared) await archiveApprovedCableResult({ ...approval, stagedRegistry: registry });
    for (const [sha, events] of changes) registry.reviewBySha256[sha] = events;
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temp, JSON.stringify(registry, null, 2) + '\n', { flag: 'wx' });
      await fs.rename(temp, file);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return changes.length;
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
