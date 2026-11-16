// Файл проверяет создание, контроль целостности и безопасное восстановление backup.

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink, realpath as fsRealpath } from 'fs/promises';
import { createCatalogStore } from '../lib/catalog.js';
import {
  cableGenerationClaimKey, readCableGenerationClaims, reserveCableGeneration,
} from './lib/cableGenerationClaims.js';
import os from 'os';
import { execFileSync } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import path from 'path';
import {
  createBackup,
  listBackups,
  restoreBackup,
  verifyBackup,
} from './backupData.js';

describe('backupData', () => {
  it('создаёт manifest с hash и проверяет его целостность', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    await mkdir(path.join(projectPath, 'data'), { recursive: true });
    await writeFile(path.join(projectPath, 'data', 'products.json'), '[1,2,3]');

    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: path.join(projectPath, 'backups') },
      backupId: 'one',
    });

    expect(result.id).toBe('one');
    expect(result.files).toHaveLength(1);
    expect((await verifyBackup(result.backupPath)).ok).toBe(true);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('находит повреждение backup', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    await mkdir(path.join(projectPath, 'data'), { recursive: true });
    await writeFile(path.join(projectPath, 'data', 'products.json'), '[1,2,3]');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: path.join(projectPath, 'backups') },
      backupId: 'two',
    });
    await writeFile(path.join(result.backupPath, 'products.json'), 'tampered');

    const verification = await verifyBackup(result.backupPath);
    expect(verification.ok).toBe(false);
    expect(verification.errors[0]).toMatch(/products\.json/);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('не восстанавливает файлы без --apply и восстанавливает с ним', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    const backupDir = path.join(projectPath, 'backups');
    const productsPath = path.join(projectPath, 'data', 'products.json');
    await mkdir(path.dirname(productsPath), { recursive: true });
    await writeFile(productsPath, 'original');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: backupDir },
      backupId: 'three',
    });
    await writeFile(productsPath, 'changed');

    await restoreBackup(result.backupPath, { projectPath });
    expect(await readFile(productsPath, 'utf8')).toBe('changed');

    await restoreBackup(result.backupPath, { projectPath, apply: true });
    expect(await readFile(productsPath, 'utf8')).toBe('original');
    expect(
      await listBackups({ projectPath, env: { BACKUP_DIR: backupDir } })
    ).toHaveLength(1);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('не выходит из backup-каталога через путь в manifest', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    const backupDir = path.join(projectPath, 'backups');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: backupDir },
      backupId: 'unsafe',
    });
    const manifestPath = path.join(result.backupPath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files.push({ path: '../outside.txt', bytes: 0, sha256: '' });
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(verifyBackup(result.backupPath)).rejects.toThrow(
      /Опасный путь/
    );
    await rm(projectPath, { recursive: true, force: true });
  });
});

