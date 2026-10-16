import { buildProductDesignation } from '../../../shared/productDesignation.js';
import '../../styles/sections/product-designation.css';

export default function ProductDesignation({ product }) {
  const decoded = buildProductDesignation(product);
  return (
    <section
      className="product-designation"
      aria-labelledby="product-designation-title"
    >
      <h2
        id="product-designation-title"
        className="section-title section-title--left"
      >
        Расшифровка обозначения
      </h2>
      <p className="product-designation__name">{decoded.designation}</p>
      <p>{decoded.description}</p>
      {decoded.tokens.length > 0 && (
        <dl className="product-designation__tokens">
          {decoded.tokens.map(({ code, text }, index) => (
            <div key={`${code}-${index}`}>
              <dt>{code}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {decoded.unknown.length > 0 && (
        <p className="product-designation__notice">
          <strong>Требует уточнения:</strong> {decoded.unknown.join(', ')}.
          Значение этих элементов не подтверждено для данной марки.
        </p>
      )}
      {decoded.warnings.map((warning) => (
        <p key={warning} className="product-designation__notice">
          {warning}
        </p>
      ))}
      <div className="product-designation__sources">
        {decoded.sources.length > 0 && (
          <>
            <strong>Источники расшифровки</strong>
            <ul>
              {decoded.sources.map(({ title, url }) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {title} ↗
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        {decoded.unknown.length > 0 && (
          <a href={decoded.searchUrl} target="_blank" rel="noopener noreferrer">
            Найти полное обозначение в Google ↗
          </a>
        )}
        <p>
          Описание относится к обозначению марки. Характеристики конкретного
          исполнения определяются паспортом и ГОСТ/ТУ изделия.
        </p>
      </div>
    </section>
  );
}
