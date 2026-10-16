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
  return `<section class="product-designation" aria-labelledby="product-designation-title"><h2 id="product-designation-title" class="section-title section-title--left">Расшифровка обозначения</h2><p class="product-designation__name">${escape(decoded.designation)}</p><p>${escape(decoded.description)}</p>${tokens ? `<dl class="product-designation__tokens">${tokens}</dl>` : ''}${unknown}${warnings}<div class="product-designation__sources">${sources}${search}<p>Описание относится к обозначению марки. Характеристики конкретного исполнения определяются паспортом и ГОСТ/ТУ изделия.</p></div></section>`;
}
