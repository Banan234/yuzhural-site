// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы доставки: самовывоз, ТК и ссылку на склад.

import '../test/renderTestSetup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_URL,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_EMBED_URL,
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

  it('по умолчанию показывает самовывоз, адрес и карту с учётом согласия', () => {
    renderDeliveryPage();

    expect(
      screen.getByRole('heading', { name: 'Самовывоз со склада' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Самовывоз транспортной компанией' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: SITE_WAREHOUSE_ADDRESS_DISPLAY })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    expect(
      screen.queryByTitle('Схема проезда к складу самовывоза')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Настроить cookie' })
    ).toBeInTheDocument();
    act(() => saveCookieConsent({ externalServices: true }));
    expect(
      screen.getByTitle('Схема проезда к складу самовывоза')
    ).toHaveAttribute('src', SITE_WAREHOUSE_MAP_EMBED_URL);
    act(() => saveCookieConsent({ externalServices: false }));
    expect(
      screen.queryByTitle('Схема проезда к складу самовывоза')
    ).not.toBeInTheDocument();
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
