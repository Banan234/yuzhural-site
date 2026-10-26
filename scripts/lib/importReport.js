// Формирование HTML-отчёта импорта без побочных эффектов записи.

import path from 'node:path';
import {
  PRICE_JUMP_ALERT_PERCENT,
  formatThresholdSource,
} from './priceImportComparison.js';

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
});

const reportDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Yekaterinburg',
});

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return numberFormatter.format(number);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return `${formatNumber(value)} ₽`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return `${number > 0 ? '+' : ''}${numberFormatter.format(number)}%`;
}

function formatReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return `${reportDateFormatter.format(date)} (Екатеринбург)`;
}

function deltaClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return '';
  }

  return number > 0 ? 'positive' : 'negative';
}

function renderTable(rows, columns, emptyMessage, rowClass = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const className = rowClass ? rowClass(row) : '';
              const classAttribute = className
                ? ` class="${escapeHtml(className)}"`
                : '';

              return `
                <tr${classAttribute}>
                  ${columns
                    .map((column) => {
                      const value = column.render
                        ? column.render(row)
                        : escapeHtml(row[column.key]);

                      return `<td data-label="${escapeHtml(column.label)}">${value}</td>`;
                    })
                    .join('')}
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return '—';
  }

  return reasons.map((reason) => escapeHtml(reason)).join('<br>');
}

function renderExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return '—';
  }

  return examples
    .slice(0, 3)
    .map((example) => escapeHtml(example.name))
    .join('<br>');
}

function renderReportTabs(report, alertPercent) {
  const diff = report.diff || {};
  const summary = report.summary || {};
  const fallbackToOther = report.classification?.fallbackToOther || {};
  const priceRows = [...(diff.priceChanged || [])].sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );
  const priceAlertRows = (
    diff.priceAlerts?.length
      ? [...diff.priceAlerts]
      : priceRows.filter(
          (row) => Math.abs(Number(row.deltaPercent) || 0) >= alertPercent
        )
  ).sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );

  const productColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Цена', render: (row) => formatMoney(row.price) },
    { label: 'Остаток', render: (row) => formatNumber(row.stock) },
  ];
  const priceColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Было', render: (row) => formatMoney(row.priceBefore) },
    { label: 'Стало', render: (row) => formatMoney(row.priceAfter) },
    {
      label: 'Изменение',
      render: (row) =>
        `<span class="delta ${deltaClass(row.deltaPercent)}">${formatPercent(row.deltaPercent)}</span>`,
    },
  ];
  const tabs = [
    {
      id: 'added',
      label: 'Добавлено',
      count: summary.added ?? diff.added?.length ?? 0,
      content: renderTable(diff.added, productColumns, 'Новых позиций нет.'),
    },
    {
      id: 'removed',
      label: 'Удалено',
      count: summary.removed ?? diff.removed?.length ?? 0,
      content: renderTable(
        diff.removed,
        productColumns,
        'Удалённых позиций нет.'
      ),
    },
    {
      id: 'prices',
      label: `Цены ±${alertPercent}%`,
      count: summary.priceAlerts ?? priceAlertRows.length,
      content: `
        <p class="panel-note">
          Порог резкого изменения: ${formatNumber(alertPercent)}%.
          Всего изменённых цен: ${formatNumber(summary.priceChanged ?? priceRows.length)}.
        </p>
        ${renderTable(priceAlertRows, priceColumns, `Изменений цен на ±${alertPercent}% и больше нет.`)}
        ${
          priceRows.length > priceAlertRows.length
            ? `<details class="details-block">
                <summary>Все изменения цен (${formatNumber(priceRows.length)})</summary>
                ${renderTable(priceRows, priceColumns, 'Изменённых цен нет.')}
              </details>`
            : ''
        }
      `,
    },
    {
      id: 'suspicious',
      label: 'Подозрительные',
      count: summary.suspicious ?? report.suspicious?.length ?? 0,
      content: renderTable(
        report.suspicious,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { key: 'unit', label: 'Ед.' },
          { label: 'Цена', render: (row) => formatMoney(row.price) },
          { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          { label: 'Причина', render: (row) => renderReasons(row.reasons) },
        ],
        'Подозрительных цен нет.'
      ),
    },
    {
      id: 'categories',
      label: 'Смена категорий',
      count: summary.categoryChanged ?? diff.categoryChanged?.length ?? 0,
      content: renderTable(
        diff.categoryChanged,
        [
          { key: 'name', label: 'Наименование' },
          {
            label: 'Было',
            render: (row) =>
              escapeHtml(row.locationBefore || row.categoryBefore),
          },
          {
            label: 'Стало',
            render: (row) => escapeHtml(row.locationAfter || row.categoryAfter),
          },
        ],
        'Смен категорий нет.'
      ),
    },
    {
      id: 'unclassified',
      label: 'Прочее',
      count: fallbackToOther.count ?? 0,
      content: `
        <p class="panel-note">
          Позиции, которые не подошли ни под одно правило и ушли в fallback «Прочее».
          ${
            fallbackToOther.truncated
              ? `Показаны первые ${formatNumber(fallbackToOther.productLimit)}, скрыто ${formatNumber(fallbackToOther.truncated)}.`
              : ''
          }
        </p>
        <h2>Частые нераспознанные префиксы</h2>
        ${renderTable(
          fallbackToOther.topPrefixes,
          [
            { key: 'prefix', label: 'Префикс' },
            { label: 'Позиций', render: (row) => formatNumber(row.count) },
            { label: 'Примеры', render: (row) => renderExamples(row.examples) },
          ],
          'Нераспознанных префиксов нет.'
        )}
        <h2 class="section-subtitle">Позиции в fallback</h2>
        ${renderTable(
          fallbackToOther.products,
          [
            { key: 'name', label: 'Наименование' },
            { key: 'prefix', label: 'Префикс' },
            { key: 'markFamily', label: 'Марка' },
            { key: 'sourceCategory', label: 'Исходная категория' },
            { key: 'unit', label: 'Ед.' },
            { label: 'Цена', render: (row) => formatMoney(row.price) },
            { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          ],
          'Позиции в fallback «Прочее» не найдены.'
        )}
      `,
    },
  ];

  return `
    <div class="tabs" role="tablist">
      ${tabs
        .map(
          (tab, index) => `
            <button class="tab-button${index === 0 ? ' active' : ''}" type="button" data-tab="${tab.id}">
              <span>${escapeHtml(tab.label)}</span>
              <strong>${formatNumber(tab.count)}</strong>
            </button>
          `
        )
        .join('')}
    </div>
    <div class="panels">
      ${tabs
        .map(
          (tab, index) => `
            <section class="tab-panel${index === 0 ? ' active' : ''}" data-panel="${tab.id}">
              ${tab.content}
            </section>
          `
        )
        .join('')}
    </div>
  `;
}

function renderStockChanges(report) {
  const rows = report.diff?.stockChanged || [];

  return `
    <details class="details-block">
      <summary>Изменения остатков (${formatNumber(rows.length)})</summary>
      ${renderTable(
        rows,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { label: 'Было', render: (row) => formatNumber(row.stockBefore) },
          { label: 'Стало', render: (row) => formatNumber(row.stockAfter) },
        ],
        'Изменений остатков нет.'
      )}
    </details>
  `;
}

function renderSuspiciousPriceStats(report) {
  const rows = Object.entries(report.suspiciousPriceStats?.byUnit || {}).map(
    ([unit, stats]) => ({
      unit,
      ...stats,
    })
  );

  return renderTable(
    rows,
    [
      { key: 'unit', label: 'Ед.' },
      { label: 'Цен в истории', render: (row) => formatNumber(row.count) },
      {
        label: 'Макс. в импорте',
        render: (row) => formatNumber(row.maxImportSamples),
      },
      { label: 'p95', render: (row) => formatMoney(row.p95) },
      { label: 'p99', render: (row) => formatMoney(row.p99) },
      { label: 'Порог', render: (row) => formatMoney(row.threshold) },
      {
        label: 'Источник',
        render: (row) =>
          row.source === 'history'
            ? `История (${formatThresholdSource(row)})`
            : 'importConfig.json',
      },
    ],
    'Статистика цен пока не накоплена.'
  );
}

export function buildReportHtml(
  report,
  { fallbackSourceFile = '', jsonReportPath = 'data/import-report.json' } = {}
) {
  const summary = report.summary || {};
  const alertPercent = Number(
    report.priceAlertPercent || PRICE_JUMP_ALERT_PERCENT
  );
  const sourceFileName = path.basename(report.sourceFile || fallbackSourceFile);
  const sourceMetadata = report.source || {};
  const sourceReference =
    sourceMetadata.downloadUrl ||
    sourceMetadata.requestedUrl ||
    report.sourceUrl ||
    report.sourceFile ||
    fallbackSourceFile;
  const sourceSize = Number.isFinite(Number(sourceMetadata.sizeBytes))
    ? `${formatNumber(sourceMetadata.sizeBytes)} байт`
    : 'неизвестен';
  const sourceFingerprint = sourceMetadata.sha256 || 'не рассчитана';
  const categoryRows = Object.entries(report.productsByCategory || {}).map(
    ([category, count]) => ({ category, count })
  );
  const skipRows = Object.entries(report.skipsByReason || {}).map(
    ([reason, count]) => ({
      reason,
      count,
    })
  );
  const skippedRows = Array.isArray(report.skippedRows)
    ? report.skippedRows
    : [];
  const reviewRows = Array.isArray(report.reviewRows) ? report.reviewRows : [];
  const diagnostics = report.diagnostics || {};
  const diagnosticRows = [
    ...(diagnostics.errors || []),
    ...(diagnostics.warnings || []),
    ...(diagnostics.info || []),
  ];
  const manufacturerRows = Array.isArray(report.manufacturers?.top)
    ? report.manufacturers.top
    : [];
  const statCards = [
    ['Импортировано', summary.productsImported],
    ['Было ранее', summary.productsPrevious],
    ['Категорий найдено', summary.categoriesDetected],
    ['На проверке', summary.reviewRows],
    ['Новых на проверке', summary.newReviewRows],
    ['Ошибки проверки', summary.validationErrors],
    ['Предупреждения', summary.validationWarnings],
    ['Строк пропущено', summary.skippedRows],
    ['Изменений цен', summary.priceChanged],
    ['Изменений остатков', summary.stockChanged],
    ['Прочее fallback', summary.fallbackToOther],
    ['Всего в Прочее', summary.otherProducts],
    ['Конфликты с заголовком', summary.sourceCategoryConflicts],
  ];

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Отчёт импорта прайса</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --paper: #fbfdff;
      --ink: #0a1628;
      --muted: #5a6f87;
      --line: #d7e3ef;
      --accent: linear-gradient(180deg, #ffd35a 0%, #f2b705 100%);
      font-family: Inter, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    main { max-width: 1240px; margin: 0 auto; padding: 34px 22px 48px; }
    .hero, .panel, .stat {
      background: var(--paper);
      border: 1px solid #e2eaf4;
      border-radius: 24px;
      box-shadow: 0 14px 34px rgba(17, 53, 95, 0.06);
    }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow {
      display: inline-flex; margin-bottom: 12px; padding: 7px 12px;
      border-radius: 999px; border: 1px solid #cad8e5; background: #e8f0f7;
      color: #35556d; font-size: 13px; font-weight: 800; text-transform: uppercase;
    }
    h1 { margin: 0 0 10px; font-size: clamp(30px, 4vw, 46px); line-height: 1.04; font-weight: 900; }
    .meta { margin: 0; color: var(--muted); line-height: 1.6; }
    .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 18px 0; }
    .stat { padding: 18px; }
    .stat span { display: block; color: var(--muted); font-size: 13px; font-weight: 700; }
      .stat strong { display: block; margin-top: 8px; font-size: 26px; line-height: 1; }
      .panel { padding: 18px; margin-top: 18px; }
      .section-subtitle { margin-top: 22px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .tab-button {
      display: inline-flex; gap: 9px; align-items: center; border: 1px solid var(--line);
      border-radius: 999px; padding: 10px 14px; background: #fff; color: #102238;
      font: inherit; font-weight: 800; cursor: pointer;
    }
    .tab-button strong { min-width: 28px; padding: 3px 8px; border-radius: 999px; background: #e8f0f7; }
    .tab-button.active { border-color: #e0ad00; background: var(--accent); }
    .tab-button.active strong { background: rgba(255, 255, 255, 0.62); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .panel-note { margin: 0 0 14px; color: var(--muted); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 18px; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; background: #fff; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e7eef6; text-align: left; vertical-align: top; }
    th { background: #eef4fa; color: #35556d; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .delta { font-weight: 900; }
    .delta.positive { color: #b42318; }
    .delta.negative { color: #0f7a3f; }
    .empty-state { padding: 30px; border: 1px dashed var(--line); border-radius: 18px; color: var(--muted); background: #fff; }
    .details-block { margin-top: 14px; }
    .details-block summary { cursor: pointer; color: #35556d; font-weight: 800; }
    .secondary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    @media (max-width: 920px) {
      .stats, .secondary-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      main { padding: 18px 12px 34px; }
      .hero, .panel { border-radius: 18px; padding: 18px; }
      .stats, .secondary-grid { grid-template-columns: 1fr; }
      .tab-button { width: 100%; justify-content: space-between; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Импорт прайса</span>
      <h1>Отчёт импорта</h1>
      <p class="meta">
        Сформирован: ${formatReportDate(report.generatedAt)} ·
        Источник: <span title="${escapeHtml(report.sourceFile)}">${escapeHtml(sourceFileName)}</span> ·
        JSON: ${escapeHtml(jsonReportPath)}
      </p>
      <p class="panel-note">
        Файл источника: ${escapeHtml(sourceReference)} · Размер: ${escapeHtml(sourceSize)} · SHA-256: <code>${escapeHtml(sourceFingerprint)}</code>
      </p>
    </section>

    <section class="stats">
      ${statCards
        .map(
          ([label, value]) => `
            <article class="stat">
              <span>${escapeHtml(label)}</span>
              <strong>${formatNumber(value)}</strong>
            </article>
          `
        )
        .join('')}
    </section>

    <section class="panel">
      ${renderReportTabs(report, alertPercent)}
      ${renderStockChanges(report)}
      <details class="details-block">
        <summary>Производители (${formatNumber(report.manufacturers?.uniqueCount || 0)} уникальных)</summary>
        <p class="panel-note">Производитель берётся из исходного названия строки. Неопознанных строк: ${formatNumber(report.manufacturers?.withoutManufacturer || 0)}.</p>
        ${renderTable(
          manufacturerRows,
          [
            { key: 'manufacturer', label: 'Производитель' },
            { key: 'count', label: 'Строк' },
          ],
          'Производители не выделены.'
        )}
      </details>
    </section>

    <section class="secondary-grid">
      <article class="panel">
        <h2>Распределение по категориям</h2>
        ${renderTable(
          categoryRows,
          [
            { key: 'category', label: 'Категория' },
            { label: 'Товаров', render: (row) => formatNumber(row.count) },
          ],
          'Категории не найдены.'
        )}
      </article>
      <article class="panel">
        <h2>Пропущенные строки</h2>
        ${renderTable(
          skipRows,
          [
            { key: 'reason', label: 'Причина' },
            { label: 'Строк', render: (row) => formatNumber(row.count) },
          ],
          'Пропущенных строк нет.'
        )}
        <details class="details-block">
          <summary>Подробности (${formatNumber(skippedRows.length)})</summary>
          ${renderTable(
            skippedRows,
            [
              {
                label: 'Строка',
                render: (row) =>
                  Number.isInteger(row.rowIndex)
                    ? formatNumber(row.rowIndex + 1)
                    : '—',
              },
              { key: 'product', label: 'Позиция' },
              { key: 'category', label: 'Категория' },
              { key: 'reason', label: 'Причина' },
              { label: 'Цена', render: (row) => formatMoney(row.price) },
              { label: 'Остаток', render: (row) => formatNumber(row.stock) },
            ],
            'Деталей по пропущенным строкам нет.'
          )}
        </details>
      </article>
      <article class="panel">
        <h2>Результат запуска</h2>
        <p>${escapeHtml(report.message || (report.blocked ? 'Публикация остановлена' : ''))}</p>
        <h2>Предупреждения публикации</h2>
        ${renderTable(report.publishGuard?.warnings || [], [{ key: 'message', label: 'Причина' }], 'Предупреждений нет.')}
        <h2>Строки на проверке</h2>
        <p class="panel-note">Причина в каждой строке показывает, сохранена ли позиция или отложено её обновление. При отложенном обновлении известного товара сохраняются прежние данные; новый товар ожидает проверки.</p>
        ${renderTable(
          reviewRows,
          [
            {
              label: 'Строка',
              render: (row) =>
                Number.isInteger(row.rowIndex)
                  ? formatNumber(row.rowIndex + 1)
                  : '—',
            },
            { key: 'product', label: 'Позиция' },
            { key: 'category', label: 'Категория источника' },
            { key: 'reason', label: 'Причина' },
          ],
          'Строк на проверке нет.'
        )}
      </article>
      <article class="panel">
        <h2>Диагностика товара</h2>
        <p class="panel-note">Ошибки блокируют публикацию; предупреждения и информация сохраняются для разбора.</p>
        ${renderTable(
          diagnosticRows,
          [
            { key: 'severity', label: 'Уровень' },
            {
              label: 'Строка',
              render: (row) =>
                Number.isInteger(row.rowIndex)
                  ? formatNumber(row.rowIndex + 1)
                  : Array.isArray(row.rows)
                    ? row.rows
                        .map((index) => formatNumber(index + 1))
                        .join(', ')
                    : '—',
            },
            { key: 'product', label: 'Позиция' },
            { key: 'message', label: 'Сообщение' },
          ],
          'Диагностических замечаний нет.'
        )}
      </article>
      <article class="panel">
        <h2>Пороги подозрительных цен</h2>
        <p class="panel-note">
          Импортов в расчёте: ${formatNumber(report.suspiciousPriceStats?.historyImports || 0)} ·
          файл: ${escapeHtml(report.suspiciousPriceStats?.historyFile || '')}
        </p>
        ${renderSuspiciousPriceStats(report)}
      </article>
    </section>
  </main>
  <script>
    const buttons = document.querySelectorAll('[data-tab]');
    const panels = document.querySelectorAll('[data-panel]');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
      });
    });
  </script>
</body>
</html>`;
}
