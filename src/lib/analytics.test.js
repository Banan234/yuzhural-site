// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { afterEach, expect, it, vi } from 'vitest';
import { saveCookieConsent } from './cookieConsent';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.ym;
  document.querySelectorAll('script').forEach((node) => node.remove());
  window.localStorage.clear();
  document.cookie = 'yuzhural-cookie-consent=; Max-Age=0; Path=/';
});

it('не подключает Метрику без выбора, останавливает при отказе и запускает после повторного согласия', async () => {
  vi.stubEnv('VITE_YANDEX_METRIKA_ID', '12345');
  vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 1;
  });
  window.requestIdleCallback = (callback) => {
    callback();
    return 1;
  };
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  document.head.appendChild(document.createElement('script'));
  const { initAnalytics, trackEvent } = await import('./analytics');
  await initAnalytics();
  expect(document.querySelector('script[src*="mc.yandex"]')).toBeNull();
  saveCookieConsent({ analytics: false });
  expect(document.querySelector('script[src*="mc.yandex"]')).toBeNull();
  window.ym = vi.fn();
  saveCookieConsent({ analytics: true });
  await initAnalytics();
  expect(window.ym).toHaveBeenCalledWith(12345, 'init', expect.any(Object));
  saveCookieConsent({ analytics: false });
  expect(window.ym).toHaveBeenCalledWith(12345, 'destruct');
  window.ym.mockClear();
  trackEvent('quote-submit');
  expect(window.ym).not.toHaveBeenCalled();
  saveCookieConsent({ analytics: true });
  await initAnalytics();
  expect(window.ym).toHaveBeenCalledWith(12345, 'init', expect.any(Object));
});
