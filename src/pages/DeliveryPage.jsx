// Файл рендерит информационную страницу доставки с условиями, регионами и SEO-метаданными.

import { useId, useRef, useState } from 'react';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { Link } from 'react-router-dom';
import { serviceUrl } from '../lib/cableServices';
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
import '../styles/pages/delivery.css';

const DELIVERY_JSON_LD_ID = getStaticPageJsonLdId(
  STATIC_PAGE_SEO.delivery.path
);
const DELIVERY_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.delivery.path);

export default function DeliveryPage() {
  const [method, setMethod] = useState('pickup');
  const tabsId = useId();
  const tabRefs = useRef([]);
  const isPickup = method === 'pickup';
  const methods = [
    { id: 'pickup', label: 'Самовывоз' },
    { id: 'shipping', label: 'Доставка' },
  ];

  function handleTabKeyDown(event, index) {
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      nextIndex = (index + 1) % methods.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = methods.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setMethod(methods[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

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
    <section className="section delivery-page">
      <Container>
        <Breadcrumbs current="Доставка" />
        <header className="delivery-page__intro">
          <h1 className="page-title">Доставка</h1>
          <p className="page-subtitle">
            Заберите заказ со склада или выберите отправку транспортной
            компанией.
          </p>
        </header>

        <div
          className="delivery-page__tabs"
          role="tablist"
          aria-label="Способ получения"
        >
          {methods.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${tabsId}-tab-${item.id}`}
              aria-controls={`${tabsId}-panel-${item.id}`}
              aria-selected={method === item.id}
              tabIndex={method === item.id ? 0 : -1}
              onClick={() => setMethod(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section
          role="tabpanel"
          id={`${tabsId}-panel-pickup`}
          aria-labelledby={`${tabsId}-tab-pickup`}
          hidden={!isPickup}
          tabIndex={0}
          className="delivery-page__panel"
        >
          <article className="delivery-option">
            <h2 className="delivery-option__title">Самовывоз со склада</h2>
            <p>
              Забрать заказ можно после подтверждения готовности. Склад
              самовывоза находится по адресу:{' '}
              <a href={SITE_WAREHOUSE_MAP_URL} target="_blank" rel="noreferrer">
                {SITE_WAREHOUSE_ADDRESS_DISPLAY}
              </a>
              . Согласуйте с менеджером дату приезда и передайте ФИО и телефон
              водителя или экспедитора.
            </p>
            <div className="content-actions">
              <a
                href={SITE_WAREHOUSE_MAP_URL}
                target="_blank"
                rel="noreferrer"
                className="delivery-page__text-link"
              >
                Посмотреть адрес и входы на склад
              </a>
            </div>
          </article>

          <div className="contacts-map-card delivery-route-map">
            <h2 className="contacts-map-card__title">Схема проезда к складу</h2>
            <div className="contacts-map-frame">
              {isPickup && (
                <ConsentGatedMap
                  title="Схема проезда к складу самовывоза"
                  src={SITE_WAREHOUSE_MAP_EMBED_URL}
                />
              )}
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
        </section>

        <section
          role="tabpanel"
          id={`${tabsId}-panel-shipping`}
          aria-labelledby={`${tabsId}-tab-shipping`}
          hidden={isPickup}
          tabIndex={0}
          className="delivery-page__panel"
        >
          <article className="delivery-option">
            <h2 className="delivery-option__title">
              Отправка транспортной компанией
            </h2>
            <p>
              Организуем передачу груза в любую транспортную компанию: оформляем
              отгрузку по согласованным данным и передаём документы. Услуги
              перевозчика оплачивает покупатель по тарифам выбранной ТК.
            </p>
          </article>
          <aside className="info-note delivery-page__shipping-note">
            Рассчитайте массу, объём и количество грузовых мест перед обращением
            к перевозчику.{' '}
            <Link to={serviceUrl('shipping')} className="info-note__link">
              Подготовить данные для доставки →
            </Link>
          </aside>
        </section>

        <div className="content-columns content-columns--spaced">
          <div>
            <h2 className="delivery-section-title">
              {isPickup ? 'Как забрать заказ' : 'Как проходит доставка'}
            </h2>
            <p className="content-lead">
              {isPickup
                ? 'Согласуем дату приезда и подготовим заказ к выдаче со склада.'
                : 'Согласуем транспортную компанию и подготовим груз к передаче перевозчику.'}
            </p>
          </div>

          <ol className="delivery-steps">
            <li>
              <strong>Согласование заказа</strong>
              <span>Проверяем наличие, объём партии и дату готовности.</span>
            </li>
            <li>
              <strong>
                {isPickup ? 'Дата самовывоза' : 'Выбор перевозчика'}
              </strong>
              <span>
                {isPickup
                  ? 'Согласуем дату приезда и данные водителя.'
                  : 'Фиксируем транспортную компанию и терминал отправки.'}
              </span>
            </li>
            <li>
              <strong>Подготовка груза</strong>
              <span>Комплектуем заказ и готовим документы к отгрузке.</span>
            </li>
            <li>
              <strong>Передача заказа</strong>
              <span>
                {isPickup
                  ? 'Выдаём готовый заказ на складе.'
                  : 'Передаём груз выбранной транспортной компании.'}
              </span>
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
            {isPickup ? (
              <>
                <li>ФИО и телефон водителя или экспедитора.</li>
                <li>Желаемую дату самовывоза.</li>
              </>
            ) : (
              <>
                <li>
                  Название транспортной компании и нужный терминал отправки.
                </li>
                <li>Город назначения и данные получателя.</li>
              </>
            )}
            <li>Реквизиты получателя груза и контакт для связи.</li>
            <li>Требования к упаковке, маркировке или комплекту документов.</li>
          </ul>
        </div>

        <div className="delivery-manager-card">
          <h2 className="delivery-manager-card__title">
            Дополнительная информация
          </h2>
          <p className="delivery-manager-card__text">
            Для согласования {isPickup ? 'самовывоза' : 'доставки'} свяжитесь с
            менеджером по телефону{' '}
            <a href={`tel:${SITE_PHONE}`} className="delivery-page__text-link">
              {SITE_PHONE_DISPLAY}
            </a>{' '}
            или отправьте заявку с перечнем позиций и желаемой датой отгрузки.
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
        </div>
      </Container>
    </section>
  );
}
