// Файл проверяет импорт прайса, генерацию каталожных данных и обработку edge-case строк.

import { describe, it, expect } from 'vitest';
import {
  buildRedirectsNginxConf,
  mergeImportConfig,
  normalizeMarkKey,
  detectSchema,
  splitRowsIntoBlocks,
  buildBookReadingOrder,
  pickPageCells,
  parsePageRow,
  createProductRecord,
  summarizeManufacturers,
  isHeaderRow,
  isCategoryRow,
  looksLikeCategoryHeading,
  isServiceRow,
  productKey,
  buildDiff,
  buildRegistryKeyMigrations,
  normalizeImportHistory,
  parseImportHistory,
  parsePriceOverrides,
  parsePreviousProducts,
  buildHistorySnapshot,
  getHistoricalSnapshots,
  buildSuspiciousPriceStats,
  percentile,
  roundNullable,
  toPositiveNumber,
  detectSuspicious,
  formatThresholdSource,
  summarizeSkips,
  summarizeByCategory,
  assertWorksheetWithinRowLimit,
  MAX_PRICE_WORKSHEET_ROWS,
} from './importPrice.js';
import {
  assertPriceBufferWithinLimit,
  DEFAULT_PRICE_DOWNLOAD_MAX_BYTES,
  extractSpreadsheetUrlFromHtml,
  fetchPriceWithTimeout,
  parsePriceDownloadMaxBytes,
  resolveRemotePriceUrl,
} from './lib/priceSource.js';
import { resolveProductDisposition } from './lib/importDisposition.js';

describe('resolveProductDisposition', () => {
  it('сразу отбрасывает некабельную строку', () => {
    const record = createProductRecord(
      {
        name: 'Контактор 3RT1036-1В 50А SIEMENS',
        unit: 'шт',
        price: 10,
        stock: 1,
      },
      'Пускатели,контакторы'
    );
    expect(record).toEqual({ type: 'excluded' });
    expect(
      resolveProductDisposition({
        name: 'Контактор 3RT1036-1В 50А SIEMENS',
        sourceCategory: 'Пускатели,контакторы',
        unit: 'м',
      })
    ).toMatchObject({
      status: 'exclude',
      reason: 'explicit_non_cable_name',
      evidence: 'Контактор',
    });
  });

  it('публикует кабельную позицию из кабельной категории', () => {
    expect(
      resolveProductDisposition({
        name: 'ВВГ 3х2.5',
        sourceCategory: 'Кабель ВВГ, ВВГнг, ВВГнгLS, ВВГнгхл, ВВГнгFRLS',
      })
    ).toMatchObject({
      status: 'publish',
      reason: 'source_category_cable',
      evidence: 'Кабель ВВГ, ВВГнг, ВВГнгLS, ВВГнгхл, ВВГнгFRLS',
    });
  });

  it('использует единицу измерения как fallback для неизвестной строки', () => {
    expect(
      resolveProductDisposition({ name: 'Неизвестная позиция', unit: 'м' })
    ).toMatchObject({
      status: 'publish',
      reason: 'unit_meter_fallback',
      evidence: 'м',
    });
    expect(
      resolveProductDisposition({ name: 'Неизвестная позиция', unit: 'км' })
    ).toMatchObject({
      status: 'publish',
      reason: 'unit_meter_fallback',
      evidence: 'м',
    });
    expect(
      resolveProductDisposition({ name: 'Неизвестная позиция', unit: 'штука' })
    ).toMatchObject({
      status: 'exclude',
      reason: 'unit_piece_fallback',
      evidence: 'шт',
    });
  });

  it('не позволяет fallback по единице отменить явные признаки', () => {
    expect(
      resolveProductDisposition({ name: 'Контактор SIEMENS', unit: 'м' })
    ).toMatchObject({ status: 'exclude', reason: 'explicit_non_cable_name' });
    expect(
      resolveProductDisposition({ name: 'ВВГ 3х2.5', unit: 'шт' })
    ).toMatchObject({ status: 'publish', reason: 'cable_name_evidence' });
    expect(
      resolveProductDisposition({
        name: 'Металлорукав РЗЦПнг d=32мм',
        unit: 'м',
      })
    ).toMatchObject({
      status: 'exclude',
      reason: 'explicit_non_cable_name',
      evidence: 'Металлорукав',
    });
  });
});

describe('import summaries', () => {
  it('summarizes recognized and missing manufacturers', () => {
    expect(
      summarizeManufacturers([
        { manufacturer: 'SIEMENS' },
        { manufacturer: 'SIEMENS' },
        { manufacturer: null },
      ])
    ).toEqual({
      total: 3,
      recognized: 2,
      withoutManufacturer: 1,
      uniqueCount: 1,
      top: [{ manufacturer: 'SIEMENS', count: 2 }],
      positions: { unknown: 2 },
      confidence: { unknown: 2 },
    });
  });
});

