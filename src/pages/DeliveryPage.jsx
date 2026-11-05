import { Link } from 'react-router-dom';
// Файл рендерит информационную страницу доставки с условиями, регионами и SEO-метаданными.

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import ConsentGatedMap from '../components/layout/ConsentGatedMap';
import WarehouseMap from '../components/layout/WarehouseMap';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_WORKING_HOURS_DISPLAY,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
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

function PickupIcon({ type }) {
  const paths = {
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    document: (
      <>
        <path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8" />
      </>
    ),
    truck: (
      <>
        <path d="M2 5h12v13H2zM14 10h4l4 4v4h-8" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    route: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    crane: (
      <>
        <path d="M4 22h8M6 22V3h4v19M2 7l6-5 14 5H2ZM18 7v8h-3v3a2 2 0 0 0 4 0M6 11l4 4-4 4" />
      </>
    ),
  };
  return (
    <svg
      className="pickup-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  );
}

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
    <section className="section delivery-page">
      <Container>
        <Breadcrumbs current="Получение заказа" />
        <header className="delivery-page__intro">
          <h1 className="page-title">Получение заказа</h1>
          <p className="page-subtitle">
            Заберите заказ со склада самостоятельно или закажите забор своей
            транспортной компанией.
          </p>
        </header>

        <section className="delivery-page__panel delivery-page__panel--pickup">
          <article className="delivery-option">
            <h2 className="delivery-option__title">Самовывоз со склада</h2>
            <div className="delivery-page__address">
              <span>Адрес склада</span>
              <a href={SITE_WAREHOUSE_MAP_URL} target="_blank" rel="noreferrer">
                {SITE_WAREHOUSE_ADDRESS_DISPLAY}
              </a>
            </div>
            <dl className="delivery-pickup-details">
              <div>
                <dt>График работы</dt>
                <dd>{SITE_WORKING_HOURS_DISPLAY}</dd>
                <dd className="delivery-pickup-details__note">
                  После подтверждения готовности можно приезжать за заказом в
                  часы выдачи.
                </dd>
              </div>
              <div>
                <dt>Согласование отгрузки</dt>
                <dd>
                  <a href={`tel:${SITE_PHONE}`}>{SITE_PHONE_DISPLAY}</a>
                </dd>
              </div>
            </dl>
            <p>
              Въезд на склад без пропуска. Маршрут указан на карте. Детали
              получения заказа согласуйте с менеджером.
            </p>
          </article>

          <div className="contacts-map-card delivery-route-map">
            <h2 className="contacts-map-card__title">
              Схема проезда до склада
            </h2>
            <div className="contacts-map-frame">
              <ConsentGatedMap title="Схема проезда к складу самовывоза">
                <WarehouseMap />
              </ConsentGatedMap>
            </div>
          </div>
        </section>

        <aside className="pickup-ready">
          <PickupIcon type="info" />
          <div>
            <p className="pickup-ready__title">
              Подготовка заказа — 1–3 рабочих дня после оплаты
            </p>
            <p>
              Дождитесь подтверждения менеджера перед приездом или отправкой
              перевозчика.
            </p>
          </div>
          <Link to="/payment/" className="delivery-page__text-link">
            Условия оплаты и резервирования →
          </Link>
        </aside>

        <section
          className="pickup-topics"
          aria-labelledby="pickup-topics-title"
        >
          <h2 id="pickup-topics-title" className="delivery-section-title">
            Перед приездом на склад
          </h2>
          <div className="pickup-topics__grid">
            <article className="pickup-topic">
              <PickupIcon type="document" />
              <div>
                <h3>Документы для получения</h3>
                <p>
                  Для выставления счёта физическому лицу достаточно сообщить
                  менеджеру ФИО.
                </p>
                <p>
                  Для получения от имени компании нужна доверенность на
                  получение груза.
                </p>
                <ul>
                  <li>Передайте её сотруднику или водителю.</li>
                  <li>Вопросы по оформлению согласуйте с менеджером.</li>
                </ul>
              </div>
            </article>
            <article className="pickup-topic">
              <PickupIcon type="truck" />
              <div>
                <h3>Подбор транспорта</h3>
                <ul>
                  <li>
                    Уточните у менеджера номер барабана или примерный вес кабеля
                    в бухтах.
                  </li>
                  <li>
                    Проверьте грузоподъёмность, размеры кузова и возможность
                    размещения и крепления груза. Учитывайте вес и размеры
                    упаковки и барабанов.
                  </li>
                </ul>
              </div>
            </article>
            <article className="pickup-topic">
              <PickupIcon type="route" />
              <div>
                <h3>Маршрут и время выдачи</h3>
                <p className="pickup-topic__hours">
                  {SITE_WORKING_HOURS_DISPLAY}
                </p>
                <p>Адрес и проезд указаны на карте выше.</p>
                <p className="pickup-topic__fact">Въезд без пропуска.</p>
              </div>
            </article>
            <article className="pickup-topic">
              <PickupIcon type="crane" />
              <div>
                <h3>Погрузка на складе</h3>
                <p>
                  Работники склада загружают заказ с помощью крана. Погрузка
                  входит в стоимость заказа и отдельно не оплачивается.
                </p>
                <p>
                  До подачи автомобиля согласуйте с менеджером тип кузова и
                  детали погрузки.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="pickup-carrier">
          <PickupIcon type="truck" />
          <div>
            <h2>Забор транспортной компанией</h2>
            <p>
              После подтверждения готовности закажите и оплатите забор у
              перевозчика. Передайте менеджеру данные водителя, а перевозчику —
              адрес, часы выдачи и параметры груза.
            </p>
          </div>
        </section>

        <div className="delivery-manager-card">
          <h2 className="delivery-manager-card__title">
            Согласовать получение заказа
          </h2>
          <p className="delivery-manager-card__text">
            <a href={`tel:${SITE_PHONE}`} className="delivery-page__text-link">
              {SITE_PHONE_DISPLAY}
            </a>
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
