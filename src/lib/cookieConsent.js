// Хранит выбор cookie-категорий и сообщает о его изменении интерфейсу сайта.

export const COOKIE_CONSENT_COOKIE = 'yuzhural-cookie-consent';
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_CHANGE_EVENT = 'yuzhural:cookie-consent-change';
export const OPEN_COOKIE_SETTINGS_EVENT = 'yuzhural:open-cookie-settings';

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function parseConsent(value) {
  if (!value) return null;

  try {
    const consent = JSON.parse(decodeURIComponent(value));
    if (
      consent?.version !== COOKIE_CONSENT_VERSION ||
      typeof consent.analytics !== 'boolean' ||
      typeof consent.externalServices !== 'boolean' ||
      typeof consent.updatedAt !== 'string' ||
      !Number.isFinite(consent.expiresAt) ||
      consent.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      version: COOKIE_CONSENT_VERSION,
      required: true,
      analytics: consent.analytics,
      externalServices: consent.externalServices,
      updatedAt: consent.updatedAt,
      expiresAt: consent.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getCookieConsent() {
  if (!isClient()) return null;
  try {
    const pair = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${COOKIE_CONSENT_COOKIE}=`));
    const cookieConsent = parseConsent(
      pair?.slice(COOKIE_CONSENT_COOKIE.length + 1)
    );
    if (cookieConsent) return cookieConsent;
  } catch {
    // Some browser modes deny cookie access; use the tab's storage fallback.
  }

  try {
    return parseConsent(window.localStorage.getItem(COOKIE_CONSENT_COOKIE));
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent() {
  return getCookieConsent()?.analytics === true;
}

export function hasExternalServicesConsent() {
  return getCookieConsent()?.externalServices === true;
}

export function saveCookieConsent({
  analytics = false,
  externalServices = false,
} = {}) {
  if (!isClient()) return null;

  const consent = {
    version: COOKIE_CONSENT_VERSION,
    required: true,
    analytics: Boolean(analytics),
    externalServices: Boolean(externalServices),
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + CONSENT_MAX_AGE_SECONDS * 1000,
  };
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  try {
    document.cookie = `${COOKIE_CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify(consent)
    )}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // The local storage fallback below still preserves the choice when possible.
  }
  try {
    window.localStorage.setItem(COOKIE_CONSENT_COOKIE, JSON.stringify(consent));
  } catch {
    // Consent remains active for this page even when both storage APIs are blocked.
  }
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: consent })
  );
  return consent;
}

export function openCookieSettings() {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
}
