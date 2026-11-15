import CableImagePreviewNotice from '../catalog/CableImagePreviewNotice.jsx';
// Файл задаёт общий каркас страниц: шапку, меню, футер, модалки и отслеживание pageview.

import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import CatalogNavigationScroll from './CatalogNavigationScroll';
import { Suspense, lazy, memo, useEffect, useRef, useState } from 'react';
import Container from '../ui/Container';
import Modal from '../ui/Modal';
import HeroLeadForm from '../home/HeroLeadForm';
import CallbackButton from '../forms/CallbackButton';
import FloatingLeadWidget from './FloatingLeadWidget';
import HeaderCatalogMenu from './HeaderCatalogMenu';
import HeaderServicesMenu from './HeaderServicesMenu';
import HeaderSearch from './HeaderSearch';
import PriceDownload from './PriceDownload';
import SiteFooter from './SiteFooter';
import {
  PrerenderDataProvider,
  usePrerenderData,
} from '../../lib/prerenderData';
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
import {
  SITE_EMAIL,
  SITE_TELEGRAM_URL,
  SITE_WHATSAPP_URL,
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_WORKING_HOURS_DISPLAY,
} from '../../lib/siteConfig';

const MOBILE_NAV_ID = 'mobile-navigation';
const DOCUMENTS_PATH = '/quality/';
const EMPTY_PRERENDER_DATA = {};

const LazyMobileNav = lazy(() => import('./MobileNav'));

// Header/overlay/scroll updates are independent of the dehydrated route.
// Recreating Outlet children here would interrupt a still-loading lazy page.
const RouteContent = memo(function RouteContent() {
  const { pathname } = useLocation();
  const isCatalog = pathname === '/catalog' || pathname.startsWith('/catalog/');
  return (
    <Suspense
      fallback={
        <div
          className={`route-fallback route-fallback--page${isCatalog ? ' catalog-page' : ''}`}
          aria-busy="true"
          aria-live="polite"
        >
          <span className="route-fallback__spinner" aria-hidden="true" />
          <span className="route-fallback__text">Загружаем страницу...</span>
        </div>
      }
    >
      <CatalogNavigationScroll />
      <Outlet />
    </Suspense>
  );
});

function buildStorageWarningMessage(key) {
  if (key === 'yuzhural-cart') {
    return 'Список для КП изменён только на этом экране: браузер не дал сохранить корзину. Уменьшите список или очистите место в браузере.';
  }

  return 'Браузер не дал сохранить изменения локально. Они видны сейчас, но могут пропасть после перезагрузки страницы.';
}

function HeaderCartLink({ mobile = false }) {
  // Persisted cart updates must not rerender the parent of a hydrating route.
  const totalCount = useCartStore((state) => state.items.length);
  return (
    <Link
      to="/cart"
      className={`site-header__cart${mobile ? ' site-header__cart--mobile' : ''}`}
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
      <span className="site-header__cart-label">
        {mobile ? 'Список КП' : 'Корзина'}
      </span>
      {totalCount > 0 ? <span className="cart-badge">{totalCount}</span> : null}
    </Link>
  );
}