describe('mergeImportConfig', () => {
  it('возвращает дефолты при пустом объекте', () => {
    const result = mergeImportConfig({});
    expect(result.suspiciousPriceStats.thresholdPercentile).toBe(0.99);
    expect(result.suspiciousPriceStats.thresholdMultiplier).toBe(3);
    expect(result.suspiciousPriceStats.minimumSamples).toBe(30);
    expect(result.classificationReport.productLimit).toBe(500);
    expect(result.suspiciousPriceThresholds).toEqual({});
  });

  it('переопределяет дефолты, оставляя нетронутые поля', () => {
    const result = mergeImportConfig({
      suspiciousPriceStats: { minimumSamples: 5 },
      suspiciousPriceThresholds: { м: 1000 },
    });
    expect(result.suspiciousPriceStats.minimumSamples).toBe(5);
    expect(result.suspiciousPriceStats.thresholdPercentile).toBe(0.99);
    expect(result.suspiciousPriceThresholds).toEqual({ м: 1000 });
  });
});

describe('import state parsing', () => {
  it('rejects a corrupt previous product file instead of treating it as empty', () => {
    expect(() => parsePreviousProducts('{broken')).toThrow(/products\.json/);
    expect(() => parsePreviousProducts('{"products":[]}')).toThrow(/массив/);
    expect(parsePreviousProducts('[{"id":1}]')).toEqual([{ id: 1 }]);
  });

  it('rejects malformed manual overrides instead of silently disabling them', () => {
    expect(() => parsePriceOverrides('{broken')).toThrow(/priceOverrides/);
    expect(() => parsePriceOverrides('{"overrides":[]}')).toThrow(/overrides/);
    expect(() => parsePriceOverrides('{"matchers":{}}')).toThrow(/matchers/);
    expect(parsePriceOverrides('{"overrides":{"A":{"price":10}}}')).toEqual({
      overrides: { A: { price: 10 } },
      matchers: [],
    });
  });

  it('rejects invalid price history instead of resetting thresholds silently', () => {
    expect(() => parseImportHistory('{broken')).toThrow(/истории импортов/);
    expect(() => parseImportHistory('{"imports":{}}')).toThrow(/массив/);
    expect(parseImportHistory('{"imports":[]}')).toEqual({
      version: 1,
      imports: [],
    });
  });
});

describe('normalizeMarkKey', () => {
  it('убирает пробелы и приводит к нижнему регистру', () => {
    expect(normalizeMarkKey('ВВГ нг(А) - LS')).toBe('ввгнг(а)-ls');
  });

  it('возвращает пустую строку для null/undefined', () => {
    expect(normalizeMarkKey(null)).toBe('');
    expect(normalizeMarkKey(undefined)).toBe('');
  });
});

describe('buildRegistryKeyMigrations', () => {
  it('не переносит ключ, который всё ещё принадлежит живой позиции', () => {
    const old = {
      name: 'МГТФ 1х0,035',
      mark: 'МГТФ',
      cores: 1,
      crossSection: 35,
      attributes: [],
    };
    const oldKey = 'мгтф|1|35|||||';
    const nextKey = 'мгтф|1|0.035|||||';
    const result = buildRegistryKeyMigrations(
      [old],
      new Set([oldKey, nextKey])
    );
    expect(result.migrations.size).toBe(0);
  });

  it('не меняет ключ только из-за повторного определения производителя', () => {
    const old = {
      name: 'НИКИ-КУВШЭмнг(А)-LS 7х(2х1)',
      mark: 'НИКИ-КУВШЭм',
      manufacturer: 'НИКИ',
      cores: 7,
      groupCores: 2,
      crossSection: 1,
      conductorConfiguration: '7х(2х1)',
      attributes: ['нг(А)-LS'],
    };
    const nextKey = 'ники-кувш|7|1||||ники|конфигурация:7х(2х1),нг(а)-ls,эм';
    expect(
      buildRegistryKeyMigrations([old], new Set([nextKey])).migrations.size
    ).toBe(0);
  });

  it('восстанавливает прежнее искажённое название по единственной исходной строке', () => {
    const old = {
      name: 'Греющий 25SHTL-LT-2-0270- 1х40',
      mark: 'Греющий 25SHTL-LT-2-0270-',
      cores: 1,
      crossSection: 40,
      attributes: [],
    };
    const current = {
      name: 'Греющий 25SHTL-LT-2-0270-040',
      sourceName: 'Греющий 25SHTL-LT-2-0270-040',
      mark: 'Греющий 25SHTL-LT-2-0270-040',
      attributes: [],
    };
    const nextKey = 'греющий 25shtl-lt-2-0270-040|||||||';
    expect(
      buildRegistryKeyMigrations([old], new Set([nextKey]), [current])
        .migrations.size
    ).toBe(1);
  });
  it('строит миграцию для суффикса, вынесенного из марки в attributes', () => {
    const previous = {
      name: 'КА9СПвПнг(А)-HF 1х120-1',
      fullName: 'КА9СПвПнг(А)-HF 1х120-1',
      mark: 'КА9СПвПнг(А)-HF',
      cores: 1,
      crossSection: 120,
      attributes: ['1'],
      unit: 'м',
      price: 100,
      stock: 1,
    };
    const newKey = 'ка9спвп|1|120|||||1,нг(а)-hf';

    const result = buildRegistryKeyMigrations([previous], new Set([newKey]));

    expect(result.ambiguous).toBe(0);
    expect(result.migrations.get('ка9спвпнг(а)-hf|1|120|||||1')).toBe(newKey);
  });
});

