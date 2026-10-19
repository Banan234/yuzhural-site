// Файл рендерит страницу оплаты: единый сценарий сделки, условия для B2B/физлиц, документы и CTA.

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUISITES,
} from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';

const PAYMENT_JSON_LD_ID = getStaticPageJsonLdId(STATIC_PAGE_SEO.payment.path);
const PAYMENT_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.payment.path);

const PAYMENT_BADGES = [
  'Сайт-каталог без онлайн-оплаты',
  'Подтверждаем цену и наличие до счёта',
  'Один порядок работы для компаний и физлиц',
  'Отгрузка после поступления оплаты',
];

const PAYMENT_MODES = [
  {
    title: 'Для юридических лиц и ИП',
    label: 'Безналичный расчёт',
    description:
      'Счёт выставляем после проверки номенклатуры, объёма и условий поставки. При необходимости оформляем договор поставки, спецификацию и комплект закрывающих документов.',
    points: [
      'До оплаты направляем счёт, реквизиты, договор и дополнительные файлы для проверки.',
      'Для объектных и регулярных закупок отдельно фиксируем сроки, резерв и особые условия поставки.',
      'Отгрузка производится после поступления оплаты, если иной порядок не согласован сторонами отдельно.',
    ],
  },
  {
    title: 'Для физических лиц',
    label: 'По индивидуально согласованному счёту',
    description:
      'Продажа физическим лицам осуществляется после подтверждения наличия, цены, способа получения и иных условий поставки. Сайт не оформляет покупку автоматически: менеджер сначала согласует условия, затем направляет счёт или договор.',
    points: [
      'До оплаты подтверждаем состав заказа, итоговую цену и срок готовности к отгрузке.',
      'Оплата производится по выставленному счёту, после поступления денег согласуем выдачу или отправку товара.',
      'По физическим лицам отдельно сообщаем порядок возврата, обмена и рассмотрения претензий.',
    ],
  },
];

const PAYMENT_STEPS = [
  {
    title: 'Получаем заявку',
    text: 'Вы присылаете перечень марок кабеля, объём, город доставки и контактные данные для оформления счёта или договора.',
  },
  {
    title: 'Подтверждаем условия',
    text: 'Менеджер проверяет наличие, цену, срок готовности к отгрузке, способ получения и комплект документов по сделке.',
  },
  {
    title: 'Направляем документы',
    text: 'Отправляем счёт, реквизиты, типовой договор и иные документы, которые нужны для согласования и оплаты.',
  },
  {
    title: 'Подтверждаем оплату',
    text: 'После поступления средств подтверждаем дату выдачи или передачи груза в транспортную компанию.',
  },
  {
    title: 'Отгружаем заказ',
    text: 'Комплектуем заказ и передаём его на самовывоз или перевозчику по согласованному сценарию получения.',
  },
];

const PAYMENT_CONFIRMATION_POINTS = [
  'перечень и количество товара',
  'итоговая цена по счёту или договору',
  'срок готовности заказа к отгрузке',
  'способ получения: самовывоз или транспортная компания',
  'комплект документов по сделке',
  'стоимость доставки, если она включается отдельно',
];

const PAYMENT_LEGAL_NOTES = [
  'Информация на сайте носит справочный характер и не является публичной офертой.',
  'Окончательная цена товара определяется в счёте, договоре или ином согласованном документе после подтверждения наличия и условий поставки.',
  'Порядок и момент заключения договора фиксируются в счёте, договоре и иных документах по конкретной сделке.',
  'При продаже физическим лицам условия оплаты, получения товара и рассмотрения претензий сообщаются до внесения оплаты.',
];

