// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы оплаты, единый сценарий сделки, документы и CTA.

import '../test/renderTestSetup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_EMAIL_HREF,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
  SITE_URL,
} from '../lib/siteConfig.js';
import { STATIC_PAGE_SEO } from '../lib/staticSeo.js';
import PaymentPage from './PaymentPage.jsx';

function renderPaymentPage() {
  render(
    <MemoryRouter
      initialEntries={['/payment']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <PaymentPage />
    </MemoryRouter>
  );
}

describe('PaymentPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('показывает единый сценарий сделки, отдельные блоки для клиентов и реквизиты', () => {
    renderPaymentPage();

    expect(
      screen.getByRole('heading', { level: 1, name: /оплат/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /условия оплаты/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Для компаний и ИП' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /физическ.*лиц/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Для розничных покупок действуют условия/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Резерв кабеля — до 3 дней' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Скачать реквизиты' })
    ).toHaveAttribute('href', '/documents/company-details.pdf');
    expect(
      screen.getByRole('link', {
        name: /связаться с менеджером/i,
      })
    ).toHaveAttribute('href', SITE_PHONE_HREF);
    expect(
      document.querySelector(`a[href="${SITE_PHONE_HREF}"]`)
    ).not.toBeNull();
    expect(
      document.querySelector(`a[href="${SITE_EMAIL_HREF}"]`)
    ).not.toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${STATIC_PAGE_SEO.payment.path}`
    );
  });

  it('открывает лид-форму по кнопке запроса счёта', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderPaymentPage();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Запросить счёт' })[0]
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-lead-modal');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual(
      expect.objectContaining({
        title: expect.stringMatching(/\S/),
        submitLabel: expect.stringMatching(/\S/),
        source: 'CTA на странице оплаты',
      })
    );
  });
});
