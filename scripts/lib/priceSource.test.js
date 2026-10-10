// Файл проверяет выбор источника прайса и фиксацию его контрольной суммы.

import { createHash } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquirePriceSource,
  resolvePriceSourceSelection,
} from './priceSource.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeTempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'price-source-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('resolvePriceSourceSelection', () => {
  it('предпочитает аргумент запуска адресу из окружения', () => {
    expect(
      resolvePriceSourceSelection({
        positionalSource: 'https://example.test/manual.xls',
        env: { PRICE_URL: 'https://example.test/configured.xls' },
        defaultPath: '/project/data/price.xls',
      })
    ).toEqual({
      remoteSourceUrl: 'https://example.test/manual.xls',
      inputFile: '/project/data/price.xls',
    });
  });

  it('использует локальный путь из аргумента прежде настроек окружения', () => {
    expect(
      resolvePriceSourceSelection({
        positionalSource: '/tmp/custom.xls',
        env: { PRICE_URL: 'https://example.test/configured.xls' },
        defaultPath: '/project/data/price.xls',
      })
    ).toEqual({ remoteSourceUrl: '', inputFile: '/tmp/custom.xls' });
  });

  it('проверяет PRICE_URL, PRICE_PAGE_URL и локальный файл по порядку', () => {
    const defaultPath = '/project/data/price.xls';
    expect(
      resolvePriceSourceSelection({
        env: {
          PRICE_URL: 'https://example.test/price.xls',
          PRICE_PAGE_URL: 'https://example.test/prices/',
        },
        defaultPath,
      }).remoteSourceUrl
    ).toBe('https://example.test/price.xls');
    expect(
      resolvePriceSourceSelection({
        env: { PRICE_PAGE_URL: 'https://example.test/prices/' },
        defaultPath,
      }).remoteSourceUrl
    ).toBe('https://example.test/prices/');
    expect(resolvePriceSourceSelection({ defaultPath })).toEqual({
      remoteSourceUrl: '',
      inputFile: defaultPath,
    });
  });
});

describe('acquirePriceSource', () => {
  it('сохраняет SHA-256 и размер локального файла', async () => {
    const directory = await makeTempDir();
    const filePath = path.join(directory, 'price.xls');
    const contents = Buffer.from('local-price');
    await writeFile(filePath, contents);

    const result = await acquirePriceSource({ filePath });

    expect(result.buffer).toEqual(contents);
    expect(result.metadata).toEqual({
      kind: 'local',
      requestedUrl: null,
      downloadUrl: null,
      sha256: createHash('sha256').update(contents).digest('hex'),
      sizeBytes: contents.length,
    });
  });

  it('сохраняет URL и SHA-256 удалённого файла, очищая секреты из URL', async () => {
    const contents = Buffer.from('remote-price');
    const result = await acquirePriceSource({
      remoteUrl: 'https://example.test/prices/?auth=page-secret',
      filePath: '/project/data/price.xls',
      fetchImpl: async (url) => {
        if (url === 'https://example.test/prices/?auth=page-secret') {
          return new Response(
            '<a href="/files/current-price.xls?token=file-secret">Скачать прайс</a>'
          );
        }
        if (
          url ===
          'https://example.test/files/current-price.xls?token=file-secret'
        ) {
          return new Response(null, {
            status: 302,
            headers: {
              location: '/files/v2/current-price.xls?token=redirect-secret',
            },
          });
        }
        return new Response(contents);
      },
    });

    expect(result.buffer).toEqual(contents);
    expect(result.metadata).toEqual({
      kind: 'remote',
      requestedUrl: 'https://example.test/prices/?redacted',
      downloadUrl: 'https://example.test/files/v2/current-price.xls?redacted',
      sha256: createHash('sha256').update(contents).digest('hex'),
      sizeBytes: contents.length,
    });
    expect(JSON.stringify(result.metadata)).not.toContain('secret');
  });
});
