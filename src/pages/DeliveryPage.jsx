import { Link } from 'react-router-dom';
// Файл рендерит информационную страницу доставки с условиями, регионами и SEO-метаданными.

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import ConsentGatedMap from '../components/layout/ConsentGatedMap';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_WORKING_HOURS_DISPLAY,
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
              Схема проезда до входа на склад
            </h2>
            <div className="contacts-map-frame">
              <ConsentGatedMap
                title="Схема проезда к складу самовывоза"
                src={SITE_WAREHOUSE_MAP_EMBED_URL}
              />
            </div>
          </div>
        </section>

        <div className="delivery-pickup-guide">
          <section className="content-columns content-columns--spaced pickup-reserve">
            <div>
              <h2 className="delivery-section-title">
                Подготовка заказа к выдаче
              </h2>
              <p className="content-lead">
                Готовим заказ за 1–3 рабочих дня после оплаты. Менеджер сообщит,
                когда можно приезжать или направлять перевозчика.
              </p>
              <p className="content-lead">
                <Link to="/payment/" className="delivery-page__text-link">
                  Условия оплаты и резервирования →
                </Link>
              </p>
            </div>
          </section>
          <section className="content-columns content-columns--spaced pickup-before">
            <div>
              <h2 className="delivery-section-title">
                Перед приездом на склад
              </h2>
              <p className="content-lead">
                После подтверждения готовности заказ можно забрать по будням с
                09:00 до 17:00. Детали отгрузки согласуются лично с менеджером.
              </p>
            </div>
            <ol className="delivery-steps">
              <li>
                <strong>Дождитесь готовности заказа</strong>
                <span>
                  Менеджер подтвердит, что продукция подготовлена к выдаче.
                  После этого можно ехать на склад.
                </span>
              </li>
              <li>
                <strong>Подготовьте доверенность</strong>
                <span>
                  Для получения груза от имени компании нужна доверенность на
                  получение груза.
                </span>
              </li>
              <li>
                <strong>Подберите транспорт</strong>
                <span>
                  Уточните у менеджера номер кабельного барабана или примерный
                  вес кабеля в бухтах.
                </span>
              </li>
              <li>
                <strong>Передайте водителю маршрут</strong>
                <span>
                  Адрес и проезд указаны на карте. Пропуск для въезда на склад
                  не требуется.
                </span>
              </li>
            </ol>
          </section>
          <section className="content-columns content-columns--spaced pickup-documents">
            <div>
              <h2 className="delivery-section-title">
                Документы для получения
              </h2>
              <p className="content-lead">
                При получении заказа от имени компании подготовьте доверенность
                на получение груза.
              </p>
            </div>
            <div className="delivery-pickup-list">
              <div>
                <h3>Доверенность от компании</h3>
                <p>
                  Передайте доверенность сотруднику или водителю, который будет
                  забирать заказ. Вопросы по оформлению согласуйте с менеджером.
                </p>
              </div>
            </div>
          </section>
          <section className="content-columns content-columns--spaced pickup-loading">
            <div>
              <h2 className="delivery-section-title">
                Подбор транспорта и погрузка
              </h2>
              <p className="content-lead">
                Учитывайте размеры и вес всего груза, включая упаковку и
                кабельные барабаны.
              </p>
            </div>
            <ul className="delivery-pickup-list">
              <li>
                <h3>Уточните параметры заказа</h3>
                <p>
                  Для кабеля на барабане менеджер сообщит номер барабана, для
                  кабеля в бухтах — примерный вес. Уточните эти данные перед
                  выбором автомобиля.
                </p>
              </li>
              <li>
                <h3>Подберите подходящую машину</h3>
                <p>
                  Проверьте грузоподъёмность, размеры кузова и возможность
                  размещения и крепления груза. Для загрузки краном согласуйте с
                  менеджером подходящий тип кузова.
                </p>
              </li>
              <li>
                <h3>Погрузка краном</h3>
                <p>
                  Работники склада загружают заказ с помощью крана. Детали
                  погрузки согласуйте с менеджером до подачи автомобиля.
                </p>
              </li>
            </ul>
          </section>
        </div>
        <section className="content-columns content-columns--spaced">
          <div>
            <h2 className="delivery-section-title">
              Самовывоз транспортной компанией
            </h2>
            <p className="content-lead">
              Вы можете самостоятельно заказать забор груза у любого
              перевозчика.
            </p>
          </div>
          <ul className="delivery-pickup-list">
            <li>
              <h3>Закажите забор со склада</h3>
              <p>
                После подтверждения готовности самостоятельно выберите
                транспортную компанию, оформите заявку на забор и оплатите её
                услуги. Стоимость и сроки перевозки уточняйте у перевозчика.
              </p>
            </li>
            <li>
              <h3>Согласуйте получение с менеджером</h3>
              <p>
                Передайте данные водителя или экспедитора. Сообщите перевозчику
                адрес склада, часы выдачи и параметры груза. Для получения от
                имени компании нужна доверенность на получение груза.
              </p>
            </li>
            <li>
              <h3>Забор в часы выдачи</h3>
              <p>
                Выдаём заказ по будням с 09:00 до 17:00. Въезд без пропуска,
                погрузку краном выполняют работники склада.
              </p>
            </li>
          </ul>
        </section>

        <div className="delivery-manager-card">
          <h2 className="delivery-manager-card__title">
            Дополнительная информация
          </h2>
          <p className="delivery-manager-card__text">
            Для согласования самовывоза свяжитесь с менеджером по телефону{' '}
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
