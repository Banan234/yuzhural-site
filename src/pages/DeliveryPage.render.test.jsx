// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы доставки: самовывоз, ТК и ссылку на склад.

import '../test/renderTestSetup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_URL,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_URL,
} from '../lib/siteConfig.js';
import { STATIC_PAGE_SEO } from '../lib/staticSeo.js';
import DeliveryPage from './DeliveryPage.jsx';
import {
  COOKIE_CONSENT_COOKIE,
  saveCookieConsent,
} from '../lib/cookieConsent.js';

function renderDeliveryPage() {
  render(
    <MemoryRouter
      initialEntries={['/delivery']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DeliveryPage />
    </MemoryRouter>
  );
}

describe('DeliveryPage', () => {
  afterEach(() => {
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    vi.restoreAllMocks();
  });

  it('по умолчанию показывает самовывоз, адрес и карту с учётом согласия', async () => {
    // The current map uses the SDK canvas, not an iframe. The external SDK is
    // supplied locally and its script is never appended to the document.
    const map = {
      geoObjects: { add: vi.fn() },
      behaviors: { disable: vi.fn() },
      container: { fitToViewport: vi.fn() },
      destroy: vi.fn(),
    };
    const MapConstructor = vi.fn(function () {
      return map;
    });
    const Geometry = vi.fn(function () {
      return {};
    });
    vi.stubGlobal('ymaps', {
      ready: (callback) => callback(),
      Map: MapConstructor,
      Placemark: Geometry,
      Polyline: Geometry,
      Polygon: Geometry,
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    let sdkScript;
    const append = document.head.append.bind(document.head);
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const script = nodes.find(
        (node) =>
          node.tagName === 'SCRIPT' &&
          node.src.startsWith('https://api-maps.yandex.ru/')
      );
      if (script) {
        sdkScript = script;
        return;
      }
      return append(...nodes);
    });
    renderDeliveryPage();

    expect(
      screen.getByRole('heading', { name: 'Самовывоз со склада' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Забор транспортной компанией' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: SITE_WAREHOUSE_ADDRESS_DISPLAY })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    expect(
      screen.queryByLabelText('Карта проезда к складу')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Настроить cookie' })
    ).toBeInTheDocument();
    expect(sdkScript).toBeUndefined();
    expect(MapConstructor).not.toHaveBeenCalled();
    act(() => saveCookieConsent({ externalServices: true }));
    expect(screen.getByLabelText('Карта проезда к складу')).toBeVisible();
    expect(sdkScript).toBeDefined();
    await act(async () => {
      sdkScript.onload();
    });
    expect(MapConstructor).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: 'Открыть в Яндекс Картах' })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    act(() => saveCookieConsent({ externalServices: false }));
    expect(
      screen.queryByLabelText('Карта проезда к складу')
    ).not.toBeInTheDocument();
    expect(map.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${STATIC_PAGE_SEO.delivery.path}`
    );
  });

  it('открывает форму вопроса менеджеру по кнопке', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderDeliveryPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'Связаться с менеджером' })
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-lead-modal');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual(
      expect.objectContaining({
        title: expect.stringMatching(/\S/),
        submitLabel: expect.stringMatching(/\S/),
        source: 'CTA на странице доставки',
      })
    );
  });
});