describe('source parsing boundaries', () => {
  it.each([
    'Зажим анкерный РА 25 2х16-4х25',
    'Клемма 3х(1,5-2,5)х1 пол.DKC В273/3',
    'Щит ЩУ 1/1-1 IP54 (310х300х150)мет',
  ])('исключает некабельную строку до разбора характеристик: %s', (name) => {
    const record = createProductRecord(
      { name, unit: 'шт', price: 10, stock: 1 },
      'Без категории'
    );
    expect(record).toEqual({ type: 'excluded' });
  });

  it('сравнивает переименование по стабильному ID', () => {
    const before = { id: 42, name: 'ВВГнгLS 3х1', price: 10, stock: 1 };
    const after = { ...before, name: 'ВВГнг-LS 3х1' };
    expect(buildDiff([before], [after])).toMatchObject({
      added: [],
      removed: [],
      priceChanged: [],
      stockChanged: [],
    });
  });
  it('отличает переименование семейства от смены раздела каталога', () => {
    const before = {
      id: 42,
      name: 'КГ хл 3х1',
      category: 'Кабель КГ хл',
      catalogCategory: 'Гибкий кабель',
    };
    const after = { ...before, category: 'Кабель КГ' };
    expect(buildDiff([before], [after]).categoryChanged).toEqual([]);
    expect(
      buildDiff([before], [{ ...after, catalogCategory: 'Контрольный кабель' }])
        .categoryChanged
    ).toEqual([
      {
        name: before.name,
        categoryBefore: 'Гибкий кабель',
        categoryAfter: 'Контрольный кабель',
      },
    ]);
  });
});

describe('download price limits', () => {
  it('applies the configured byte limit to local and remote source buffers', () => {
    expect(() => assertPriceBufferWithinLimit(5, 'price.xls', 5)).not.toThrow();
    expect(() => assertPriceBufferWithinLimit(6, 'price.xls', 5)).toThrow(
      /размер файла.*лимит/iu
    );
  });

  it('parsePriceDownloadMaxBytes возвращает разумный дефолт для пустых и невалидных значений', () => {
    expect(parsePriceDownloadMaxBytes()).toBe(DEFAULT_PRICE_DOWNLOAD_MAX_BYTES);
    expect(parsePriceDownloadMaxBytes('')).toBe(
      DEFAULT_PRICE_DOWNLOAD_MAX_BYTES
    );
    expect(parsePriceDownloadMaxBytes('wrong')).toBe(
      DEFAULT_PRICE_DOWNLOAD_MAX_BYTES
    );
    expect(parsePriceDownloadMaxBytes('-1')).toBe(
      DEFAULT_PRICE_DOWNLOAD_MAX_BYTES
    );
    expect(parsePriceDownloadMaxBytes('123.9')).toBe(123);
  });

  it('падает с понятной ошибкой на пустом скачанном файле', async () => {
    await expect(
      fetchPriceWithTimeout('https://example.test/price.xls', 1000, {
        maxBytes: 10,
        fetchImpl: async () => new Response(new Uint8Array()),
      })
    ).rejects.toThrow(/Скачанный файл пустой/);
  });

  it('падает до чтения тела, если Content-Length превышает лимит', async () => {
    let bodyRead = false;
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '6' }),
      get body() {
        bodyRead = true;
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        });
      },
    };

    await expect(
      fetchPriceWithTimeout('https://example.test/price.xls', 1000, {
        maxBytes: 5,
        fetchImpl: async () => response,
      })
    ).rejects.toThrow(/Content-Length.*лимит/);
    expect(bodyRead).toBe(false);
  });

  it('прерывает streaming-чтение, если тело превысило лимит', async () => {
    let signal;

    await expect(
      fetchPriceWithTimeout('https://example.test/price.xls', 1000, {
        maxBytes: 5,
        fetchImpl: async (_url, options) => {
          signal = options.signal;
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.close();
              },
            })
          );
        },
      })
    ).rejects.toThrow(/скачано.*лимит/);
    expect(signal.aborted).toBe(true);
  });

  it('не следует редиректу прайса на другой хост', async () => {
    const requestedUrls = [];
    let caughtError;
    try {
      await fetchPriceWithTimeout('https://example.test/price.xls', 1000, {
        fetchImpl: async (url) => {
          requestedUrls.push(url);
          return new Response(null, {
            status: 302,
            headers: {
              location: 'http://127.0.0.1/private.xls?token=do-not-log',
            },
          });
        },
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError?.message).toMatch(/исходном хосте/);
    expect(caughtError?.message).not.toContain('do-not-log');
    expect(requestedUrls).toEqual(['https://example.test/price.xls']);
  });
});