export default function PaymentPage() {
  function handleOpenPaymentLead() {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          title: 'Запросить счёт и условия оплаты',
          subtitle:
            'Отправьте список позиций и контакты — согласуем условия поставки и подготовим счёт или договор.',
          submitLabel: 'Запросить счёт',
          source: 'CTA на странице оплаты',
        },
      })
    );
  }

  useSEO({
    title: STATIC_PAGE_SEO.payment.title,
    description: STATIC_PAGE_SEO.payment.description,
    canonical: STATIC_PAGE_SEO.payment.path,
  });

  useJsonLd(PAYMENT_JSON_LD_ID, PAYMENT_JSON_LD);

  return (
    <>
      <section className="section">
        <Container>
          <Breadcrumbs current="Оплата" />
          <div className="payment-page__hero">
            <div className="payment-page__intro">
              <h1 className="page-title">Оплата и оформление поставки</h1>
              <p className="page-subtitle">
                Поставка кабельно-проводниковой продукции осуществляется после
                подтверждения наличия, согласования условий и выставления счёта.
              </p>

              <div className="payment-page__badges" aria-label="Условия оплаты">
                {PAYMENT_BADGES.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>

              <div className="content-actions payment-page__hero-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleOpenPaymentLead}
                >
                  Запросить счёт
                </button>
                <a href={`tel:${SITE_PHONE}`} className="button-secondary">
                  Уточнить условия по телефону
                </a>
              </div>
            </div>

            <aside className="payment-summary">
              <h2 className="payment-summary__title">
                Один сценарий сделки, но без автоматической покупки на сайте
              </h2>
              <p className="payment-summary__text">
                Сайт носит информационный характер. Окончательные условия
                поставки, стоимость, сроки отгрузки, способ доставки и комплект
                документов согласуются менеджером после получения заявки.
              </p>
              <ul className="payment-summary__list">
                <li>подтверждаем цену и наличие до оплаты</li>
                <li>направляем счёт, договор и реквизиты на согласование</li>
                <li>отгружаем только после подтверждения оплаты</li>
              </ul>
              <div className="payment-summary__contacts">
                <a
                  href={`tel:${SITE_PHONE}`}
                  className="payment-summary__contact"
                >
                  {SITE_PHONE_DISPLAY}
                </a>
                <a
                  href={SITE_EMAIL_HREF}
                  className="payment-summary__contact payment-summary__contact--muted"
                >
                  {SITE_EMAIL}
                </a>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Условия оплаты для компаний и физических лиц
            </h2>
          </div>

          <div className="payment-modes">
            {PAYMENT_MODES.map((mode) => (
              <article key={mode.title} className="payment-mode">
                <span className="payment-mode__label">{mode.label}</span>
                <h3 className="payment-mode__title">{mode.title}</h3>
                <p className="payment-mode__description">{mode.description}</p>
                <ul className="payment-mode__list">
                  {mode.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Как проходит оформление
              </h2>
              <p className="content-lead">
                Процесс один и тот же для компаний и физических лиц: сначала
                проверяем фактические условия поставки, потом направляем
                документы на оплату и только после этого подтверждаем отгрузку.
              </p>
            </div>

            <ol className="payment-steps">
              {PAYMENT_STEPS.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="content-columns content-columns--spaced">
            <div>
              <h2 className="section-title section-title--left">
                Что фиксируем до оплаты
              </h2>
              <p className="content-lead">
                До выставления счёта или подписания договора заранее
                согласовываем все ключевые условия, чтобы оплата не уходила
                вслепую и не требовала пересогласования после поступления денег.
              </p>
            </div>

            <ul className="info-list">
              {PAYMENT_CONFIRMATION_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="content-columns content-columns--spaced">
            <div>
              <h2 className="section-title section-title--left">
                Документы и реквизиты
              </h2>
              <p className="content-lead">
                Счёт выставляется от {SITE_REQUISITES.fullLegalName}. Основные
                юридические данные, типовой договор и открытые файлы доступны
                заранее, чтобы юрлицо, ИП или физическое лицо могли проверить
                контрагента и пакет документов до оплаты.
              </p>
            </div>

            <div className="proof-panel">
              <dl className="proof-details">
                <div>
                  <dt>Организация</dt>
                  <dd>{SITE_REQUISITES.fullLegalName}</dd>
                </div>
                <div>
                  <dt>ИНН / ОГРН</dt>
                  <dd>
                    {SITE_REQUISITES.taxId} /{' '}
                    {SITE_REQUISITES.registrationNumber}
                  </dd>
                </div>
                <div>
                  <dt>Формат оплаты</dt>
                  <dd>Безналичный расчёт по счёту или договору</dd>
                </div>
                <div>
                  <dt>Отгрузка</dt>
                  <dd>После поступления оплаты</dd>
                </div>
              </dl>

              <div className="proof-documents proof-documents--compact">
                {SITE_PUBLIC_DOCUMENTS.map((doc) => (
                  <a key={doc.href} href={doc.href} className="proof-document">
                    <span className="proof-document__type">{doc.type}</span>
                    <span>
                      <strong>{doc.title}</strong>
                      <small>{doc.description}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="content-columns content-columns--spaced">
            <div>
              <h2 className="section-title section-title--left">
                Важные условия
              </h2>
              <p className="content-lead">
                Эти правила помогают одинаково понятно пройти путь от заявки до
                отгрузки и не подменять согласование сделки автоматически
                опубликованной ценой на сайте.
              </p>
            </div>

            <ul className="info-list">
              {PAYMENT_LEGAL_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="payment-cta">
            <div>
              <h2 className="payment-cta__title">
                Нужен счёт или согласование условий поставки
              </h2>
              <p className="payment-cta__text">
                Отправьте список позиций и контакты. Подготовим счёт, проверим
                наличие и заранее согласуем цену, документы и способ получения
                заказа.
              </p>
              <p className="payment-cta__text">
                <a href={`tel:${SITE_PHONE}`}>
                  Остались вопросы? Связаться с менеджером
                </a>
              </p>
            </div>
            <div className="content-actions payment-cta__actions">
              <button
                type="button"
                className="button-primary"
                onClick={handleOpenPaymentLead}
              >
                Запросить счёт
              </button>
              <a
                href="/documents/company-details.pdf"
                className="button-secondary"
              >
                Скачать реквизиты
              </a>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
