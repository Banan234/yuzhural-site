import { useState } from 'react';
import { Link } from 'react-router-dom';
import PurchaseLayout from '../components/purchase/PurchaseLayout';
import {
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUISITES,
  SITE_REQUEST_DOCUMENTS,
} from '../lib/siteConfig';
import { requestServiceHelp, serviceUrl } from '../lib/cableServices';
import evidence from '../../data/companyEvidence.json';
export default function QualityPage() {
  const [mark, setMark] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [documentType, setDocumentType] = useState(SITE_REQUEST_DOCUMENTS[0]);
  const [requirements, setRequirements] = useState('');
  const approved = (key) =>
    evidence[key].filter((item) => item.approved === true);
  function request(event) {
    event.preventDefault();
    requestServiceHelp(
      'Запрос документов по кабелю',
      `Марка: ${mark.trim()}; изготовитель: ${manufacturer.trim() || 'уточнить для складской партии'}; документ: ${documentType}.\nТребования: ${requirements.trim() || 'для согласования поставки'}`
    );
  }
  return (
    <PurchaseLayout pageKey="quality">
      <div className="purchase-columns">
        <section className="purchase-panel">
          <h2>Проверка компании перед оплатой</h2>
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
              </a>
            ))}
          </div>
          <Link to="/contacts/">Офис, склад и контакты →</Link>
        </section>
        <section className="purchase-panel">
          <h2>Документы к конкретной позиции</h2>
          <p>
            Для проверки укажите полное обозначение и изготовителя. Сертификат
            на другую марку или таблица из каталога завода не подтверждают
            документы выбранной складской партии.
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
      <section className="purchase-panel">
        <h2>Запросить сертификат или паспорт качества</h2>
        <form className="purchase-form" onSubmit={request}>
          <div className="purchase-fields">
            <label>
              Полная марка кабеля
              <input
                required
                maxLength={200}
                value={mark}
                onChange={(e) => setMark(e.target.value)}
                placeholder="Например, ВВГнг(А)-LS 3х2,5-0,66"
              />
            </label>
            <label>
              Изготовитель, если известен
              <input
                maxLength={100}
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </label>
            <label>
              Документ
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                {SITE_REQUEST_DOCUMENTS.map((text) => (
                  <option key={text}>{text}</option>
                ))}
              </select>
            </label>
            <label>
              Требования проекта
              <textarea
                maxLength={350}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                rows={3}
              />
            </label>
          </div>
          <button className="button-primary" type="submit">
            Указать контакт для получения документов
          </button>
        </form>
      </section>
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