describe('remote price source resolution', () => {
  it('оставляет прямой xls URL без изменений', async () => {
    await expect(
      resolveRemotePriceUrl('https://example.test/upload/price.xls', 1000)
    ).resolves.toBe('https://example.test/upload/price.xls');
  });

  it('извлекает xlsx-ссылку со страницы прайса', () => {
    const html = `
      <html>
        <body>
          <a href="/upload/archive.xls">Архив</a>
          <section>
            <a class="download" href="/upload/today-price.xlsx">Скачать прайс-лист</a>
          </section>
        </body>
      </html>
    `;

    expect(
      extractSpreadsheetUrlFromHtml(html, 'https://example.test/price/')
    ).toBe('https://example.test/upload/today-price.xlsx');
  });

  it('разрешает относительные ссылки и HTML entities', async () => {
    const html = `
      <a href="/upload/price.xlsx?token=abc&amp;download=1">Прайс</a>
    `;

    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () =>
          new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
      })
    ).resolves.toBe(
      'https://example.test/upload/price.xlsx?token=abc&download=1'
    );
  });

  it('игнорирует Excel-ссылки на другой хост', async () => {
    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () =>
          new Response(
            '<a href="http://127.0.0.1/private.xls">Скачать прайс</a>'
          ),
      })
    ).rejects.toThrow(/не найдена ссылка на \.xls\/\.xlsx/i);
  });

  it('ограничивает размер HTML-страницы источника', async () => {
    let bodyRead = false;
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(2 * 1024 * 1024 + 1) }),
      get body() {
        bodyRead = true;
        return new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
      },
    };

    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () => response,
      })
    ).rejects.toThrow(/Content-Length.*лимит/);
    expect(bodyRead).toBe(false);
  });

  it('следует редиректу на том же хосте', async () => {
    let requestCount = 0;
    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return new Response(null, {
              status: 302,
              headers: { location: '/today/' },
            });
          }
          return new Response('<a href="/files/price.xls">Скачать прайс</a>');
        },
      })
    ).resolves.toBe('https://example.test/files/price.xls');
    expect(requestCount).toBe(2);
  });

  it('разрешает относительную Excel-ссылку относительно конечной страницы после редиректа', async () => {
    let requestCount = 0;
    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return new Response(null, {
              status: 302,
              headers: { location: '/published/current/' },
            });
          }
          return new Response('<a href="today.xls">Скачать прайс</a>');
        },
      })
    ).resolves.toBe('https://example.test/published/current/today.xls');
  });

  it('падает с понятной ошибкой, если на странице нет Excel-ссылки', async () => {
    await expect(
      resolveRemotePriceUrl('https://example.test/price/', 1000, {
        fetchImpl: async () =>
          new Response('<html><a href="/docs/file.pdf">PDF</a></html>'),
      })
    ).rejects.toThrow(/не найдена ссылка на \.xls\/\.xlsx/i);
  });
});

describe('workbook resource limits', () => {
  it('rejects sheets whose original row range exceeds the import cap', () => {
    const xlsx = {
      utils: {
        decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 100_000, c: 8 } }),
      },
    };
    expect(() =>
      assertWorksheetWithinRowLimit({ '!fullref': 'A1:I100001' }, xlsx)
    ).toThrow(/лимиту безопасности/);
  });

  it('accepts normal sheets and exposes a conservative row cap', () => {
    const xlsx = {
      utils: {
        decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 99_999, c: 8 } }),
      },
    };
    expect(MAX_PRICE_WORKSHEET_ROWS).toBe(100_000);
    expect(() =>
      assertWorksheetWithinRowLimit({ '!fullref': 'A1:I100000' }, xlsx)
    ).not.toThrow();
    expect(() => assertWorksheetWithinRowLimit({}, xlsx)).not.toThrow();
  });
});

describe('isHeaderRow', () => {
  it('распознаёт строку с заголовком', () => {
    expect(isHeaderRow(['Наименование', 'Ед.изм', 'Цена', 'Остаток'])).toBe(
      true
    );
    expect(isHeaderRow(['', 'Цена', '', 'Остаток'])).toBe(true);
  });

  it('возвращает false для обычной строки товара', () => {
    expect(isHeaderRow(['ВВГ 3х2.5', 'м', '120', '500'])).toBe(false);
  });
});

describe('isCategoryRow', () => {
  it('считает строки без цифр и длиной >2 категориями', () => {
    expect(isCategoryRow('Силовые кабели')).toBe(true);
  });

  it('отвергает короткие строки', () => {
    expect(isCategoryRow('А')).toBe(false);
    expect(isCategoryRow('')).toBe(false);
  });

  it('отвергает строки с цифрами', () => {
    expect(isCategoryRow('Кабель 1кВ')).toBe(false);
  });
});

