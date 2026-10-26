import { useDialogFocus } from '../../hooks/useDialogFocus';
// Файл показывает баннер, сохраняет выбор категорий и позволяет изменить его позже.

import { useEffect, useState } from 'react';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE,
  getCookieConsent,
  OPEN_COOKIE_SETTINGS_EVENT,
  saveCookieConsent,
} from '../../lib/cookieConsent';
import '../../styles/layout/cookie-consent.css';

export default function CookieConsent() {
  const [consent, setConsent] = useState(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dialogRef = useDialogFocus(isSettingsOpen);
  const [analytics, setAnalytics] = useState(false);
  const [externalServices, setExternalServices] = useState(false);

  useEffect(() => {
    const current = getCookieConsent();
    setConsent(current);
    setAnalytics(current?.analytics ?? false);
    setExternalServices(current?.externalServices ?? false);

    function syncConsent(event) {
      const next = event.detail || getCookieConsent();
      setConsent(next);
      setAnalytics(next?.analytics ?? false);
      setExternalServices(next?.externalServices ?? false);
      setIsSettingsOpen(false);
    }

    function showSettings() {
      const currentConsent = getCookieConsent();
      setAnalytics(currentConsent?.analytics ?? false);
      setExternalServices(currentConsent?.externalServices ?? false);
      setIsSettingsOpen(true);
    }

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, syncConsent);
    function syncStorage(event) {
      if (event.key === COOKIE_CONSENT_COOKIE) syncConsent({ detail: null });
    }
    window.addEventListener('storage', syncStorage);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, showSettings);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, syncConsent);
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, showSettings);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setIsSettingsOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSettingsOpen]);

  function save(choices) {
    const next = saveCookieConsent(choices);
    if (next) setConsent(next);
    setIsSettingsOpen(false);
  }

  if (consent === undefined) return null;

  return (
    <>
      {!consent && (
        <aside className="cookie-consent" aria-label="Настройки cookie">
          <p className="cookie-consent__message">
            Используем cookie для работы сайта и удобства.{' '}
            <a className="cookie-consent__text-button" href="/privacy#cookies">
              Подробнее
            </a>
          </p>
          <div className="cookie-consent__actions">
            <button
              type="button"
              className="cookie-consent__button cookie-consent__button--primary"
              onClick={() => save({ analytics: true, externalServices: true })}
            >
              Принять все
            </button>
            <button
              type="button"
              className="cookie-consent__button cookie-consent__button--secondary"
              onClick={() =>
                save({ analytics: false, externalServices: false })
              }
            >
              Принять необходимые
            </button>
          </div>
        </aside>
      )}

      {isSettingsOpen && (
        <div
          className="cookie-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSettingsOpen(false);
          }}
        >
          <section
            className="cookie-settings"
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
          >
            <button
              type="button"
              className="cookie-settings__close"
              aria-label="Закрыть настройки cookie"
              onClick={() => setIsSettingsOpen(false)}
            >
              ×
            </button>
            <h2 id="cookie-settings-title">Настройки cookie</h2>
            <p>
              Обязательные данные нужны для работы сайта и сохраняют, например,
              содержимое корзины. Аналитика и внешние карты включаются только по
              вашему выбору. Решение можно изменить в любое время в футере.{' '}
              <a
                href="/privacy#cookies"
                onClick={() => setIsSettingsOpen(false)}
              >
                Политика конфиденциальности
              </a>
            </p>
            <div className="cookie-settings__options">
              <label className="cookie-settings__option">
                <input type="checkbox" checked disabled />
                <span>
                  <strong>Обязательные</strong>
                  <small>Корзина и сохранение выбранных настроек</small>
                </span>
                <span className="cookie-settings__always-on">
                  Всегда включены
                </span>
              </label>
              <label className="cookie-settings__option">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                />
                <span>
                  <strong>Аналитика</strong>
                  <small>Яндекс.Метрика: посещения и действия на сайте</small>
                </span>
              </label>
              <label className="cookie-settings__option">
                <input
                  type="checkbox"
                  checked={externalServices}
                  onChange={(event) =>
                    setExternalServices(event.target.checked)
                  }
                />
                <span>
                  <strong>Внешние сервисы</strong>
                  <small>
                    Встроенные карты Яндекса на страницах контактов и получения
                    заказа
                  </small>
                </span>
              </label>
            </div>
            <div className="cookie-settings__actions">
              <button
                type="button"
                className="cookie-consent__button cookie-consent__button--primary"
                onClick={() => save({ analytics, externalServices })}
              >
                Сохранить выбор
              </button>
              <button
                type="button"
                className="cookie-consent__button cookie-consent__button--secondary"
                onClick={() =>
                  save({ analytics: false, externalServices: false })
                }
              >
                Только необходимые
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
