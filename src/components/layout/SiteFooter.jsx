// Файл формирует футер сайта с контактами, навигацией, реквизитами и сервисными ссылками.

import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import CallbackButton from '../forms/CallbackButton';
import {
  ABOUT_CANONICAL_PATH,
  CABLE_WEIGHT_CANONICAL_PATH,
  CATALOG_CANONICAL_PATH,
  CONTACTS_CANONICAL_PATH,
  DELIVERY_CANONICAL_PATH,
  PAYMENT_CANONICAL_PATH,
} from '../../lib/canonicalPaths.js';
import { SERVICES_PATH } from '../../lib/cableServices';
import {
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_NAME,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_TELEGRAM_URL,
  SITE_WHATSAPP_URL,
  SITE_WORKING_HOURS_DISPLAY,
} from '../../lib/siteConfig';
import '../../styles/layout/footer.css';

export default function SiteFooter({ onOpenQuote, onManageCookies }) {
  return (
    <footer className="site-footer">
      <Container>
        <div className="site-footer__cta-block">
          <div className="site-footer__cta-copy">
            <h2 className="site-footer__cta-title">
              Нужно коммерческое предложение?
            </h2>
            <p className="site-footer__cta-text">
              Отправьте список нужных позиций — подготовим КП с актуальными
              ценами
              {` ${SITE_QUOTE_RESPONSE_DISPLAY}.`}
            </p>
          </div>

          <div className="site-footer__cta-side">
            <button
              type="button"
              className="site-footer__hero-cta"
              onClick={onOpenQuote}
            >
              Запросить КП
            </button>

            <div
              className="site-footer__quick-actions"
              role="group"
              aria-label="Быстрые контакты"
            >
              <div className="site-footer__quick-actions-label">
                или свяжитесь удобным способом:
              </div>
              <div className="site-footer__quick-links">
                <a href={SITE_PHONE_HREF} className="site-footer__quick-link">
                  {SITE_PHONE_DISPLAY}
                </a>
                <span className="site-footer__quick-divider" aria-hidden="true">
                  ·
                </span>
                <a
                  href={SITE_TELEGRAM_URL}
                  className="site-footer__quick-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Telegram
                </a>
                <span className="site-footer__quick-divider" aria-hidden="true">
                  ·
                </span>
                <a
                  href={SITE_WHATSAPP_URL}
                  className="site-footer__quick-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </Container>
      <div className="site-footer__bottom">
        <Container>
          <Link
            to="/"
            className="site-footer__brand"
            aria-label={`${SITE_NAME} — главная`}
          >
            <strong>ЮУЭК</strong>
            <span>{SITE_NAME}</span>
          </Link>
          <div className="site-footer__top">
            <div className="site-footer__column">
              <h3 className="site-footer__title">Каталог</h3>
              <div className="site-footer__links">
                <Link
                  to={`${CATALOG_CANONICAL_PATH}?category=Силовой%20кабель`}
                >
                  Силовой кабель
                </Link>
                <Link to="/catalog/kontrolnye-kabeli">Контрольный кабель</Link>
                <Link to="/catalog/kabeli-svyazi">Кабели связи</Link>
                <Link to={`${CATALOG_CANONICAL_PATH}?category=Гибкий%20кабель`}>
                  Гибкий кабель
                </Link>
                <Link to={CATALOG_CANONICAL_PATH}>Весь каталог →</Link>
              </div>
            </div>

            <div className="site-footer__column">
              <h3 className="site-footer__title">Как мы работаем</h3>
              <div className="site-footer__links">
                <Link to="/how-to-order/">Как оформить заявку</Link>
                <Link to="/specification/">Заявка по спецификации</Link>
                <Link to={PAYMENT_CANONICAL_PATH}>Условия оплаты</Link>
                <Link to={DELIVERY_CANONICAL_PATH}>Получение заказа</Link>
                <Link to={CABLE_WEIGHT_CANONICAL_PATH}>Калькулятор веса</Link>
                <Link to={SERVICES_PATH}>Все сервисы</Link>
                <Link to="/quality/">Качество и документы</Link>
              </div>
            </div>

            <div className="site-footer__column">
              <h3 className="site-footer__title">Компания</h3>
              <div className="site-footer__links">
                <Link to={ABOUT_CANONICAL_PATH}>О компании</Link>
                <Link to={DELIVERY_CANONICAL_PATH}>Получение заказа</Link>
                <Link to={PAYMENT_CANONICAL_PATH}>Оплата</Link>
                <Link to={CONTACTS_CANONICAL_PATH}>Контакты</Link>
                <Link to="/oferta/">Публичная оферта</Link>
                <Link to="/privacy">Политика конфиденциальности</Link>
                <button
                  type="button"
                  className="site-footer__link-button"
                  onClick={onManageCookies}
                >
                  Настройки cookie
                </button>
              </div>
            </div>

            <div className="site-footer__contacts">
              <h3 className="site-footer__title">Контакты</h3>
              <a href={SITE_PHONE_HREF} className="site-footer__phone">
                {SITE_PHONE_DISPLAY}
              </a>
              <CallbackButton
                className="site-footer__link-button"
                source="Заказ звонка: футер"
              />
              <a href={SITE_EMAIL_HREF} className="site-footer__mail">
                {SITE_EMAIL}
              </a>
              <div className="site-footer__text">
                Офис: {SITE_OFFICE_ADDRESS_DISPLAY}
                <br />
                {SITE_WORKING_HOURS_DISPLAY}
              </div>
            </div>
          </div>

          <div className="site-footer__legal">
            © 2026 {SITE_NAME}. Условия розничной покупки изложены в публичной
            оферте. <Link to="/privacy">Политика конфиденциальности</Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}