describe('looksLikeCategoryHeading', () => {
  it('считает заголовком строки с буквами и >=3 символов', () => {
    expect(looksLikeCategoryHeading('Кабель КВПЭфВП-5е')).toBe(true);
    expect(looksLikeCategoryHeading('Силовые')).toBe(true);
  });

  it('отвергает короткие и без букв', () => {
    expect(looksLikeCategoryHeading('12')).toBe(false);
    expect(looksLikeCategoryHeading('123456')).toBe(false);
  });

  it('отвергает строки-хвосты прайса', () => {
    expect(looksLikeCategoryHeading('ИНН 1234567890')).toBe(false);
  });
});

describe('isServiceRow', () => {
  it('распознаёт реквизитные строки', () => {
    expect(isServiceRow(['ООО ЮжУралЭлектроКабель'])).toBe(true);
    expect(isServiceRow(['', 'ИНН 7451111111'])).toBe(true);
    expect(isServiceRow(['Телефон', '+7 351'])).toBe(true);
    expect(isServiceRow(['Цены действительны'])).toBe(true);
  });

  it('возвращает false для обычной строки', () => {
    expect(isServiceRow(['ВВГ 3х2.5', 'м', '120', '500'])).toBe(false);
  });
});

describe('detectSchema', () => {
  it('собирает токены заголовков и считает блоки', () => {
    const rows = [
      ['Прайс-лист'],
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
      ['ВВГ 3х2.5', 'м', '120', '500'],
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
      ['АВВГ 4х6', 'м', '320', '1000'],
    ];
    const schema = detectSchema(rows);
    expect(schema.headerRowsFound).toBe(2);
    expect(schema.detectedHeaders).toEqual(
      expect.arrayContaining(['наименование', 'ед.изм', 'цена', 'остаток'])
    );
    expect(schema.missingHeaders).toEqual([]);
  });

  it('сообщает о недостающих токенах', () => {
    const rows = [['Наименование', 'Цена']];
    const schema = detectSchema(rows);
    expect(schema.missingHeaders).toEqual(
      expect.arrayContaining(['ед.изм', 'остаток'])
    );
  });
});

describe('splitRowsIntoBlocks / buildBookReadingOrder', () => {
  it('режет rows на блоки по заголовкам и упорядочивает по book-pattern', () => {
    const rows = [
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'], // 0
      ['A', '', '', '', '', 'B', '', '', ''], // 1
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'], // 2
      ['C', '', '', '', '', 'D', '', '', ''], // 3
    ];
    const blocks = splitRowsIntoBlocks(rows);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].rows).toHaveLength(1);
    expect(blocks[0].rows[0].rowIndex).toBe(1);

    const ordered = buildBookReadingOrder(blocks);
    // 4 страницы: top right, top left, bottom left, bottom right
    expect(ordered.map((p) => p.side)).toEqual([
      'right',
      'left',
      'left',
      'right',
    ]);
    expect(ordered[0].blockIndex).toBe(0);
    expect(ordered[2].blockIndex).toBe(1);
  });

  it('возвращает пустой ordered, если нет блоков', () => {
    expect(buildBookReadingOrder([])).toEqual([]);
  });
});

