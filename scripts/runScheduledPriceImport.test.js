import { it, expect } from 'vitest';
import {
  isUnchangedPrice,
  readSourceState,
  saveSourceState,
} from './lib/importSourceState.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
it('пропускает только тот же файл того же источника', () => {
  const source = {
    sha256: 'abc',
    requestedUrl: 'http://example.test/price.xls',
  };
  expect(isUnchangedPrice(source, source)).toBe(true);
  expect(isUnchangedPrice(source, { ...source, sha256: 'changed' })).toBe(
    false
  );
  expect(
    isUnchangedPrice(source, {
      ...source,
      requestedUrl: 'http://other.test/price.xls',
    })
  ).toBe(false);
  expect(isUnchangedPrice(null, source)).toBe(false);
});
it('сохраняет отпечаток опубликованного прайса между запусками', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'price-state-'));
  const file = path.join(dir, 'state.json');
  try {
    expect(await readSourceState(file)).toBeNull();
    const source = {
      sha256: 'abc',
      requestedUrl: 'http://example.test/price.xls',
    };
    await saveSourceState(file, source);
    expect(isUnchangedPrice(await readSourceState(file), source)).toBe(true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it('повреждённое состояние не останавливает следующие проверки источника', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'price-state-'));
  const file = path.join(dir, 'state.json');
  try {
    await fs.writeFile(file, '{truncated');
    expect(await readSourceState(file)).toBeNull();
    await saveSourceState(file, {
      sha256: 'new',
      requestedUrl: 'http://example.test/price.xls',
    });
    expect((await readSourceState(file)).sha256).toBe('new');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
