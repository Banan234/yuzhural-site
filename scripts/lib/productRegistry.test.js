// Файл проверяет стабильность реестра товаров, обработку переименований и генерацию redirect map.

import { describe, it, expect } from 'vitest';
import {
  assignStableIdentity,
  buildOrphanSpecIndex,
  buildSlugRedirects,
  buildSpecKey,
  buildStableKey,
  migrateStableIdentityKeys,
  specKeyFromStableKey,
} from './productRegistry.js';

function emptyRegistry() {
  return { version: 1, nextId: 1, entries: {} };
}

const NOW = '2026-04-28T00:00:00.000Z';
const LATER = '2026-04-28T01:00:00.000Z';

describe('buildStableKey / buildSpecKey', () => {
  it('specKey совпадает у позиций с разной маркой, но одинаковыми спеками', () => {
    const a = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      voltage: 660,
      manufacturer: 'Камкабель',
    };
    const b = { ...a, mark: 'ВВГнг(А)-LS' };
    expect(buildStableKey(a)).not.toBe(buildStableKey(b));
    expect(buildSpecKey(a)).toBe(buildSpecKey(b));
  });

  it('specKeyFromStableKey срезает первую компоненту', () => {
    expect(specKeyFromStableKey('ввг|3|2.5|660|||камкабель|')).toBe(
      '|3|2.5|660|||камкабель|'
    );
    expect(specKeyFromStableKey('')).toBe('');
  });
});

describe('assignStableIdentity', () => {
  it('создаёт новую запись с id, slug и sku', () => {
    const registry = emptyRegistry();
    const result = assignStableIdentity(
      registry,
      { mark: 'ВВГ', cores: 3, crossSection: 2.5, fullName: 'ВВГ 3х2.5' },
      NOW
    );
    expect(result.id).toBe(1);
    expect(result.slug).toBe('vvg-3h2-5-1');
    expect(result.sku).toMatch(/^YU-0+1$/);
    expect(registry.nextId).toBe(2);
  });

  it('повторное появление той же позиции переиспользует запись', () => {
    const registry = emptyRegistry();
    const product = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const first = assignStableIdentity(registry, product, NOW);
    const second = assignStableIdentity(registry, product, LATER);
    expect(second.id).toBe(first.id);
    expect(second.slug).toBe(first.slug);
    expect(registry.entries[buildStableKey(product)].lastSeen).toBe(LATER);
  });

  it('retains the latest supplied source name without clearing it on legacy imports', () => {
    const registry = emptyRegistry();
    const product = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      sourceName: 'ВВГ 3 x 2,5',
    };
    const first = assignStableIdentity(registry, product, NOW);
    expect(registry.entries[first.stableKey].sourceName).toBe(
      product.sourceName
    );
    assignStableIdentity(
      registry,
      { ...product, sourceName: 'ВВГ 3х2.5' },
      LATER
    );
    assignStableIdentity(
      registry,
      { ...product, sourceName: undefined },
      LATER
    );
    expect(registry.entries[first.stableKey].sourceName).toBe('ВВГ 3х2.5');
    expect(registry.nextId).toBe(2);
  });
});

describe('migrateStableIdentityKeys', () => {
  it('переносит запись на новый ключ, сохраняя id, slug и sku', () => {
    const registry = emptyRegistry();
    const oldKey = 'ка9спвпнг(а)-hf|1|120|||||1';
    const newKey = 'ка9спвп|1|120|||||1,нг(а)-hf';
    registry.entries[oldKey] = {
      id: 297,
      slug: 'ka9spvpng-a-hf-1h120-1-89',
      sku: 'YU-0000297',
    };

    const result = migrateStableIdentityKeys(
      registry,
      new Map([[oldKey, newKey]])
    );

    expect(result).toEqual({ migrated: 1, skipped: 0 });
    expect(registry.entries[oldKey]).toBeUndefined();
    expect(registry.entries[newKey]).toMatchObject({
      id: 297,
      slug: 'ka9spvpng-a-hf-1h120-1-89',
      sku: 'YU-0000297',
    });
  });

  it('не затирает существующую запись другого товара', () => {
    const registry = emptyRegistry();
    registry.entries.old = { id: 1, slug: 'old-1', sku: 'YU-0000001' };
    registry.entries.new = { id: 2, slug: 'new-2', sku: 'YU-0000002' };

    const result = migrateStableIdentityKeys(
      registry,
      new Map([['old', 'new']])
    );

    expect(result).toEqual({ migrated: 0, skipped: 1 });
    expect(registry.entries.old.id).toBe(1);
    expect(registry.entries.new.id).toBe(2);
  });
});