describe('pickPageCells', () => {
  it('выбирает левые колонки [0..3]', () => {
    const row = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    expect(pickPageCells(row, 'left')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('выбирает правые колонки [5..8]', () => {
    const row = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    expect(pickPageCells(row, 'right')).toEqual(['F', 'G', 'H', 'I']);
  });

  it('тримит и подменяет null/undefined пустой строкой', () => {
    expect(pickPageCells([null, '  X  ', undefined, ''], 'left')).toEqual([
      '',
      'X',
      '',
      '',
    ]);
  });
});

describe('parsePageRow / createProductRecord', () => {
  it('возвращает null для пустой страницы', () => {
    expect(parsePageRow(['', '', '', ''], [], 'cat')).toBeNull();
  });

  it('возвращает явный тип header/service строки', () => {
    expect(
      parsePageRow(['Наименование', 'Ед.изм', 'Цена', 'Остаток'], [], 'cat')
    ).toEqual({ type: 'header' });
    expect(parsePageRow(['ИНН 123', '', '', ''], [], 'cat')).toEqual({
      type: 'service',
    });
  });

  it('помечает нераспознанную строку как invalid с исходными данными', () => {
    expect(parsePageRow(['12345'], ['12345'], 'cat', 8)).toMatchObject({
      type: 'invalid',
      value: {
        rowIndex: 8,
        category: 'cat',
        reason: expect.stringMatching(/распознать/i),
      },
    });
  });

  it('создаёт product при валидных 4 ячейках', () => {
    const result = parsePageRow(
      ['ВВГнг(А)-LS 3х2.5', 'м', '120', '500'],
      [],
      'Силовые'
    );
    expect(result?.type).toBe('product');
    expect(result?.value.price).toBeGreaterThan(0);
    expect(result?.value.stock).toBe(500);
    expect(result?.value.category).toBe('Силовые');
  });

  it('skip с причиной при отсутствии цены', () => {
    const result = createProductRecord(
      { name: 'ВВГ 3х2.5', unit: 'м', price: 0, stock: 100 },
      'cat',
      [],
      7
    );
    expect(result.type).toBe('skip');
    expect(result.value.reason).toMatch(/цен/i);
    expect(result.value.rowIndex).toBe(7);
  });

  it('skip при нулевом остатке', () => {
    const result = createProductRecord(
      { name: 'ВВГ 3х2.5', unit: 'м', price: 100, stock: 0 },
      'cat'
    );
    expect(result.type).toBe('skip');
    expect(result.value.reason).toMatch(/остат/i);
  });

  it('skip при пустом наименовании после нормализации', () => {
    const result = createProductRecord(
      { name: '', unit: 'м', price: 100, stock: 10 },
      'cat'
    );
    expect(result.type).toBe('skip');
    expect(result.value.reason).toMatch(/наимен/i);
  });

  it('публикует неизвестную строку в метрах по fallback-правилу', () => {
    const result = createProductRecord(
      { name: 'Неизвестная марка', unit: 'м', price: 100, stock: 10 },
      'Без категории',
      ['Неизвестная марка', 'м', '100', '10'],
      12
    );
    expect(result.type).toBe('product');
    expect(result.value.name).toContain('Неизвестная марка');
    expect(result.value).toMatchObject({
      importDisposition: 'publish',
      dispositionReason: 'unit_meter_fallback',
      dispositionEvidence: 'м',
    });
    expect(result.review).toBeUndefined();
  });

  it('сохраняет товар с неоднозначным производителем и направляет его на review', () => {
    const result = createProductRecord(
      { name: 'LAPPKABEL товар HELUKABEL', unit: 'м', price: 100, stock: 10 },
      'Кабель силовой',
      [],
      20
    );
    expect(result.type).toBe('product');
    expect(result.value.manufacturer).toBeNull();
    expect(result.review.reason).toMatch(/производител/i);
  });
});

describe('productKey', () => {
  it('предпочитает fullName и нормализует регистр/пробелы', () => {
    expect(productKey({ fullName: '  ВВГ 3х2.5  ', name: 'X' })).toBe(
      'ввг 3х2.5'
    );
  });

  it('падает на name, если fullName нет', () => {
    expect(productKey({ name: 'АВВГ' })).toBe('аввг');
  });

  it('возвращает пустую строку, если нет ни того ни другого', () => {
    expect(productKey({})).toBe('');
    expect(productKey(null)).toBe('');
  });
});

describe('buildDiff', () => {
  const prev = [
    { fullName: 'A', name: 'A', category: 'Cat1', price: 100, stock: 10 },
    { fullName: 'B', name: 'B', category: 'Cat1', price: 200, stock: 5 },
    { fullName: 'C', name: 'C', category: 'Cat1', price: 50, stock: 20 },
  ];
  const curr = [
    { fullName: 'A', name: 'A', category: 'Cat1', price: 100, stock: 10 }, // без изменений
    { fullName: 'B', name: 'B', category: 'Cat2', price: 210, stock: 5 }, // цена + категория
    { fullName: 'D', name: 'D', category: 'Cat1', price: 75, stock: 3 }, // новый
  ];

  it('находит added/removed', () => {
    const diff = buildDiff(prev, curr);
    expect(diff.added.map((p) => p.name)).toEqual(['D']);
    expect(diff.removed.map((p) => p.name)).toEqual(['C']);
  });

  it('фиксирует изменение цены и считает deltaPercent', () => {
    const diff = buildDiff(prev, curr);
    expect(diff.priceChanged).toHaveLength(1);
    expect(diff.priceChanged[0].priceBefore).toBe(200);
    expect(diff.priceChanged[0].priceAfter).toBe(210);
    expect(diff.priceChanged[0].deltaPercent).toBe(5);
  });

  it('помещает в priceAlerts только скачки ≥50%', () => {
    const diff = buildDiff(
      [{ fullName: 'X', name: 'X', price: 100, stock: 1 }],
      [{ fullName: 'X', name: 'X', price: 200, stock: 1 }]
    );
    expect(diff.priceAlerts).toHaveLength(1);
    expect(diff.priceAlerts[0].deltaPercent).toBe(100);
  });

  it('не помещает в priceAlerts мелкое изменение', () => {
    const diff = buildDiff(prev, curr);
    expect(diff.priceAlerts).toHaveLength(0);
  });

  it('сортирует priceAlerts по убыванию модуля', () => {
    const diff = buildDiff(
      [
        { fullName: 'A', name: 'A', price: 100, stock: 1 },
        { fullName: 'B', name: 'B', price: 100, stock: 1 },
      ],
      [
        { fullName: 'A', name: 'A', price: 160, stock: 1 }, // +60%
        { fullName: 'B', name: 'B', price: 250, stock: 1 }, // +150%
      ]
    );
    expect(diff.priceAlerts.map((a) => a.name)).toEqual(['B', 'A']);
  });

  it('фиксирует смену категории', () => {
    const diff = buildDiff(prev, curr);
    expect(diff.categoryChanged).toHaveLength(1);
    expect(diff.categoryChanged[0].name).toBe('B');
    expect(diff.categoryChanged[0].categoryAfter).toBe('Cat2');
  });
});

describe('percentile / roundNullable / toPositiveNumber', () => {
  it('percentile интерполирует между значениями', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 1)).toBe(5);
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 0.25)).toBe(2);
  });

  it('percentile возвращает null для пустого массива', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile(null, 0.5)).toBeNull();
  });

  it('percentile зажимает p в [0, 1]', () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });

  it('roundNullable возвращает null для NaN/Infinity', () => {
    expect(roundNullable(NaN)).toBeNull();
    expect(roundNullable(Infinity)).toBeNull();
  });

  it('roundNullable округляет до digits', () => {
    expect(roundNullable(1.23456, 2)).toBe(1.23);
    expect(roundNullable(1.23456, 3)).toBe(1.235);
  });

  it('toPositiveNumber возвращает null для нуля и отрицательных', () => {
    expect(toPositiveNumber(0)).toBeNull();
    expect(toPositiveNumber(-5)).toBeNull();
    expect(toPositiveNumber('abc')).toBeNull();
    expect(toPositiveNumber(7.5)).toBe(7.5);
  });
});

