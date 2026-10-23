// @vitest-environment jsdom
// Файл проверяет ключевой контент страницы о компании, документы и CTA.

import '../test/renderTestSetup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_URL,
  SITE_PUBLIC_DOCUMENTS,
  SITE_REQUISITES,
  SITE_PHONE_HREF,
} from '../lib/siteConfig.js';
import { STATIC_PAGE_SEO } from '../lib/staticSeo.js';
import AboutPage from './AboutPage.jsx';

function renderAboutPage() {
  render(
    <MemoryRouter
      initialEntries={['/about']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AboutPage />
    </MemoryRouter>
  );
}

describe('AboutPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('показывает направления работы, реквизиты и открытые документы', () => {
    renderAboutPage();

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /направлени/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /документ.*проверк/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(SITE_REQUISITES.fullLegalName)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Позвонить менеджеру' })
    ).toHaveAttribute('href', SITE_PHONE_HREF);

    SITE_PUBLIC_DOCUMENTS.forEach((doc) => {
      expect(
        screen.getByRole('link', { name: new RegExp(doc.title) })
      ).toHaveAttribute('href', doc.href);
    });
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${STATIC_PAGE_SEO.about.path}`
    );
  });

  it('открывает лид-форму по кнопке отправки заявки', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderAboutPage();
    fireEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-lead-modal');
    expect(dispatchSpy.mock.calls[0][0].detail).toEqual(
      expect.objectContaining({
        title: expect.stringMatching(/\S/),
        submitLabel: expect.stringMatching(/\S/),
        source: 'CTA на странице о компании',
      })
    );
  });
});