describe('active catalog backup', () => {
  it('restores the release actually read by an already running catalog consumer', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'catalog-backup-')
    );
    try {
      const data = path.join(projectPath, 'data');
      const product = (price) => [
        {
          id: 1,
          name: 'ВВГ 3х2.5',
          sku: 'TEST-1',
          slug: 'test-cable',
          price,
          stock: 10,
          unit: 'м',
          category: 'Силовой кабель',
          catalogSection: 'Кабель и провод',
        },
      ];
      for (const [name, price] of [
        ['a', 100],
        ['b', 200],
      ]) {
        const release = path.join(data, 'releases', name);
        await mkdir(path.join(release, 'public', 'product'), {
          recursive: true,
        });
        await writeFile(
          path.join(release, 'products.json'),
          JSON.stringify(product(price))
        );
        await writeFile(
          path.join(release, 'productRegistry.json'),
          JSON.stringify({ release: name })
        );
        await writeFile(
          path.join(release, 'public', 'price.xls'),
          `synthetic-price-${name}`
        );
        await writeFile(
          path.join(release, 'public', 'sitemap-products.xml'),
          `synthetic-sitemap-${name}`
        );
        await writeFile(
          path.join(release, 'public', 'product', 'test-cable.html'),
          `synthetic-html-${name}`
        );
      }
      await symlink('releases/a', path.join(data, 'catalog-current'));
      // Legacy data can lag behind the authoritative release.
      await writeFile(
        path.join(data, 'products.json'),
        JSON.stringify(product(999))
      );
      await chmod(path.join(data, 'products.json'), 0o444);
      const backup = await createBackup({
        projectPath,
        env: {},
        backupId: 'active-a',
      });
      await rm(path.join(data, 'catalog-current'));
      await symlink('releases/b', path.join(data, 'catalog-current'));
      const store = createCatalogStore({
        productsFile: path.join(data, 'catalog-current/products.json'),
        overridesFile: path.join(data, 'absent-overrides.json'),
        catalogOverridesFile: path.join(data, 'absent-catalog-overrides.json'),
      });
      expect((await store.loadCatalogProducts())[0].price).toBe(200);
      await restoreBackup(backup.backupPath, { projectPath });
      expect((await store.loadCatalogProducts())[0].price).toBe(200);
      await restoreBackup(backup.backupPath, { projectPath, apply: true });
      expect((await store.loadCatalogProducts())[0].price).toBe(100);
      const restartedPrice = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { createCatalogStore } from ${JSON.stringify(new URL('../lib/catalog.js', import.meta.url).href)};
        const data = process.argv[1];
        const store = createCatalogStore({ productsFile: data + '/catalog-current/products.json', overridesFile: data + '/absent-overrides.json', catalogOverridesFile: data + '/absent-catalog-overrides.json' });
        console.log((await store.loadCatalogProducts())[0].price);
      `,
          data,
        ],
        { encoding: 'utf8', env: {} }
      );
      expect(restartedPrice.trim()).toBe('100');

      expect(
        JSON.parse(await readFile(path.join(data, 'products.json'), 'utf8'))[0]
          .price
      ).toBe(100);
      for (const [relative, expected] of [
        ['price.xls', 'synthetic-price-a'],
        ['sitemap-products.xml', 'synthetic-sitemap-a'],
        ['product/test-cable.html', 'synthetic-html-a'],
      ]) {
        expect(
          await readFile(
            path.join(data, 'catalog-current/public', relative),
            'utf8'
          )
        ).toBe(expected);
      }
      expect((await verifyBackup(backup.backupPath)).ok).toBe(true);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});

describe('restore safety', () => {
  it('rejects legacy restore onto active catalog and refuses a concurrent importer', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-restore-')
    );
    try {
      const data = path.join(projectPath, 'data');
      await mkdir(data);
      await writeFile(path.join(data, 'products.json'), 'legacy-original');
      const backup = await createBackup({
        projectPath,
        env: {},
        backupId: 'legacy',
      });
      // Existing v1 copies remain readable.
      const manifestFile = path.join(backup.backupPath, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      manifest.version = 1;
      await writeFile(manifestFile, JSON.stringify(manifest));
      await restoreBackup(backup.backupPath, { projectPath, apply: true });
      await mkdir(path.join(data, 'release'));
      await writeFile(path.join(data, 'release/products.json'), '[]');
      await symlink('release', path.join(data, 'catalog-current'));
      await writeFile(path.join(data, 'products.json'), 'unchanged');
      await expect(
        restoreBackup(backup.backupPath, { projectPath, apply: true })
      ).rejects.toThrow(/Legacy backup/);
      await writeFile(
        path.join(data, '.price-import.lock'),
        JSON.stringify({ pid: process.pid })
      );
      await expect(
        restoreBackup(backup.backupPath, { projectPath, apply: true })
      ).rejects.toThrow(/уже выполняется/);
      await expect(createBackup({ projectPath, env: {} })).rejects.toThrow(
        /уже выполняется/
      );
      const importerBackup = await createBackup({
        projectPath,
        env: {},
        backupId: 'under-lock',
        lockAlreadyHeld: true,
      });
      expect((await verifyBackup(importerBackup.backupPath)).ok).toBe(true);
      expect(
        JSON.parse(
          await readFile(path.join(data, '.price-import.lock'), 'utf8')
        ).pid
      ).toBe(process.pid);
      expect(await readFile(path.join(data, 'products.json'), 'utf8')).toBe(
        'unchanged'
      );
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('restores onto a fresh host, rejects corrupted release and physical-directory targets before mutation', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-restore-')
    );
    const target = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-target-'));
    try {
      const active = path.join(projectPath, 'data/catalog-current');
      await mkdir(path.join(active, 'public'), { recursive: true });
      await writeFile(path.join(active, 'products.json'), '[]');
      await writeFile(path.join(active, 'public/price.xls'), 'synthetic');
      const backup = await createBackup({
        projectPath,
        env: {},
        backupId: 'release',
      });
      await expect(
        restoreBackup(backup.backupPath, { projectPath, apply: true })
      ).rejects.toThrow(/symlink/);
      const result = await restoreBackup(backup.backupPath, {
        projectPath: target,
        apply: true,
      });
      expect(result.catalogRestored).toBe(true);
      expect(
        await readFile(
          path.join(target, 'data/catalog-current/public/price.xls'),
          'utf8'
        )
      ).toBe('synthetic');
      expect(
        await readFile(path.join(target, 'data/products.json'), 'utf8')
      ).toBe('[]');
      await writeFile(
        path.join(backup.backupPath, 'catalog-release/products.json'),
        'tampered'
      );
      await expect(
        restoreBackup(backup.backupPath, { projectPath: target, apply: true })
      ).rejects.toThrow(/повреждена/);
      expect(
        await readFile(
          path.join(target, 'data/catalog-current/products.json'),
          'utf8'
        )
      ).toBe('[]');
    } finally {
      await rm(projectPath, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
    }
  });
});

it('backs up and restores receipt deduplication journal and import notification state', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'receipt-backup-'));
  try {
    const dir = path.join(projectPath, 'data/form-receipts');
    await mkdir(dir, { recursive: true });
    const receipt = path.join(dir, 'receipt.json');
    await writeFile(receipt, '{"stage":"sent"}');
    const state = path.join(
      projectPath,
      'data/.import-notification-state.json'
    );
    await writeFile(state, '{"failureFingerprint":"test"}');
    const backup = await createBackup({
      projectPath,
      env: { BACKUP_DIR: path.join(projectPath, 'backups') },
      backupId: 'receipt-test',
    });
    expect((await verifyBackup(backup.backupPath)).ok).toBe(true);
    await writeFile(receipt, '{"stage":"changed"}');
    await writeFile(state, '{}');
    await restoreBackup(backup.backupPath, { projectPath, apply: true });
    expect(await readFile(receipt, 'utf8')).toBe('{"stage":"sent"}');
    expect(await readFile(state, 'utf8')).toBe('{"failureFingerprint":"test"}');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

it('blocks an archived catalog with legacy generated HTML if it cannot be rebuilt', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-image-restore-'));
  try {
    const data = path.join(projectPath, 'data');
    const archived = path.join(data, 'release-archived');
    await mkdir(path.join(archived, 'public/product'), { recursive: true });
    await writeFile(path.join(archived, 'products.json'), '[]');
    const legacy = '<img src="/product-images/generated/pr1_old.png">';
    await writeFile(path.join(archived, 'public/product/legacy.html'), legacy);
    await symlink('release-archived', path.join(data, 'catalog-current'));
    const backup = await createBackup({ projectPath, env: {}, backupId: 'old-images' });

    await mkdir(path.join(data, 'release-clean'));
    await writeFile(path.join(data, 'release-clean/products.json'), '[]');
    await rm(path.join(data, 'catalog-current'));
    await symlink('release-clean', path.join(data, 'catalog-current'));
    await expect(restoreBackup(backup.backupPath, { projectPath, apply: true }))
      .rejects.toThrow('нужна актуальная сборка dist');
    expect(await fsRealpath(path.join(data, 'catalog-current'))).toBe(await fsRealpath(path.join(data, 'release-clean')));
    expect(await readFile(path.join(archived, 'public/product/legacy.html'), 'utf8')).toBe(legacy);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

it('restores paid-request protection without outputs and keeps newer reservations', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'cable-backup-'));
  try {
    const source = path.join(base, 'source');
    const target = path.join(base, 'target');
    const metadata = path.join('data', 'product-image-metadata');
    const history = path.join(metadata, 'historical-generation-claims.json');
    const active = { family: 'test', cores: 2 };
    const archived = { family: 'test', cores: 3 };
    const newer = { family: 'test', cores: 4 };
    await mkdir(path.join(source, metadata), { recursive: true });
    await mkdir(path.join(target, metadata), { recursive: true });
    await reserveCableGeneration({ root: source, profile: active, outputDir: path.join(source, 'outputs/active') });
    await reserveCableGeneration({ root: target, profile: newer, outputDir: path.join(target, 'outputs/newer') });
    const archivedKey = cableGenerationClaimKey(archived);
    await writeFile(path.join(source, history), JSON.stringify({ version: 1, claims: [{
      key: archivedKey, outputDir: 'outputs/offline', status: 'REQUEST_OUTCOME_UNKNOWN',
      draft: { profile: archived, members: [{ sku: 'OLD' }] },
    }] }));
    await writeFile(path.join(source, metadata, 'generation-claims', 'uncommitted.pending'), '{}');
    const backup = await createBackup({
      projectPath: source, env: { BACKUP_DIR: path.join(base, 'backups') }, backupId: 'cable',
    });
    expect(backup.files.map(entry => entry.path)).toEqual([
      'product-image-metadata/generation-claims/' + cableGenerationClaimKey(active) + '.json',
      'product-image-metadata/historical-generation-claims.json',
    ]);
    await restoreBackup(backup.backupPath, { projectPath: target, apply: true });
    const claims = await readCableGenerationClaims(target);
    expect([...claims.keys()].sort()).toEqual([
      cableGenerationClaimKey(active), archivedKey, cableGenerationClaimKey(newer),
    ].sort());
    await expect(reserveCableGeneration({ root: target, profile: active, outputDir: path.join(target, 'outputs/retry') }))
      .resolves.toMatchObject({ status: 'REQUEST_OUTCOME_UNKNOWN' });
    await expect(reserveCableGeneration({ root: target, profile: archived, outputDir: path.join(target, 'outputs/retry') }))
      .resolves.toMatchObject({ status: 'REQUEST_OUTCOME_UNKNOWN' });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