describe('normalizeImportHistory / buildHistorySnapshot', () => {
  it('normalizeImportHistory отсеивает невалидные элементы', () => {
    const result = normalizeImportHistory({
      imports: [{ ok: 1 }, null, 'wrong', { ok: 2 }],
    });
    expect(result.version).toBe(1);
    expect(result.imports).toHaveLength(2);
  });

  it('normalizeImportHistory отдаёт пустой массив при отсутствии imports', () => {
    expect(normalizeImportHistory({}).imports).toEqual([]);
  });

  it('buildHistorySnapshot группирует и сортирует цены по unit', () => {
    const snapshot = buildHistorySnapshot(
      [
        { unit: 'м', price: 100 },
        { unit: 'м', price: 50 },
        { unit: 'шт', price: 200 },
        { unit: '', price: 999 }, // skip — пустой unit
        { unit: 'м', price: 0 }, // skip — нулевая цена
      ],
      { generatedAt: '2026-01-01', sourceFile: 'price.xls' }
    );
    expect(snapshot.productsImported).toBe(5);
    expect(snapshot.unitPrices.м).toEqual([50, 100]);
    expect(snapshot.unitPrices.шт).toEqual([200]);
  });

  it('сохраняет источник прайса в истории импорта отдельно от локального файла', () => {
    const snapshot = buildHistorySnapshot([{ unit: 'м', price: 100 }], {
      generatedAt: '2026-01-01',
      sourceFile: 'data/price.xls',
      sourceUrl: 'https://example.test/price.xls',
      source: {
        kind: 'remote',
        requestedUrl: 'https://example.test/price.xls',
        downloadUrl: 'https://example.test/price.xls',
        sha256: 'a'.repeat(64),
        sizeBytes: 100,
      },
    });

    expect(snapshot).toMatchObject({
      sourceFile: 'data/price.xls',
      sourceUrl: 'https://example.test/price.xls',
      source: { sha256: 'a'.repeat(64), sizeBytes: 100 },
    });
  });

  it('getHistoricalSnapshots возвращает history.imports когда они есть', () => {
    const history = { imports: [{ a: 1 }] };
    expect(getHistoricalSnapshots(history, [], 'x')).toEqual([{ a: 1 }]);
  });

  it('getHistoricalSnapshots строит snapshot из previousProducts при пустой истории', () => {
    const result = getHistoricalSnapshots(
      { imports: [] },
      [{ unit: 'м', price: 100 }],
      'price.xls'
    );
    expect(result).toHaveLength(1);
    expect(result[0].sourceFile).toBe('price.xls');
    expect(result[0].unitPrices.м).toEqual([100]);
  });

  it('getHistoricalSnapshots возвращает [] при пустой истории и без предыдущих', () => {
    expect(getHistoricalSnapshots({ imports: [] }, [], 'x')).toEqual([]);
  });
});

