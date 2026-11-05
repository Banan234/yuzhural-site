// Файл проверяет precompress-скрипт и набор файлов, которые должны получить gzip/brotli копии.

import { access, mkdir, mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import os from 'os';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { precompress } from './precompress.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-precompress-'));
  tempDirs.push(dir);
  return dir;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('precompress', () => {
  it('skips build-time product pages to keep deploy image smaller', async () => {
    const outputDir = await makeTempDir();
    const productDir = path.join(outputDir, 'product');
    await mkdir(productDir, { recursive: true });

    const repeatedHtml = `<html><body>${'content '.repeat(300)}</body></html>`;
    const indexPath = path.join(outputDir, 'index.html');
    const productPath = path.join(productDir, 'sample-product.html');
    await writeFile(indexPath, repeatedHtml, 'utf8');
    await writeFile(productPath, repeatedHtml, 'utf8');

    const written = await precompress({ outputDir, log: vi.fn() });

    expect(written).toBe(1);
    expect(await exists(`${indexPath}.br`)).toBe(true);
    expect(await exists(`${indexPath}.gz`)).toBe(true);
    expect(await exists(`${productPath}.br`)).toBe(false);
    expect(await exists(`${productPath}.gz`)).toBe(false);
  });
  it('parallel compression keeps every catalog page and produces byte-identical lossless streams', async () => {
    const serial = await makeTempDir();
    const parallel = await makeTempDir();
    const files = [
      'index.html',
      'catalog/index.html',
      'catalog/page-2.html',
      'assets/app.js',
    ];
    for (const root of [serial, parallel]) {
      for (const file of files) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(
          path.join(root, file),
          `<main>${file} ${'Пример 123 '.repeat(300)}</main>`
        );
      }
    }
    expect(
      await precompress({ outputDir: serial, concurrency: 1, log: null })
    ).toBe(4);
    expect(
      await precompress({ outputDir: parallel, concurrency: 2, log: null })
    ).toBe(4);
    for (const file of files) {
      const source = await readFile(path.join(serial, file));
      for (const [suffix, decode] of [
        ['.gz', gunzipSync],
        ['.br', brotliDecompressSync],
      ]) {
        const first = await readFile(path.join(serial, file + suffix));
        const second = await readFile(path.join(parallel, file + suffix));
        expect(second.equals(first)).toBe(true);
        expect(decode(second).equals(source)).toBe(true);
      }
    }
  });
});
