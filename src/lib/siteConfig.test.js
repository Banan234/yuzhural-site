// Файл проверяет конфигурацию сайта, URL, контакты и обязательные поля company metadata.

import { describe, expect, it } from 'vitest';
import {
  SITE_EMAIL,
  SITE_OFFICE_ADDRESS,
  SITE_LEGAL_FULL_NAME,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_REGISTRATION_NUMBER,
  SITE_TAX_ID,
  buildOrganizationJsonLd,
} from './siteConfig.js';

describe('buildOrganizationJsonLd', () => {
  it('содержит реальные централизованные реквизиты компании', () => {
    const jsonLd = buildOrganizationJsonLd();

    expect(jsonLd.legalName).toBe(SITE_LEGAL_FULL_NAME);
    expect(jsonLd.telephone).toBe(SITE_PHONE);
    expect(jsonLd.email).toBe(SITE_EMAIL);
    expect(jsonLd.taxID).toBe(SITE_TAX_ID);
    expect(jsonLd.address.streetAddress).toBe(
      SITE_OFFICE_ADDRESS.streetAddress
    );
    expect(jsonLd.identifier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyID: 'ИНН',
          value: SITE_TAX_ID,
        }),
        expect.objectContaining({
          propertyID: 'ОГРН',
          value: SITE_REGISTRATION_NUMBER,
        }),
      ])
    );
  });
});

describe('SITE_PHONE_DISPLAY', () => {
  it('использует неразрывные дефисы внутри номера', () => {
    expect(SITE_PHONE_DISPLAY).toContain('\u2011');
    expect(SITE_PHONE_DISPLAY).not.toMatch(/(?<=\d)-(?=\d)/);
  });
});