describe('buildSuspiciousPriceStats', () => {
  const config = mergeImportConfig({
    suspiciousPriceStats: {
      minimumSamples: 3,
      thresholdPercentile: 0.99,
      thresholdMultiplier: 2,
    },
    suspiciousPriceThresholds: { шт: 5000 },
  });

  it('строит порог из истории при достаточной выборке', () => {
    const snapshots = [
      { unitPrices: { м: [100, 200, 300] } },
      { unitPrices: { м: [400] } }, // склеится в общий массив
    ];
    const stats = buildSuspiciousPriceStats(config, snapshots);
    expect(stats.byUnit.м.source).toBe('history');
    // p99 ≈ 400, multiplier 2 → 800
    expect(stats.byUnit.м.threshold).toBeGreaterThan(0);
    expect(stats.byUnit.м.count).toBe(4);
  });

  it('падает на configured fallback при недостаточной выборке', () => {
    const snapshots = [{ unitPrices: { шт: [10] } }];
    const stats = buildSuspiciousPriceStats(config, snapshots);
    expect(stats.byUnit.шт.source).toBe('config');
    expect(stats.byUnit.шт.threshold).toBe(5000);
  });

  it('минимальная выборка считается по самому большому импорту', () => {
    // суммарно 4, но в одном импорте максимум 2 → меньше minimumSamples=3
    const snapshots = [
      { unitPrices: { м: [10, 20] } },
      { unitPrices: { м: [30, 40] } },
    ];
    const stats = buildSuspiciousPriceStats(config, snapshots);
    expect(stats.byUnit.м.maxImportSamples).toBe(2);
    expect(stats.byUnit.м.source).toBe('config');
  });
});

describe('detectSuspicious / formatThresholdSource', () => {
  it('собирает причины: пустой unit, нулевая цена, превышение порога', () => {
    const priceStats = {
      byUnit: {
        м: {
          threshold: 500,
          source: 'history',
          thresholdPercentile: 0.99,
          thresholdMultiplier: 2,
        },
      },
    };
    const issues = detectSuspicious(
      [
        { name: 'A', unit: 'м', price: 100, stock: 1 }, // ok
        { name: 'B', unit: '', price: 100, stock: 1 }, // нет unit
        { name: 'C', unit: 'м', price: 0, stock: 1 }, // нет цены
        { name: 'D', unit: 'м', price: 9999, stock: 1 }, // > порога
        { name: 'E', unit: 'м', price: 1_000_000, stock: 1 }, // круглая
      ],
      priceStats
    );

    expect(issues.map((i) => i.name)).toEqual(['B', 'C', 'D', 'E']);
    expect(issues[0].reasons[0]).toMatch(/единиц/i);
    expect(issues[1].reasons[0]).toMatch(/цен/i);
    expect(issues[2].reasons[0]).toMatch(/превышает порог/i);
    // у E два reasons — порог + круглая
    expect(issues[3].reasons.some((r) => /круглая/i.test(r))).toBe(true);
  });

  it('formatThresholdSource описывает источник порога', () => {
    expect(
      formatThresholdSource({
        source: 'history',
        thresholdPercentile: 0.99,
        thresholdMultiplier: 3,
      })
    ).toBe('p99 × 3 по истории');
    expect(formatThresholdSource({ source: 'config' })).toBe(
      'importConfig.json'
    );
  });
});

describe('buildRedirectsNginxConf', () => {
  it('генерирует location-блоки, отсортированные по oldSlug', () => {
    const conf = buildRedirectsNginxConf({
      'old-b': 'new-b',
      'old-a': 'new-a',
    });
    const lines = conf
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('location'));
    expect(lines).toEqual([
      'location = /product/old-a { return 301 /product/new-a; }',
      'location = /product/old-b { return 301 /product/new-b; }',
    ]);
  });

  it('пустой map → только заголовок-комментарий, без location', () => {
    const conf = buildRedirectsNginxConf({});
    expect(conf).not.toMatch(/location/);
    expect(conf).toMatch(/^#/);
  });

  it('отбрасывает slugи с небезопасными символами и попытками директив', () => {
    const conf = buildRedirectsNginxConf({
      'safe-slug': 'new-1',
      'evil slug; }': 'broken',
      'with/slash': 'broken',
      'inject-include': 'new; include /etc/nginx/nginx.conf',
      'inject-return': 'new } return 200 hacked',
    });
    expect(conf).toContain('/product/safe-slug');
    expect(conf).not.toContain('evil');
    expect(conf).not.toContain('slash');
    expect(conf).not.toContain('include /etc/nginx');
    expect(conf).not.toContain('hacked');
    expect(conf).not.toContain('inject-include');
    expect(conf).not.toContain('inject-return');
  });
});

describe('summarizeSkips / summarizeByCategory', () => {
  it('summarizeSkips группирует по reason', () => {
    expect(
      summarizeSkips([{ reason: 'A' }, { reason: 'A' }, { reason: 'B' }, {}])
    ).toEqual({ A: 2, B: 1, 'Без причины': 1 });
  });

  it('summarizeByCategory считает товары по категории и сортирует по убыванию', () => {
    const result = summarizeByCategory([
      { category: 'X' },
      { category: 'X' },
      { category: 'Y' },
      {},
    ]);
    expect(result).toEqual({ X: 2, Y: 1, 'Без категории': 1 });
    // Сортировка: первый ключ — самый частый
    expect(Object.keys(result)[0]).toBe('X');
  });
});