export default function MainLayout() {
  const location = useLocation();
  const cartItems = useCartStore((state) => state.items);
  const prerenderData = usePrerenderData();
  const [bootstrapLocation] = useState(() => location);
  // A server 404 describes this document entry, never a later navigation (or Back).
  const routePrerenderData =
    prerenderData.httpStatus === 404 && location !== bootstrapLocation
      ? EMPTY_PRERENDER_DATA
      : prerenderData;
  const isHomePage = location.pathname === '/';
  usePageviewTracking();

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [leadModalOptions, setLeadModalOptions] = useState({});
  const callbackDraftRef = useRef(null);
  const [quoteModalOptions, setQuoteModalOptions] = useState({});
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef(null);
  const [storageWarning, setStorageWarning] = useState(null);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleOpenLead(event) {
      if (event.detail?.mode !== 'callback') {
        handleOpenQuote(event);
        return;
      }
      setLeadModalOptions(event.detail || {});
      setIsLeadModalOpen(true);
      trackEvent(
        event.detail?.mode === 'callback' ? 'callback-open' : 'quote-open',
        {
          source: event.detail?.source || event.type || 'unknown',
          kind: 'lead',
        }
      );
    }

    function handleOpenQuote(event) {
      setQuoteModalOptions({
        ...event.detail,
        useCartItems:
          event.type === 'open-cart-quote-modal' && !event.detail?.items,
      });
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

  useEffect(() => {
    if (!location.state?.openQuote) return;
    setQuoteModalOptions({
      comment: location.state.request || '',
      source: 'Прямая ссылка на спецификацию',
    });
    setIsQuoteModalOpen(true);
  }, [location.key]);

  function handleLogoClick(event) {
    if (location.pathname === '/' && !location.search && !location.hash) {
      event.preventDefault();
      window.location.reload();
    }
  }

  function openLeadModal(options = {}) {
    if (options.mode !== 'callback') {
      setQuoteModalOptions(options);
      setIsQuoteModalOpen(true);
      trackEvent('quote-open', {
        source: options.source || 'quote',
        kind: 'quote',
      });
      return;
    }
    setLeadModalOptions(options);
    setIsLeadModalOpen(true);
    trackEvent('quote-open', {
      source: options.source || 'lead',
      kind: 'lead',
    });
  }

  return (
    <div>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
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
              <PriceDownload />
            </div>
          </div>
        </Container>
      </div>

      <header className="site-header">
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

                <CallbackButton
                  className="button-primary header-cta-btn"
                  source="Заказ звонка: шапка сайта"
                />

                <div
                  className="header-messengers"
                  aria-label="Связаться в мессенджерах"
                >
                  <a
                    href={SITE_TELEGRAM_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="header-messenger"
                    aria-label="Написать в Telegram"
                    title="Telegram"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M21.4 3.7 18.1 20c-.2 1-1 1.2-1.8.6l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.5 13.1.6 11.6c-1-.3-1-1 .2-1.5L20 2.7c.9-.3 1.7.2 1.4 1Z" />
                    </svg>
                  </a>
                  <a
                    href={SITE_WHATSAPP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="header-messenger"
                    aria-label="Написать в WhatsApp"
                    title="WhatsApp"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="23"
                      height="23"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.7Z" />
                      <path d="m8.4 7.3 1.5 2.6-1 1.1c.9 1.8 2.1 2.9 3.9 3.7l1-1.1 2.7 1.4c-.3 1.4-1.2 2.1-2.6 1.8-4.1-.9-7-3.8-7.5-7.1-.2-1.2.5-2.1 2-2.4Z" />
                    </svg>
                  </a>
                </div>

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
                  ref={mobileMenuButtonRef}
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

              <HeaderCartLink mobile />
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
                  to="/marks/"
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Алфавитный перечень
                </NavLink>

                <NavLink
                  to={DELIVERY_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Получение заказа
                </NavLink>
                <NavLink
                  to={PAYMENT_CANONICAL_PATH}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                >
                  Оплата
                </NavLink>
                <HeaderServicesMenu />
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
                <HeaderCartLink />
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

      <main id="main-content" tabIndex={-1}>
        <CableImagePreviewNotice />
        <PrerenderDataProvider data={routePrerenderData}>
          <RouteContent />
        </PrerenderDataProvider>
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
        fallbackFocusRef={mobileMenuButtonRef}
        onClose={() => setIsLeadModalOpen(false)}
        closeIcon={
          leadModalOptions.mode === 'callback' ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          ) : undefined
        }
        windowClassName={`modal-window--lead${leadModalOptions.mode === 'callback' ? ' modal-window--callback' : ''}`}
        ariaLabel={
          leadModalOptions.mode === 'callback'
            ? 'Заказать звонок'
            : 'Диалоговое окно'
        }
      >
        <HeroLeadForm
          key={leadModalOptions.mode || 'lead'}
          draftRef={
            leadModalOptions.mode === 'callback' ? callbackDraftRef : undefined
          }
          mode={leadModalOptions.mode}
          onDone={() => setIsLeadModalOpen(false)}
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
        windowClassName="modal-window--lead modal-window--callback"
        ariaLabel={quoteModalOptions.title || 'Отправить заявку'}
        closeIcon={
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        }
        onClose={() => {
          setIsQuoteModalOpen(false);
          setQuoteModalOptions({});
        }}
      >
        <HeroLeadForm
          key={`${quoteModalOptions.source || 'quote'}:${quoteModalOptions.comment || ''}:${quoteModalOptions.items?.map((item) => item.id).join(',') || ''}`}
          mode="callback"
          title={quoteModalOptions.title || 'Отправить заявку'}
          subtitle={
            quoteModalOptions.subtitle ||
            'Оставьте номер — менеджер свяжется с вами в рабочее время.'
          }
          submitLabel={quoteModalOptions.submitLabel || 'Отправить заявку'}
          defaultComment={quoteModalOptions.comment || ''}
          source={quoteModalOptions.source || 'Заявка'}
          onQuoteSent={
            quoteModalOptions.useCartItems
              ? () => useCartStore.getState().clearCart()
              : undefined
          }
          quoteItems={
            quoteModalOptions.items ||
            (quoteModalOptions.useCartItems ? cartItems : [])
          }
          onDone={() => setIsQuoteModalOpen(false)}
          idPrefix="modal-quote"
        />
      </Modal>
    </div>
  );
}
