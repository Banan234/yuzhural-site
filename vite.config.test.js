// Файл проверяет Vite-конфигурацию и HTML-transform, который приоритизирует stylesheet перед module script.

import { describe, expect, it } from 'vitest';
import { moveStylesheetsBeforeModuleScripts } from './vite.config.js';

describe('vite index html transforms', () => {
  it('moves stylesheet links before module scripts in head', () => {
    const html = [
      '<!doctype html>',
      '<html lang="ru">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <script type="module" crossorigin src="/assets/index.js"></script>',
      '    <link rel="stylesheet" crossorigin href="/assets/index.css">',
      '  </head>',
      '  <body><div id="root"></div></body>',
      '</html>',
    ].join('\n');

    const transformed = moveStylesheetsBeforeModuleScripts(html);

    expect(transformed.indexOf('rel="stylesheet"')).toBeLessThan(
      transformed.indexOf('type="module"')
    );
    expect(transformed.match(/rel="stylesheet"/g)).toHaveLength(1);
    expect(transformed.match(/type="module"/g)).toHaveLength(1);
  });
});

it('отдаёт свежий прайс после смены выпуска, включая HEAD и отсутствие кеширования', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { runtimePriceMiddleware } = await import('./vite.config.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-price-'));
  const file = path.join(root, 'data/catalog-current/public/price.xls');
  const middleware = runtimePriceMiddleware(root);
  const request = async (method = 'GET') => {
    const headers = {};
    const res = {
      setHeader: (key, value) => {
        headers[key] = value;
      },
      end: (body) => {
        res.body = body;
      },
    };
    await middleware({ url: '/price.xls?download=1', method }, res, () => {
      throw new Error('unexpected fallback');
    });
    return { ...res, headers };
  };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'first');
    expect((await request()).body.toString()).toBe('first');
    await fs.writeFile(file, 'updated');
    const updated = await request();
    expect(updated.body.toString()).toBe('updated');
    expect(updated.headers['Cache-Control']).toBe('no-store');
    expect(updated.headers['Content-Length']).toBe(7);
    expect((await request('HEAD')).body).toBeUndefined();
    await fs.unlink(file);
    let fallback = false;
    await middleware({ url: '/price.xls', method: 'GET' }, {}, () => {
      fallback = true;
    });
    expect(fallback).toBe(true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
