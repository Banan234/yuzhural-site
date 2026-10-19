// Файл рендерит страницу контактов с адресом, реквизитами, картой, формой и structured data.

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import HeroLeadForm from '../components/home/HeroLeadForm';
import CallbackButton from '../components/forms/CallbackButton';
import ConsentGatedMap from '../components/layout/ConsentGatedMap';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_CITY_DISPLAY,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_OFFICE_MAP_EMBED_URL,
  SITE_OFFICE_MAP_URL,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUEST_DOCUMENTS,
  SITE_REQUISITES,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_URL,
  SITE_WORKING_HOURS_DISPLAY,
} from '../lib/siteConfig';
import { toCanonicalSitePath } from '../lib/canonicalPaths.js';
import '../styles/pages/content.css';

const CONTACTS_CANONICAL_PATH = toCanonicalSitePath('/contacts');

export default function ContactsPage() {
  useSEO({
    title: 'Контакты',
    description: `Контакты ЮжУралЭлектроКабель: телефон ${SITE_PHONE_DISPLAY}, email ${SITE_EMAIL}. Офис: ${SITE_OFFICE_ADDRESS_DISPLAY}. Склад самовывоза: ${SITE_WAREHOUSE_ADDRESS_DISPLAY}. ${SITE_WORKING_HOURS_DISPLAY}.`,
    canonical: CONTACTS_CANONICAL_PATH,
  });

  return (
    <>
      <section className="section">
        <Container>
          <Breadcrumbs current="Контакты" />
          <div className="contacts-page__hero">
            <div>
              <h1 className="page-title">Контакты</h1>
              <p className="page-subtitle">
                Свяжитесь с нами по вопросам подбора кабеля, расчета поставки,
                коммерческих предложений и сотрудничества.
              </p>
            </div>

            <div className="contacts-page__hero-card">
              <div className="contacts-page__hero-label">Основной телефон</div>
              <a href={SITE_PHONE_HREF} className="contacts-page__hero-phone">
                {SITE_PHONE_DISPLAY}
              </a>

              <div className="contacts-page__hero-meta">
                <a href={SITE_EMAIL_HREF} className="contacts-page__hero-mail">
                  {SITE_EMAIL}
                </a>
                <span>{SITE_WORKING_HOURS_DISPLAY}</span>
                <span>{SITE_OFFICE_ADDRESS.addressLocality}</span>
              </div>
              <CallbackButton
                className="button-primary contacts-page__callback"
                source="Заказ звонка: страница контактов"
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Как с нами связаться
            </h2>
          </div>

          <div className="contacts-grid">
            <article className="contact-card">
              <div className="contact-card__title">Отдел продаж</div>
              <div className="contact-card__text">
                Подбор продукции, наличие, цены, коммерческие предложения.
              </div>
              <a href={SITE_PHONE_HREF} className="contact-card__link">
                {SITE_PHONE_DISPLAY}
              </a>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
              </a>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Общие вопросы</div>
              <div className="contact-card__text">
                Вопросы по работе компании, условиям поставки и документам.
              </div>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
              </a>
              <div className="contact-card__meta">
                {SITE_WORKING_HOURS_DISPLAY}
              </div>
            </article>

            <article className="contact-card">
              <div className="contact-card__title">Сотрудничество</div>
              <div className="contact-card__text">
                Производители, поставщики, оптовые условия, снабжение объектов.
              </div>
              <a href={SITE_EMAIL_HREF} className="contact-card__link">
                {SITE_EMAIL}
              </a>
              <div className="contact-card__meta">Ответ в рабочее время</div>
            </article>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="contacts-layout">
            <div className="contacts-layout__main">
              <div className="contacts-info-card">
                <h2 className="contacts-info-card__title">
                  Офис, склад и реквизиты
                </h2>

                <div className="contacts-info-list">
                  <div className="contacts-info-row">
                    <span>Город</span>
                    <strong>{SITE_CITY_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Офис</span>
                    <strong>{SITE_OFFICE_ADDRESS_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Склад самовывоза</span>
                    <strong>
                      <a
                        href={SITE_WAREHOUSE_MAP_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {SITE_WAREHOUSE_ADDRESS_DISPLAY}
                      </a>
                    </strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Режим работы</span>
                    <strong>{SITE_WORKING_HOURS_DISPLAY}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>Юр. название</span>
                    <strong>{SITE_REQUISITES.fullLegalName}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ИНН</span>
                    <strong>{SITE_REQUISITES.taxId}</strong>
                  </div>

                  <div className="contacts-info-row">
                    <span>ОГРН</span>
                    <strong>{SITE_REQUISITES.registrationNumber}</strong>
                  </div>
                </div>

                <p className="contact-card__text">
                  В офисе оформляем оплату и договоры. Самовывоз и отгрузка
                  выполняются со склада.
                </p>

                <div className="contacts-doc-links">
                  {SITE_PUBLIC_DOCUMENTS.map((doc) => (
                    <a
                      key={doc.href}
                      href={doc.href}
                      className="contacts-doc-link"
                    >
                      <span>{doc.type}</span>
                      {doc.title}
                    </a>
                  ))}
                </div>
              </div>

              <div className="contacts-map-card">
                <div className="contacts-map-card__title">Офис</div>
                <div className="contacts-map-frame">
                  <ConsentGatedMap
                    title={`Карта: ${SITE_OFFICE_ADDRESS_DISPLAY}`}
                    src={SITE_OFFICE_MAP_EMBED_URL}
                  />
                </div>
                <div className="contacts-map-card__footer">
                  <span>Офис: {SITE_OFFICE_ADDRESS_DISPLAY}</span>
                  <a
                    href={SITE_OFFICE_MAP_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть маршрут в офис
                  </a>
                </div>
              </div>
            </div>

            <div className="contacts-layout__side">
              <HeroLeadForm
                title="Напишите нам"
                subtitle="Оставьте телефон и вопрос — ответим в рабочее время."
                submitLabel="Отправить"
                source="Страница контактов"
                idPrefix="contacts-lead"
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Что подтвердим перед поставкой
              </h2>
              <p className="content-lead">
                Сертификаты и фото не подменяем универсальными картинками:
                отправляем документы под конкретную марку, партию или условия
                объекта.
              </p>
            </div>
            <ul className="info-list">
              {SITE_REQUEST_DOCUMENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
    </>
  );
}
