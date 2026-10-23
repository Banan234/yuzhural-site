// @vitest-environment jsdom
// Файл проверяет страницу контактов, лид-форму, ссылки и SEO-разметку.

import '../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_OFFICE_MAP_URL,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_REQUISITES,
  SITE_URL,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_URL,
} from '../lib/siteConfig.js';
import { toCanonicalSitePath } from '../lib/canonicalPaths.js';
import ContactsPage from './ContactsPage.jsx';

function renderContactsPage() {
  render(
    <MemoryRouter
      initialEntries={['/contacts']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ContactsPage />
    </MemoryRouter>
  );
}

describe('ContactsPage', () => {
  it('берет NAP и реквизиты из siteConfig', () => {
    renderContactsPage();

    expect(screen.getByText(SITE_OFFICE_ADDRESS_DISPLAY)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /маршрут.*офис/i })
    ).toHaveAttribute('href', SITE_OFFICE_MAP_URL);
    expect(
      screen.getByRole('link', { name: SITE_WAREHOUSE_ADDRESS_DISPLAY })
    ).toHaveAttribute('href', SITE_WAREHOUSE_MAP_URL);
    for (const [name, href] of [
      [SITE_PHONE_DISPLAY, SITE_PHONE_HREF],
      [SITE_EMAIL, SITE_EMAIL_HREF],
    ]) {
      const links = screen.getAllByRole('link', { name });
      for (const link of links) expect(link).toHaveAttribute('href', href);
    }
    expect(screen.getByText(SITE_REQUISITES.fullLegalName)).toBeInTheDocument();
    expect(screen.getByText(SITE_REQUISITES.taxId)).toBeInTheDocument();
    expect(
      screen.getByText(SITE_REQUISITES.registrationNumber)
    ).toBeInTheDocument();
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${toCanonicalSitePath('/contacts')}`
    );
  });
});
