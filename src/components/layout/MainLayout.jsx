// Файл задаёт общий каркас страниц: шапку, меню, футер, модалки и отслеживание pageview.

import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import Container from '../ui/Container';
import Modal from '../ui/Modal';
import HeroLeadForm from '../home/HeroLeadForm';
import FloatingLeadWidget from './FloatingLeadWidget';
import HeaderCatalogMenu from './HeaderCatalogMenu';
import HeaderSearch from './HeaderSearch';
import SiteFooter from './SiteFooter';
import CookieConsent from './CookieConsent';
import { openCookieSettings } from '../../lib/cookieConsent';
import { useCartStore } from '../../store/useCartStore';
import { trackEvent } from '../../lib/analytics';
import { usePageviewTracking } from '../../hooks/usePageviewTracking';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage';
import {
  ABOUT_CANONICAL_PATH,
  CONTACTS_CANONICAL_PATH,
  DELIVERY_CANONICAL_PATH,
  PAYMENT_CANONICAL_PATH,
} from '../../lib/canonicalPaths.js';
import { SERVICES_PATH } from '../../lib/cableServices';
import {
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_WORKING_HOURS_DISPLAY,
} from '../../lib/siteConfig';

const MOBILE_NAV_ID = 'mobile-navigation';
const DOCUMENTS_PATH = `${ABOUT_CANONICAL_PATH}#documents`;

const LazyQuoteForm = lazy(() => import('../quote/QuoteForm'));
const LazyMobileNav = lazy(() => import('./MobileNav'));

function ModalFormFallback() {
  return (
    <div className="route-fallback" aria-busy="true" aria-live="polite">
      <span className="route-fallback__spinner" aria-hidden="true" />
      <span className="route-fallback__text">Загружаем форму...</span>
    </div>
  );
}

function buildStorageWarningMessage(key) {
  if (key === 'yuzhural-cart') {
    return 'Список для КП изменён только на этом экране: браузер не дал сохранить корзину. Уменьшите список или очистите место в браузере.';
  }

  return 'Браузер не дал сохранить изменения локально. Они видны сейчас, но могут пропасть после перезагрузки страницы.';
}

function HeaderCartLink({ totalCount, mobile = false }) {
  return (
    <Link
      to="/cart"
      className={`site-header__cart${mobile ? ' site-header__cart--mobile' : ''}`}
      aria-label={mobile ? 'Открыть список для КП' : 'Открыть корзину'}
    >
      <svg
        className="site-header__cart-icon site-header__cart-icon--svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {mobile ? (
        <span className="site-header__cart-label">Список КП</span>
      ) : null}
      {totalCount > 0 ? <span className="cart-badge">{totalCount}</span> : null}
    </Link>
  );
}

