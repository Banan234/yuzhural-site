// Внешняя карта загружается только после согласия на внешние сервисы.

import { useEffect, useState } from 'react';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE,
  hasExternalServicesConsent,
  openCookieSettings,
} from '../../lib/cookieConsent';

export default function ConsentGatedMap({ title, src, children }) {
  const [allowed, setAllowed] = useState(false);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setInteractive(false);
  }, [src, allowed]);

  useEffect(() => {
    function sync() {
      setAllowed(hasExternalServicesConsent());
    }
    sync();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, sync);
    function syncStorage(event) {
      if (event.key === COOKIE_CONSENT_COOKIE) sync();
    }
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, sync);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  if (allowed) {
    if (children) return children;
    return (
      <div
        className="map-interaction-guard"
        data-interactive={interactive}
        onPointerLeave={() => setInteractive(false)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setInteractive(false);
          }
        }}
      >
        <iframe
          title={title}
          src={src}
          loading="lazy"
          tabIndex={interactive ? 0 : -1}
          referrerPolicy="no-referrer-when-downgrade"
        />
        {!interactive && (
          <button
            className="map-interaction-guard__shield"
            type="button"
            aria-label="Взаимодействовать с картой"
            onClick={() => setInteractive(true)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="consent-gated-map" role="status">
      <p>Карта загружается через Яндекс и может использовать cookie.</p>
      <button type="button" onClick={openCookieSettings}>
        Настроить cookie
      </button>
    </div>
  );
}
