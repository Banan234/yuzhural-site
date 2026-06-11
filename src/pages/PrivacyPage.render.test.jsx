// @vitest-environment jsdom
// Файл проверяет ключевые разделы и контакты страницы политики конфиденциальности.

import '../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  SITE_URL,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
} from '../lib/siteConfig.js';
import { STATIC_PAGE_SEO } from '../lib/staticSeo.js';
import PrivacyPage from './PrivacyPage.jsx';

function renderPrivacyPage() {
  render(
    <MemoryRouter
      initialEntries={['/privacy']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <PrivacyPage />
    </MemoryRouter>
  );
}

describe('PrivacyPage', () => {
  it('оставляет canonical без завершающего слэша', () => {
    renderPrivacyPage();

    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${STATIC_PAGE_SEO.privacy.path}`
    );
  });

  it('показывает разделы политики, данные оператора и каналы связи', () => {
    renderPrivacyPage();

    expect(
      screen.getByRole('heading', { name: 'Политика конфиденциальности' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '2. Какие данные обрабатываются',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: '6. Аналитика, cookie и данные браузера',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(SITE_REQUISITES.fullLegalName).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: SITE_EMAIL })[0]
    ).toHaveAttribute('href', SITE_EMAIL_HREF);
    expect(
      screen.getAllByRole('link', { name: SITE_PHONE_DISPLAY })[0]
    ).toHaveAttribute('href', SITE_PHONE_HREF);
  });
});
