// Тот же справочник используется в HTML карточек, доступном до загрузки JavaScript.
import { buildProductDesignation } from './productDesignation.js';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]
  );
export function buildProductDesignationHtml(product) {
  const decoded = buildProductDesignation(product);
  const tokens = decoded.tokens
    .map(
      ({ code, text }) =>
        `<div><dt>${escape(code)}</dt><dd>${escape(text)}</dd></div>`
    )
    .join('');
  const unknown = decoded.unknown.length
    ? `<p class="product-designation__notice"><strong>Требует уточнения:</strong> ${escape(decoded.unknown.join(', '))}. Значение этих элементов не подтверждено для данной марки.</p>`
    : '';
  const warnings = decoded.warnings
    .map(
      (warning) =>
        `<p class="product-designation__notice">${escape(warning)}</p>`
    )
    .join('');
  const sources = decoded.sources.length
    ? `<strong>Источники расшифровки</strong><ul>${decoded.sources.map(({ title, url }) => `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a></li>`).join('')}</ul>`
    : '';
  const search = decoded.unknown.length
    ? `<a href="${escape(decoded.searchUrl)}" target="_blank" rel="noopener noreferrer">Найти полное обозначение в Google ↗</a>`
    : '';
  const manufacturerTexts = decoded.manufacturerTexts.length
    ? `<div class="product-designation__manufacturer-texts"><h3>Описание и применение по данным изготовителей</h3><p class="product-designation__sources">Краткое изложение технического назначения семейства. Полные тексты и условия применения — в оригиналах. Указан изготовитель документации; завод конкретной партии уточняется по паспорту.</p>${decoded.manufacturerTexts.map((text) => `<details><summary>${escape(text.manufacturer)} · ${escape(text.originalHeading)}</summary><p>${escape(text.text)}</p><a href="${escape(text.url)}" target="_blank" rel="noopener noreferrer">${escape(text.sourceTitle)}${text.pages.length ? `, стр. PDF: ${escape(text.pages.join(', '))}` : ''} ↗</a></details>`).join('')}</div>`
    : '';
  return `<section class="product-designation" aria-labelledby="product-designation-title"><h2 id="product-designation-title" class="section-title section-title--left">Расшифровка обозначения</h2><p class="product-designation__name">${escape(decoded.designation)}</p><p>${escape(decoded.description)}</p>${tokens ? `<dl class="product-designation__tokens">${tokens}</dl>` : ''}${unknown}${warnings}${manufacturerTexts}<div class="product-designation__sources">${sources}${search}<p>Описание относится к обозначению марки. Характеристики конкретного исполнения определяются паспортом и ГОСТ/ТУ изделия.</p></div></section>`;
}
