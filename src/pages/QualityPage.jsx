import { Link } from 'react-router-dom';
import PurchaseLayout from '../components/purchase/PurchaseLayout';
import {
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUISITES,
  SITE_REQUEST_DOCUMENTS,
} from '../lib/siteConfig';
import { serviceUrl } from '../lib/cableServices';
import evidence from '../../data/companyEvidence.json';
import '../styles/pages/quality.css';
function DocumentIcon() {
  return (
    <svg
      className="quality-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8" />
    </svg>
  );
}

export default function QualityPage() {
  const approved = (key) =>
    evidence[key].filter((item) => item.approved === true);
  return (
    <PurchaseLayout pageKey="quality" className="quality-page">
      <div className="quality-topics">
        <section className="purchase-panel">
          <h2>
            <DocumentIcon />
            Проверка компании
          </h2>
          <p>
            <strong>{SITE_REQUISITES.fullLegalName}</strong>
          </p>
          <p>
            ИНН {SITE_REQUISITES.taxId} · ОГРН{' '}
            {SITE_REQUISITES.registrationNumber}
          </p>
          <div className="evidence-documents">
            {SITE_PUBLIC_DOCUMENTS.map((doc) => (
              <a key={doc.href} href={doc.href}>
                <strong>{doc.title}</strong>
                <span>
                  {doc.type} · {doc.description}
                </span>
                <svg
                  className="quality-download"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" />
                </svg>
              </a>
            ))}
          </div>
          <Link to="/contacts/">Офис, склад и контакты →</Link>
        </section>
        <section className="purchase-panel">
          <h2>
            <DocumentIcon />
            Документы на кабель
          </h2>
          <p>
            Укажите полную марку и изготовителя. Подберём документы для
            выбранной позиции и складской партии. Сертификат на другую марку или
            каталог завода их не заменяет.
          </p>
          <ul>
            {SITE_REQUEST_DOCUMENTS.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <Link to={serviceUrl('manufacturers')}>
            Документация изготовителей →
          </Link>
        </section>
      </div>
      {approved('certificates').length > 0 && (
        <section className="purchase-panel">
          <h2>Опубликованные сертификаты</h2>
          <div className="evidence-documents">
            {approved('certificates').map((doc) => (
              <a key={doc.href} href={doc.href}>
                <strong>{doc.title}</strong>
                <span>
                  {doc.manufacturer} · {doc.marks} · действует до{' '}
                  {doc.validUntil}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {approved('projects').length > 0 && (
        <section className="purchase-panel">
          <h2>Примеры поставок</h2>
          <div className="evidence-grid">
            {approved('projects').map((project) => (
              <article key={project.title}>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                <p>
                  {project.date} · {project.products}
                </p>
                {project.image && (
                  <img
                    src={project.image}
                    alt={project.title}
                    width={project.imageWidth || 600}
                    height={project.imageHeight || 400}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                {project.sourceHref && (
                  <a href={project.sourceHref}>Подробнее о поставке →</a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {approved('reviews').length > 0 && (
        <section className="purchase-panel">
          <h2>Отзывы клиентов</h2>
          <div className="evidence-grid">
            {approved('reviews').map((review) => (
              <figure key={review.author + review.date}>
                <blockquote>{review.text}</blockquote>
                <figcaption>
                  {review.author} · {review.date}
                </figcaption>
                <a href={review.sourceHref}>Источник отзыва →</a>
              </figure>
            ))}
          </div>
        </section>
      )}
      <div className="purchase-actions">
        <Link to="/how-to-order/">Порядок заказа и вопросы →</Link>
        <Link to="/specification/">Запросить КП по файлу →</Link>
      </div>
    </PurchaseLayout>
  );
}