export default function MainLayout() {
  const items = useCartStore((state) => state.items);
  const totalCount = items.length;

  const location = useLocation();
  const isHomePage = location.pathname === '/';
  usePageviewTracking();

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [leadModalOptions, setLeadModalOptions] = useState({});
  const [quoteModalOptions, setQuoteModalOptions] = useState({});
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageWarning, setStorageWarning] = useState(null);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 48);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleOpenLead(event) {
      setLeadModalOptions(event.detail || {});
      setIsLeadModalOpen(true);
      trackEvent('quote-open', {
        source: event.detail?.source || event.type || 'unknown',
        kind: 'lead',
      });
    }

    function handleOpenQuote(event) {
      setQuoteModalOptions(event.detail || {});
      setIsQuoteModalOpen(true);
      trackEvent('quote-open', {
        source: event.detail?.source || event.type || 'cart',
        kind: 'quote',
      });
    }

    window.addEventListener('open-lead-modal', handleOpenLead);
    window.addEventListener('open-quote-modal', handleOpenLead);
    window.addEventListener('open-cart-quote-modal', handleOpenQuote);

    return () => {
      window.removeEventListener('open-lead-modal', handleOpenLead);
      window.removeEventListener('open-quote-modal', handleOpenLead);
      window.removeEventListener('open-cart-quote-modal', handleOpenQuote);
    };
  }, []);

  useEffect(() => {
    function handleStorageWriteFailed(event) {
      const key = event.detail?.key || '';
      setStorageWarning({
        key,
        message: buildStorageWarningMessage(key),
      });
    }

    window.addEventListener(
      STORAGE_WRITE_FAILED_EVENT,
      handleStorageWriteFailed
    );

    return () => {
      window.removeEventListener(
        STORAGE_WRITE_FAILED_EVENT,
        handleStorageWriteFailed
      );
    };
  }, []);

  function handleLogoClick(event) {
    if (location.pathname === '/' && !location.search && !location.hash) {
      event.preventDefault();
      window.location.reload();
    }
  }

  function openLeadModal(options = {}) {
    setLeadModalOptions(options);
    setIsLeadModalOpen(true);
    trackEvent('quote-open', {
      source: options.source || 'lead',
      kind: 'lead',
    });
  }

  return (
    <div>
      <header
        className={`site-header${isScrolled ? ' site-header--scrolled' : ''}`}
      >
        <div className="site-header__topbar">
          <Container>
            <div className="site-header__topbar-inner">
              <div className="site-header__topbar-left">
                <span className="topbar-item">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Офис: {SITE_OFFICE_ADDRESS_DISPLAY}
                </span>
                <span className="topbar-item">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {SITE_WORKING_HOURS_DISPLAY}
                </span>
              </div>
              <div className="site-header__topbar-right">
                <a href="/price.xls" download className="topbar-download">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  Скачать прайс-лист
                </a>
              </div>
            </div>
          </Container>
        </div>

        <div className="site-header__main">
          <Container>
            <div className="site-header__main-inner">
              <Link
                to="/"
                className="site-header__logo"
                onClick={handleLogoClick}
              >
                <picture>
                  <source srcSet="/logo.webp" type="image/webp" />
                  <img
                    src="/logo.png"
                    alt="ЮжУралЭлектроКабель"
                    className="site-header__logo-image"
                    width="600"
                    height="160"
                    loading="eager"
                    decoding="async"
                  />
                </picture>
              </Link>

              <div className="site-header__main-search">
                <HeaderSearch />
              </div>

              <div className="site-header__main-right">
                <div className="header-phone-block">
                  <a href={SITE_PHONE_HREF} className="header-phone">
                    {SITE_PHONE_DISPLAY}
                  </a>
                  <a href={SITE_EMAIL_HREF} className="header-phone-sub">
                    {SITE_EMAIL}
                  </a>
                </div>

                <button
                  type="button"
                  className="button-primary header-cta-btn"
                  onClick={() =>
                    openLeadModal({
                      title: 'Заказать звонок',
                      subtitle:
                        'Оставьте телефон и комментарий — менеджер перезвонит в рабочее время.',
                      submitLabel: 'Заказать звонок',
                      source: 'Кнопка в хедере',
                    })
                  }
                >
                  Заказать звонок
                </button>

                <button
                  type="button"
                  className="header-quote-btn"
                  onClick={() =>
                    openLeadModal({
                      title: 'Запросить КП',
                      subtitle:
                        'Оставьте телефон и список нужных позиций — подготовим коммерческое предложение.',
                      submitLabel: 'Запросить КП',
                      source: 'Кнопка КП в шапке',
                    })
                  }
                >
                  Запросить КП
                </button>

                <a
                  href={SITE_PHONE_HREF}
                  className="site-header__mobile-phone"
                  aria-label={`Позвонить: ${SITE_PHONE_DISPLAY}`}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.19 18a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.09 3.18 2 2 0 0 1 4.08 1h3a2 2 0 0 1 2 1.72c.12.96.35 1.91.68 2.81a2 2 0 0 1-.45 2.11L8.04 8.91a16 16 0 0 0 7.05 7.05l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.85.56 2.81.68A2 2 0 0 1 22 16.92z" />
                  </svg>
                </a>

                <button
                  type="button"
                  className="mobile-menu-button"
                  onClick={() => setIsMobileNavOpen(true)}
                  aria-label="Открыть меню"
                  aria-controls={isMobileNavOpen ? MOBILE_NAV_ID : undefined}
                  aria-expanded={isMobileNavOpen}
                >
                  <span className="mobile-menu-button__bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="mobile-menu-button__label">Меню</span>
                </button>
              </div>

              <HeaderCartLink totalCount={totalCount} mobile />
            </div>
          </Container>
        </div>

        <div className="site-header__nav">
          <Container>
            <div className="site-header__nav-inner">
              <nav
                className="site-header__menu"
                aria-label="Основная навигация"
              >
                <HeaderCatalogMenu />

                <NavLink
                  to={DELIVERY_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Доставка
                </NavLink>
                <NavLink
                  to={PAYMENT_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Оплата
                </NavLink>
                <NavLink
                  to={SERVICES_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Сервисы
                </NavLink>
                <Link to={DOCUMENTS_PATH} className="nav-link">
                  Документы
                </Link>
                <NavLink
                  to={CONTACTS_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Контакты
                </NavLink>
                <NavLink
                  to={ABOUT_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  О компании
                </NavLink>
              </nav>

              <div className="site-header__actions">
                <HeaderCartLink totalCount={totalCount} />
              </div>
            </div>
          </Container>
        </div>
      </header>

      {storageWarning ? (
        <div className="storage-warning" role="alert">
          <Container>
            <div className="storage-warning__inner">
              <span className="storage-warning__text">
                {storageWarning.message}
              </span>
              <button
                type="button"
                className="storage-warning__close"
                onClick={() => setStorageWarning(null)}
              >
                Понятно
              </button>
            </div>
          </Container>
        </div>
      ) : null}

      {isMobileNavOpen ? (
        <Suspense fallback={null}>
          <LazyMobileNav
            id={MOBILE_NAV_ID}
            isOpen={isMobileNavOpen}
            onClose={() => setIsMobileNavOpen(false)}
            onOpenQuote={() =>
              openLeadModal({
                title: 'Запросить КП',
                subtitle:
                  'Оставьте телефон и список нужных позиций — подготовим коммерческое предложение.',
                submitLabel: 'Запросить КП',
                source: 'Мобильное меню',
              })
            }
          />
        </Suspense>
      ) : null}

      <main>
        <Suspense
          fallback={
            <div
              className="route-fallback route-fallback--page"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="route-fallback__spinner" aria-hidden="true" />
              <span className="route-fallback__text">
                Загружаем страницу...
              </span>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter
        onManageCookies={openCookieSettings}
        onOpenQuote={() =>
          openLeadModal({
            title: 'Получить КП',
            subtitle:
              'Оставьте телефон и список нужных позиций — подготовим коммерческое предложение.',
            submitLabel: 'Получить КП',
            source: 'CTA в футере',
          })
        }
      />

      <CookieConsent />

      <FloatingLeadWidget
        autoOpen={false}
        sourceLabel={isHomePage ? 'Главная страница' : 'Внутренняя страница'}
      />

      <Modal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        windowClassName="modal-window--lead"
      >
        <HeroLeadForm
          title={leadModalOptions.title || 'Получить КП или заказать звонок'}
          subtitle={
            leadModalOptions.subtitle ||
            'Оставьте телефон и комментарий — менеджер свяжется с вами.'
          }
          submitLabel={leadModalOptions.submitLabel || 'Отправить заявку'}
          defaultComment={leadModalOptions.comment || ''}
          source={leadModalOptions.source || 'Короткая форма'}
          idPrefix="modal-lead"
        />
      </Modal>

      <Modal
        isOpen={isQuoteModalOpen}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setQuoteModalOptions({});
        }}
      >
        <Suspense fallback={<ModalFormFallback />}>
          <LazyQuoteForm
            title={
              quoteModalOptions.title || 'Запрос коммерческого предложения'
            }
            description={quoteModalOptions.description}
            itemsOverride={quoteModalOptions.items || null}
            idPrefix="modal-quote"
          />
        </Suspense>
      </Modal>
    </div>
  );
}
