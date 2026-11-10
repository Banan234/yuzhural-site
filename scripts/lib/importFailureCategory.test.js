import { expect, it } from 'vitest';
import { classifyImportFailure } from './importFailureCategory.js';
it.each([
  ['UND_ERR_BODY_TIMEOUT', 'download_body_timeout'],
  ['UND_ERR_HEADERS_TIMEOUT', 'download_headers_timeout'],
  ['UND_ERR_RES_CONTENT_LENGTH_MISMATCH', 'download_incomplete'],
  ['Z_DATA_ERROR: incorrect header check', 'download_compression'],
  ['File is password-protected', 'workbook_password'],
  ['Cannot find file xl/workbook.xml in zip', 'workbook_corrupt'],
  ['Unsupported ZIP Compression method 99', 'workbook_compression'],
  [
    'Не найден ни один заголовок таблицы (наименование/ед.изм/цена/остаток). Возможно, изменилась структура прайса.',
    'schema_headers_missing',
  ],
  [
    'В заголовках прайса не найдены обязательные колонки: цена, остаток. Проверь структуру файла.',
    'schema_columns_missing',
  ],
  [
    'Нет ни корректных, ни известных изолированных карточек; пустой выпуск не устанавливается.',
    'catalog_empty',
  ],
  ['Неполный шаблон прайса: xl/worksheets/sheet1.xml', 'buyer_price_template'],
  ['Некорректные коммерческие данные для прайса: 12345', 'buyer_price_values'],
  [
    'Не удалось прочитать шаблон runtime-prerender карточек товара: ENOENT',
    'prerender_template',
  ],
  [
    'Runtime prerender записал 10 HTML, но полный набор карточек требует 20 HTML.',
    'prerender_coverage',
  ],

  ['Не задан URL удалённого прайса', 'source_config'],
  [
    'Ссылка прайса должна оставаться на исходном хосте (example.test)',
    'source_redirect_policy',
  ],
  ['Редирект источника прайса без заголовка Location', 'source_redirect'],
  ['Прайс по URL example.test слишком большой', 'source_too_large'],
  ['Скачанный файл пустой', 'source_empty'],
  [
    'На странице example.test не найдена ссылка на .xls/.xlsx прайс',
    'source_link_missing',
  ],
  ['В Excel-файле нет листов', 'worksheet_empty'],
  ['В листе прайса больше 100000 строк', 'worksheet_row_limit'],
  ['Некорректный JSON priceOverrides.json', 'overrides_invalid'],
  ['Не удалось прочитать историю импортов', 'catalog_history'],
  [
    'CATALOG_PRODUCTS_FILE должен указывать внутрь общего выпуска',
    'runtime_paths',
  ],
  ['Пакет "@e965/xlsx" не установлен', 'dependency_missing'],
  ['Неизолированная ошибочная строка в выпуске.', 'unsafe_product'],
  ['Импортировано 30 исходных позиций, минимум 100.', 'guard_min_products'],
  ['Удалено 50% каталога, допустимо не более 5%.', 'guard_removed'],
  ['Проверка публикации прайса не пройдена.', 'publish_guard'],
  ['EBUSY', 'file_busy'],
  ['EMFILE', 'file_descriptors'],
  ['EROFS', 'read_only'],
  ['JavaScript heap out of memory', 'memory_limit'],
  ['HTTP 408', 'http_timeout'],
  ['HTTP 410', 'http_gone'],

  ['fetch failed (UND_ERR_CONNECT_TIMEOUT)', 'connection_timeout'],
  ['fetch failed (EAI_AGAIN)', 'dns'],
  ['connect EHOSTUNREACH 2a02::1', 'network_unreachable'],
  ['HTTP 429', 'http_rate_limit'],
  ['HTTP 503', 'http_server'],
  ['HTTP 403', 'http_access'],
  ['HTTP 404', 'http_not_found'],
  ['Превышено общее время импорта (900 секунд)', 'import_timeout'],
  ['timeout 60000ms', 'download_timeout'],
  ['ENOSPC', 'disk_space'],
  ['EACCES', 'file_access'],
  ['Incomplete catalog SSR: /catalog/', 'catalog_render'],
  ['fetch failed', 'network'],
  ['Unexpected new problem', 'unknown'],
])('classifies %s without losing the original report', (message, code) => {
  const report = { message };
  expect(classifyImportFailure(report).code).toBe(code);
  expect(report.message).toBe(message);
});
it('does not assert that a timeout proves computer sleep', () => {
  expect(
    classifyImportFailure({ message: 'timeout 60000ms' }).title
  ).not.toContain('сон');
});

it('finds a specific schema error inside a generic publication guard message', () => {
  expect(
    classifyImportFailure({
      message:
        'Проверка публикации прайса не пройдена. Ошибки источника/структуры: В заголовках прайса не найдены обязательные колонки: цена.',
    }).code
  ).toBe('schema_columns_missing');
});
it('does not treat a price warning as a failed import category', () => {
  expect(
    classifyImportFailure({
      message: 'Резких изменений цен: 120, порог предупреждения 100.',
    }).code
  ).toBe('unknown');
});