describe('rename detection (orphan по spec-ключу)', () => {
  it.each([
    ['ВВГ', 'ВВГнг(А)-LS'],
    ['ВВГнг-LS', 'ВВГ'],
    ['КВВГЭ', 'КВВГ'],
    ['КВВГЭФнг(А)-FRLS-LTx', 'КВВГнг-HF'],
    ['КВВГнг(A)-FRHF-ХЛ-ЭМ', 'КВВГЭА'],
    ['КВВГЭЭ', 'КВВГ Э'],
    ['КВВГЭнг(А)-ХК(LX)ВЭ', 'КВВГ'],
    ['КВВГнг(А)-ХК(LX)ВЭ-ЭФ', 'КВВГ'],
    ['ВВГ нг (А) LS LTx', 'ввг'],
  ])('reuses a unique equivalent base mark: %s -> %s', (oldMark, newMark) => {
    const registry = emptyRegistry();
    const original = {
      mark: oldMark,
      cores: 3,
      crossSection: 2.5,
      fullName: `${oldMark} 3х2.5`,
      sourceName: 'original source',
    };
    const renamed = {
      ...original,
      mark: newMark,
      fullName: `${newMark} 3х2.5`,
      sourceName: 'renamed source',
    };
    const before = assignStableIdentity(registry, original, NOW);
    const orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([buildStableKey(renamed)])
    );
    const after = assignStableIdentity(registry, renamed, LATER, {
      orphanIndex,
    });
    expect(after.id).toBe(before.id);
    expect(after.sku).toBe(before.sku);
    expect(registry.entries[before.stableKey]).toBeUndefined();
    expect(registry.entries[after.stableKey]).toMatchObject({
      sourceName: 'renamed source',
      firstSeen: NOW,
      lastSeen: LATER,
      slugHistory: [before.slug],
    });
    expect(buildSlugRedirects(registry)[before.slug]).toBe(after.slug);
    expect(orphanIndex.size).toBe(0);
  });

  it.each([
    ['ВВГ', 'ПВС'],
    ['ВВГнг-LS', 'ПВСнг-LS'],
    ['ВВГ', 'АВВГ'],
    ['ВВГ', 'ВВГнг(12)-LS'],
    ['ВВГ', 'ВВГнг(А)-UNKNOWN'],
    ['ВВГ', 'ВВГнг(А)-LS-extra'],
    ['ВВГ', 'ВВГ-ХЛ'],
    ['ВВГ', 'ВВГЭК'],
    ['', 'нг'],
    ['Э', 'ЭФ'],
  ])(
    'does not reuse unrelated or unrecognized marks: %s -> %s',
    (oldMark, newMark) => {
      const registry = emptyRegistry();
      const original = { mark: oldMark, cores: 3, crossSection: 2.5 };
      const next = { ...original, mark: newMark };
      const before = assignStableIdentity(registry, original, NOW);
      const savedEntry = { ...registry.entries[before.stableKey] };
      const orphanIndex = buildOrphanSpecIndex(
        registry,
        new Set([buildStableKey(next)])
      );
      const after = assignStableIdentity(registry, next, LATER, {
        orphanIndex,
      });
      expect(after.id).not.toBe(before.id);
      expect(registry.entries[before.stableKey]).toEqual(savedEntry);
      expect(buildSlugRedirects(registry)).toEqual({});
      expect(orphanIndex.get(buildSpecKey(next))).toEqual([before.stableKey]);
    }
  );

  it.each([
    ['ВВГ', 'ВВГЭ'],
    ['ВВГЭ', 'ВВГ'],
    ['ВВГ', 'ПВС'],
    ['ПВС', 'ВВГ'],
  ])(
    'rejects ambiguous same-spec candidates regardless of order: %s, %s',
    (firstMark, secondMark) => {
      const registry = emptyRegistry();
      const originals = [firstMark, secondMark].map((mark) => ({
        mark,
        cores: 3,
        crossSection: 2.5,
      }));
      const before = originals.map((p) =>
        assignStableIdentity(registry, p, NOW)
      );
      const renamed = { ...originals[0], mark: 'ВВГнг(А)-LS' };
      const orphanIndex = buildOrphanSpecIndex(
        registry,
        new Set([buildStableKey(renamed)])
      );
      const after = assignStableIdentity(registry, renamed, LATER, {
        orphanIndex,
      });
      expect(before.map((p) => p.id)).not.toContain(after.id);
      expect(
        before.every((p) => registry.entries[p.stableKey]?.id === p.id)
      ).toBe(true);
      expect(orphanIndex.get(buildSpecKey(renamed))).toHaveLength(2);
      expect(buildSlugRedirects(registry)).toEqual({});
    }
  );

  it('leaves a rejected orphan available for a subsequent equivalent rename', () => {
    const registry = emptyRegistry();
    const original = { mark: 'ВВГ', cores: 3, crossSection: 2.5 };
    const unrelated = { ...original, mark: 'ПВС' };
    const renamed = { ...original, mark: 'ВВГнг-LS' };
    const before = assignStableIdentity(registry, original, NOW);
    const orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([unrelated, renamed].map(buildStableKey))
    );
    const rejected = assignStableIdentity(registry, unrelated, LATER, {
      orphanIndex,
    });
    const accepted = assignStableIdentity(registry, renamed, LATER, {
      orphanIndex,
    });
    expect(rejected.id).not.toBe(before.id);
    expect(accepted.id).toBe(before.id);
  });

  it('preserves sourceName across a rename when the new product does not supply it', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      sourceName: 'ВВГ 3 x 2,5',
    };
    const renamed = { ...original, mark: 'ВВГнг-LS', sourceName: undefined };
    assignStableIdentity(registry, original, NOW);
    const orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([buildStableKey(renamed)])
    );
    const after = assignStableIdentity(registry, renamed, LATER, {
      orphanIndex,
    });
    expect(registry.entries[after.stableKey].sourceName).toBe(
      original.sourceName
    );
  });

  it('ignores a stale orphan entry instead of consuming a missing registry record', () => {
    const registry = emptyRegistry();
    const original = { mark: 'ВВГ', cores: 3, crossSection: 2.5 };
    const renamed = { ...original, mark: 'ВВГнг-LS' };
    const before = assignStableIdentity(registry, original, NOW);
    const orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([buildStableKey(renamed)])
    );
    delete registry.entries[before.stableKey];
    expect(
      assignStableIdentity(registry, renamed, LATER, { orphanIndex }).id
    ).not.toBe(before.id);
  });

  it('переименование сохраняет id/sku и пушит старый slug в slugHistory', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const renamed = {
      ...original,
      mark: 'ВВГнг(А)-LS',
      fullName: 'ВВГнг(А)-LS 3х2.5',
    };

    const before = assignStableIdentity(registry, original, NOW);

    // Новый импорт: в нём только переименованная позиция, оригинальная исчезла.
    const currentStableKeys = new Set([buildStableKey(renamed)]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);
    const after = assignStableIdentity(registry, renamed, LATER, {
      orphanIndex,
    });

    expect(after.id).toBe(before.id);
    expect(after.sku).toBe(before.sku);
    expect(after.slug).not.toBe(before.slug);

    // Старая запись должна исчезнуть, новая — содержать slugHistory.
    expect(registry.entries[buildStableKey(original)]).toBeUndefined();
    const newEntry = registry.entries[buildStableKey(renamed)];
    expect(newEntry.slugHistory).toEqual([before.slug]);
  });

  it('не склеивает две живые записи: если оригинал ещё в импорте, новая позиция получает свой id', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const sibling = {
      mark: 'ВВГнг(А)-LS',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГнг(А)-LS 3х2.5',
    };

    const before = assignStableIdentity(registry, original, NOW);

    // В новом импорте присутствуют ОБА варианта.
    const currentStableKeys = new Set([
      buildStableKey(original),
      buildStableKey(sibling),
    ]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);
    const after = assignStableIdentity(registry, sibling, LATER, {
      orphanIndex,
    });

    expect(after.id).not.toBe(before.id);
    expect(registry.entries[buildStableKey(original)]).toBeDefined();
    expect(registry.entries[buildStableKey(sibling)]).toBeDefined();
  });

  it('osiротевшая запись расходуется только один раз (один rename → один кандидат)', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const renamed1 = { ...original, mark: 'ВВГнг-LS' };
    const renamed2 = { ...original, mark: 'ВВГнг(А)-LS' };

    const before = assignStableIdentity(registry, original, NOW);

    const currentStableKeys = new Set([
      buildStableKey(renamed1),
      buildStableKey(renamed2),
    ]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);

    const r1 = assignStableIdentity(registry, renamed1, LATER, { orphanIndex });
    const r2 = assignStableIdentity(registry, renamed2, LATER, { orphanIndex });

    // Один из двух унаследует id оригинала, второй получит новый.
    const ids = [r1.id, r2.id].sort();
    expect(ids).toEqual([before.id, before.id + 1]);
  });

  it('накапливает slugHistory через серию переименований', () => {
    const registry = emptyRegistry();
    const v1 = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const v2 = { ...v1, mark: 'ВВГнг', fullName: 'ВВГнг 3х2.5' };
    const v3 = { ...v1, mark: 'ВВГнг(А)-LS', fullName: 'ВВГнг(А)-LS 3х2.5' };

    const r1 = assignStableIdentity(registry, v1, NOW);

    let orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([buildStableKey(v2)])
    );
    const r2 = assignStableIdentity(registry, v2, LATER, { orphanIndex });

    orphanIndex = buildOrphanSpecIndex(registry, new Set([buildStableKey(v3)]));
    const r3 = assignStableIdentity(registry, v3, LATER, { orphanIndex });

    expect(r3.id).toBe(r1.id);
    const entry = registry.entries[buildStableKey(v3)];
    expect(entry.slugHistory).toEqual([r1.slug, r2.slug]);
  });
});

describe('buildSlugRedirects', () => {
  it('строит map старый-slug → актуальный-slug по slugHistory', () => {
    const registry = {
      version: 1,
      nextId: 3,
      entries: {
        'a|...': { id: 1, slug: 'new-1', slugHistory: ['old-a', 'older-a'] },
        'b|...': { id: 2, slug: 'fresh-2', slugHistory: [] },
      },
    };
    expect(buildSlugRedirects(registry)).toEqual({
      'old-a': 'new-1',
      'older-a': 'new-1',
    });
  });

  it('пустой map при отсутствии переименований', () => {
    expect(buildSlugRedirects(emptyRegistry())).toEqual({});
  });
});
