// Внешняя карта загружается только после согласия на внешние сервисы.

import { useEffect, useState } from 'react';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE,
  hasExternalServicesConsent,
  openCookieSettings,
} from '../../lib/cookieConsent';

export default function ConsentGatedMap({ title, src }) {
  const [allowed, setAllowed] = useState(false);

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
    return (
      <iframe
        title={title}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
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
