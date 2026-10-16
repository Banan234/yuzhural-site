// Файл рендерит мобильную навигацию, поиск, корзину и раскрытие каталога.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG_MENU } from './catalogMenuData';
import {
  ABOUT_CANONICAL_PATH,
  CATALOG_CANONICAL_PATH,
  CONTACTS_CANONICAL_PATH,
  DELIVERY_CANONICAL_PATH,
  PAYMENT_CANONICAL_PATH,
} from '../../lib/canonicalPaths.js';
import { SERVICES_PATH } from '../../lib/cableServices';
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF } from '../../lib/siteConfig';
import CallbackButton from '../forms/CallbackButton';

export default function MobileNav({ id, isOpen, onClose, onOpenQuote }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleQuoteClick() {
    onClose();
    onOpenQuote();
  }

  return (
    <div
      id={id}
      className="mobile-nav"
      role="dialog"
      aria-modal="true"
      aria-label="Мобильное меню"
    >
      <button
        type="button"
        className="mobile-nav__backdrop"
        aria-label="Закрыть меню"
        onClick={onClose}
      />

      <div className="mobile-nav__panel">
        <div className="mobile-nav__top">
          <Link to="/" className="mobile-nav__logo" onClick={onClose}>
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo.png"
                alt="ЮжУралЭлектроКабель"
                width="600"
                height="160"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </Link>

          <button
            type="button"
            className="mobile-nav__close"
            onClick={onClose}
            aria-label="Закрыть меню"
          >
            ×
          </button>
        </div>

        <div className="mobile-nav__body">
          <nav className="mobile-nav__section" aria-label="Каталог">
            <Link
              to={CATALOG_CANONICAL_PATH}
              className="mobile-nav__all-catalog"
              onClick={onClose}
            >
              <span className="mobile-nav__all-catalog-icon" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              Весь каталог
              <span className="mobile-nav__chevron" aria-hidden="true">
                ›
              </span>
            </Link>
            <Link
              to="/marks/"
              className="mobile-nav__all-catalog"
              onClick={onClose}
            >
              Алфавитный перечень марок
              <span className="mobile-nav__chevron" aria-hidden="true">
                ›
              </span>
            </Link>
            <div className="mobile-nav__catalog">
              {CATALOG_MENU.map((group) => (
                <details key={group.slug} className="mobile-nav__catalog-group">
                  <summary>{group.title}</summary>
                  <div className="mobile-nav__catalog-links">
                    <Link to={group.links[0].to} onClick={onClose}>
                      Смотреть все: {group.title.toLocaleLowerCase('ru-RU')}
                    </Link>
                    {group.links.slice(1).map((link) => (
                      <Link key={link.to} to={link.to} onClick={onClose}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </nav>

          <nav className="mobile-nav__section" aria-label="Основная навигация">
            <div className="mobile-nav__links">
              <Link to="/how-to-order/" onClick={onClose}>
                Как заказать
              </Link>
              <Link to="/specification/" onClick={onClose}>
                Заявка по спецификации
              </Link>
              <Link to={DELIVERY_CANONICAL_PATH} onClick={onClose}>
                Доставка
              </Link>
              <Link to={PAYMENT_CANONICAL_PATH} onClick={onClose}>
                Оплата
              </Link>
              <Link to={SERVICES_PATH} onClick={onClose}>
                Сервисы и калькуляторы
              </Link>
              <Link to="/quality/" onClick={onClose}>
                Качество и документы
              </Link>
              <Link to={CONTACTS_CANONICAL_PATH} onClick={onClose}>
                Контакты
              </Link>
              <Link to={ABOUT_CANONICAL_PATH} onClick={onClose}>
                О компании
              </Link>
            </div>
          </nav>
        </div>

        <div className="mobile-nav__footer">
          <CallbackButton
            className="mobile-nav__cta mobile-nav__cta--secondary"
            source="Заказ звонка: мобильное меню"
            onOpen={onClose}
          />
          <button
            type="button"
            className="mobile-nav__cta"
            onClick={handleQuoteClick}
          >
            Запросить КП
          </button>
          <a href={SITE_PHONE_HREF} className="mobile-nav__phone">
            {SITE_PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </div>
  );
}
