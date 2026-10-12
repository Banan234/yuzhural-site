// Файл рендерит информационную страницу доставки с условиями, регионами и SEO-метаданными.

import Container from '../components/ui/Container';
import ConsentGatedMap from '../components/layout/ConsentGatedMap';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_EMBED_URL,
  SITE_WAREHOUSE_MAP_URL,
} from '../lib/siteConfig';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import '../styles/pages/content.css';

const DELIVERY_JSON_LD_ID = getStaticPageJsonLdId(
  STATIC_PAGE_SEO.delivery.path
);
const DELIVERY_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.delivery.path);

export default function DeliveryPage() {
  function handleOpenDeliveryLead() {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          title: 'Задать вопрос менеджеру',
          subtitle: 'Коротко опишите задачу — мы свяжемся с вами.',
          submitLabel: 'Задать вопрос',
          source: 'CTA на странице доставки',
        },
      })
    );
  }

  useSEO({
    title: STATIC_PAGE_SEO.delivery.title,
    description: STATIC_PAGE_SEO.delivery.description,
    canonical: STATIC_PAGE_SEO.delivery.path,
  });

  useJsonLd(DELIVERY_JSON_LD_ID, DELIVERY_JSON_LD);

  return (
    <section className="section">
      <Container>
        <div className="delivery-page__hero">
          <div className="delivery-page__intro">
            <h1 className="page-title">Доставка</h1>
            <p className="page-subtitle">
              Отгружаем кабельно-проводниковую продукцию самовывозом со склада
              или передаём заказ в транспортную компанию по выбору покупателя.
            </p>
            <div
              className="delivery-page__badges"
              aria-label="Условия доставки"
            >
              <span>Самовывоз со склада</span>
              <span>Любая транспортная компания</span>
              <span>Перевозка за счёт покупателя</span>
            </div>
          </div>

          <aside className="info-note delivery-page__hero-note">
            <strong className="delivery-page__hero-note-title">
              Согласование отгрузки
            </strong>
            Для согласования самовывоза или отправки транспортной компанией
            свяжитесь с менеджером по телефону{' '}
            <a href={`tel:${SITE_PHONE}`} className="info-note__link">
              {SITE_PHONE_DISPLAY}
            </a>{' '}
            или отправьте заявку с перечнем позиций, выбранным способом
            получения и желаемой датой отгрузки.
          </aside>
        </div>

        <div className="delivery-options" aria-label="Способы получения">
          <article className="delivery-option">
            <div>
              <h2 className="delivery-option__title">Самовывоз со склада</h2>
            </div>
            <p>
              Забрать заказ можно после подтверждения готовности. Склад
              самовывоза находится по адресу:{' '}
              <a href={SITE_WAREHOUSE_MAP_URL} target="_blank" rel="noreferrer">
                {SITE_WAREHOUSE_ADDRESS_DISPLAY}
              </a>
              . На карте отмечены точка проезда и входы на склад.
            </p>
            <div className="content-actions">
              <a
                href={SITE_WAREHOUSE_MAP_URL}
                target="_blank"
                rel="noreferrer"
                className="button-secondary"
              >
                Посмотреть адрес и входы на склад
              </a>
            </div>
          </article>

          <article className="delivery-option delivery-option--filled">
            <div>
              <h2 className="delivery-option__title">
                Отправка транспортной компанией
              </h2>
            </div>
            <p>
              Организуем передачу груза в любую транспортную компанию: оформляем
              отгрузку по согласованным данным и передаём документы. Услуги
              перевозчика оплачивает покупатель по тарифам выбранной ТК.
            </p>
          </article>
        </div>

        <div className="contacts-map-card delivery-route-map">
          <div className="contacts-map-card__title">Схема проезда к складу</div>
          <div className="contacts-map-frame">
            <ConsentGatedMap
              title="Схема проезда к складу самовывоза"
              src={SITE_WAREHOUSE_MAP_EMBED_URL}
            />
          </div>
          <div className="contacts-map-card__footer">
            <span>
              Маршрут до входа на склад: {SITE_WAREHOUSE_ADDRESS_DISPLAY}
            </span>
            <a href={SITE_WAREHOUSE_MAP_URL} target="_blank" rel="noreferrer">
              Открыть в Яндекс Картах
            </a>
          </div>
        </div>

        <div className="content-columns content-columns--spaced">
          <div>
            <h2 className="delivery-section-title">Как проходит отгрузка</h2>
            <p className="content-lead">
              Сначала фиксируем способ получения, затем готовим заказ к выдаче
              или передаче перевозчику.
            </p>
          </div>

          <ol className="delivery-steps">
            <li>
              <strong>Согласование заказа</strong>
              <span>Проверяем наличие, объём партии и дату готовности.</span>
            </li>
            <li>
              <strong>Выбор способа получения</strong>
              <span>Фиксируем самовывоз или транспортную компанию.</span>
            </li>
            <li>
              <strong>Подготовка груза</strong>
              <span>Комплектуем заказ и готовим документы к отгрузке.</span>
            </li>
            <li>
              <strong>Передача заказа</strong>
              <span>Выдаём груз на складе или передаём его перевозчику.</span>
            </li>
          </ol>
        </div>

        <div className="content-columns content-columns--spaced">
          <div>
            <h2 className="delivery-section-title">
              Что нужно указать в заявке
            </h2>
            <p className="content-lead">
              Достаточно заранее передать несколько деталей. Это помогает без
              задержек подготовить передачу груза.
            </p>
          </div>

          <ul className="info-list">
            <li>ФИО и телефон водителя или экспедитора для самовывоза.</li>
            <li>Название транспортной компании и нужный терминал отправки.</li>
            <li>Реквизиты получателя груза и контакт для связи.</li>
            <li>Требования к упаковке, маркировке или комплекту документов.</li>
          </ul>
        </div>

        <div className="delivery-manager-card">
          <h2 className="delivery-manager-card__title">
            Дополнительная информация
          </h2>
          <p className="delivery-manager-card__text">
            Для получения более подробной информации о наших условиях доставки,
            пожалуйста, свяжитесь с нашими сотрудниками. Мы готовы ответить на
            все ваши вопросы и предоставить консультацию по всем аспектам
            доставки вашего заказа.
          </p>
          <div className="content-actions delivery-manager-card__actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleOpenDeliveryLead}
            >
              Связаться с менеджером
            </button>
          </div>
          <p className="delivery-manager-card__text delivery-manager-card__text--after-action">
            Мы ценим ваше время и стремимся сделать процесс получения продукции
            максимально простым и удобным для вас. Наша цель - обеспечить
            качественную и своевременную доставку, чтобы вы могли
            сосредоточиться на развитии своего бизнеса, не беспокоясь о
            логистике. Спасибо, что выбрали нашу компанию для сотрудничества!
          </p>
        </div>
      </Container>
    </section>
  );
}
