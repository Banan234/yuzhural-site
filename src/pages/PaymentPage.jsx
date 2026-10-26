import { Link } from 'react-router-dom';
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
} from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';
import '../styles/pages/payment.css';

const PAYMENT_JSON_LD_ID = getStaticPageJsonLdId(STATIC_PAGE_SEO.payment.path);
const PAYMENT_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.payment.path);

const PAYMENT_MODES = [
  {
    title: 'Для компаний и ИП',
    label: 'Счёт по реквизитам',
    description:
      'Подтвердите покупку и передайте менеджеру реквизиты для выставления счёта.',
    points: [
      'До оплаты согласуем состав заказа, количество и цену.',
      'Оплатите счёт полностью в течение 3 дней.',
      'Цены включают НДС.',
    ],
  },
  {
    title: 'Для физических лиц',
    label: 'Счёт на физическое лицо',
    description:
      'Для выставления счёта физическому лицу достаточно сообщить менеджеру ФИО.',
    points: [
      'Состав заказа и итоговую стоимость с НДС подтверждаем до оплаты.',
      'Срок оплаты счёта — 3 дня.',
      'Работаем по 100% предоплате.',
    ],
  },
];

const PAYMENT_STEPS = [
  {
    title: 'Выберите кабель',
    text: 'Пришлите марки и необходимый метраж. Менеджер подтвердит наличие и цену.',
  },
  {
    title: 'При необходимости оформите резерв',
    text: 'По запросу резервируем кабель максимум на 3 дня, пока вы принимаете решение о покупке.',
  },
  {
    title: 'Подтвердите покупку и получите счёт',
    text: 'Сообщите менеджеру о решении купить. Выставим счёт на физическое лицо или по реквизитам компании.',
  },
  {
    title: 'Оплатите счёт',
    text: 'Оплатите счёт полностью в течение 3 дней. На этот период кабель находится в резерве.',
  },
];

const PAYMENT_LEGAL_NOTES = [
  'Для розничных покупок действуют условия опубликованной оферты и согласованного заказа.',
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
      <section className="section payment-page">
        <Container>
          <Breadcrumbs current="Оплата" />
          <div className="payment-page__hero">
            <div className="payment-page__intro">
              <h1 className="page-title">Оплата заказа</h1>
              <p className="content-lead">
                <Link to="/oferta/">Публичная оферта: условия покупки →</Link>
              </p>
              <p className="page-subtitle">
                Подтвердите покупку и получите счёт на физическое лицо или
                компанию. Работаем по 100% предоплате. Цены включают НДС.
              </p>

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
                Резерв кабеля — до 3 дней
              </h2>
              <p className="payment-summary__text">
                По запросу резервируем кабель максимум на 3 дня. Выставленный
                счёт нужно оплатить в течение 3 дней — на этот же период
                предоставляется резерв.
              </p>
              <ul className="payment-summary__list">
                <li>подтверждаем цену с НДС и наличие до оплаты</li>
                <li>выставляем счёт после подтверждения покупки</li>
                <li>принимаем полную оплату по счёту</li>
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

      <section className="section section--soft payment-page">
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

      <section className="section payment-page">
        <Container>
          <div className="content-columns payment-process">
            <div>
              <h2 className="section-title section-title--left">
                Как оформить и оплатить заказ
              </h2>
              <p className="content-lead">
                Согласуйте состав заказа с менеджером, получите счёт и оплатите
                его в течение срока действия.
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

          <p className="content-lead payment-process__link">
            <Link to="/delivery/">
              Подготовка, документы и получение заказа →
            </Link>
          </p>
          <div className="content-columns content-columns--spaced">
            <div>
              <h2 className="section-title section-title--left">
                Важные условия
              </h2>
              <p className="content-lead">
                Окончательные условия покупки фиксируем в документах по вашему
                заказу.
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

      <section className="section payment-page">
        <Container>
          <div className="payment-cta">
            <div>
              <h2 className="payment-cta__title">Нужен счёт на оплату?</h2>
              <p className="payment-cta__text">
                Отправьте список позиций и контакты. Подготовим счёт, проверим
                наличие и заранее согласуем цену и платёжные документы.
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
