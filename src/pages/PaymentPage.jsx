import { Link } from 'react-router-dom';
// Файл рендерит страницу оплаты: единый сценарий сделки, условия для B2B/физлиц, документы и CTA.

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import { SITE_PHONE, SITE_PHONE_DISPLAY } from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';
import '../styles/pages/payment.css';

const PAYMENT_JSON_LD_ID = getStaticPageJsonLdId(STATIC_PAGE_SEO.payment.path);
const PAYMENT_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.payment.path);

const PAYMENT_STEPS = [
  {
    title: 'Выберите кабель',
    text: 'Пришлите марки и метраж. Подтвердим наличие, количество и цену.',
  },
  {
    title: 'При необходимости оформите резерв',
    text: 'По запросу резервируем кабель до 3 дней, пока вы принимаете решение.',
  },
  {
    title: 'Получите счёт',
    text: 'Подтвердите покупку и передайте ФИО или реквизиты компании.',
  },
  {
    title: 'Оплатите заказ',
    text: 'Внесите полную оплату в течение 3 дней. На этот срок кабель в резерве.',
  },
];

function PaymentIcon({ company = false }) {
  return (
    <svg
      className="payment-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {company ? (
        <>
          <path d="M4 22V3h12v19M16 10h4v12M2 22h20M8 7h4M8 11h4M8 15h4M9 22v-3h3v3" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
        </>
      )}
    </svg>
  );
}

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
    <section className="section payment-page">
      <Container>
        <Breadcrumbs current="Оплата" />
        <header className="payment-intro">
          <h1 className="page-title">Оплата заказа</h1>
          <p className="page-subtitle">
            Оплатите заказ по счёту на компанию или физическое лицо. Цену и
            наличие подтвердит менеджер.
          </p>
        </header>

        <aside className="payment-notice">
          <svg
            className="payment-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7h.01" />
          </svg>
          <div>
            <p className="payment-notice__title">
              100% предоплата · Срок оплаты — 3 дня · Цены с НДС
            </p>
            <p>На время оплаты кабель находится в резерве.</p>
          </div>
          <Link to="/oferta/">Условия покупки →</Link>
        </aside>

        <section
          className="payment-buyers"
          aria-labelledby="payment-buyers-title"
        >
          <h2 id="payment-buyers-title">Что нужно для выставления счёта</h2>
          <div className="payment-buyers__grid">
            <article className="payment-buyer">
              <PaymentIcon company />
              <div>
                <h3>Для компаний и ИП</h3>
                <p>
                  Передайте менеджеру реквизиты компании и подтвердите состав
                  заказа.
                </p>
              </div>
            </article>
            <article className="payment-buyer">
              <PaymentIcon />
              <div>
                <h3>Для физических лиц</h3>
                <p>Для выставления счёта достаточно сообщить менеджеру ФИО.</p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="payment-order"
          aria-labelledby="payment-order-title"
        >
          <h2 id="payment-order-title">Как оформить и оплатить заказ</h2>
          <ol className="payment-order__steps">
            {PAYMENT_STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <Link className="payment-order__delivery" to="/delivery/">
            Подготовка и получение заказа →
          </Link>
        </section>

        <section
          className="payment-terms"
          aria-labelledby="payment-terms-title"
        >
          <h2 id="payment-terms-title">Условия покупки</h2>
          <p>
            Окончательную цену и порядок заключения договора фиксируем в счёте,
            договоре или другом согласованном документе. Условия оплаты,
            получения и рассмотрения претензий сообщаем до оплаты.
          </p>
          <p>
            Для розничных покупок действуют{' '}
            <Link to="/oferta/">публичная оферта</Link> и согласованные условия
            заказа.
          </p>
        </section>

        <div className="payment-contact">
          <div>
            <h2>Нужен счёт на оплату?</h2>
            <p>Пришлите список позиций и контакты менеджеру.</p>
            <a href={`tel:${SITE_PHONE}`}>{SITE_PHONE_DISPLAY}</a>
          </div>
          <div className="payment-contact__actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleOpenPaymentLead}
            >
              Запросить счёт
            </button>
            <a href="/documents/company-details.pdf">Скачать реквизиты ↓</a>
          </div>
        </div>
      </Container>
    </section>
  );
}
