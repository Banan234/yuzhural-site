import { describe, expect, it } from 'vitest';
import { createConsentEvidence, validateConsent } from './consentEvidence.js';
import { PERSONAL_DATA_CONSENT_VERSION } from '../shared/personalDataConsent.js';
describe('consent evidence', () => {
  it('принимает только явное согласие с известной версией', () => {
    expect(
      validateConsent({
        consent: true,
        consentVersion: PERSONAL_DATA_CONSENT_VERSION,
      })
    ).toBeNull();
    for (const consent of [false, 'true', undefined])
      expect(
        validateConsent({
          consent,
          consentVersion: PERSONAL_DATA_CONSENT_VERSION,
        })
      ).toBeTruthy();
    expect(validateConsent({ consent: true })).toBeTruthy();
    expect(
      validateConsent({ consent: true, consentVersion: 'old' })
    ).toBeTruthy();
  });
  it('формирует отметку без копирования пользовательских данных', () => {
    const evidence = createConsentEvidence({
      consent: true,
      consentVersion: PERSONAL_DATA_CONSENT_VERSION,
      phone: 'private',
      createdAt: '1900-01-01',
    });
    expect(evidence).toEqual({
      accepted: true,
      version: PERSONAL_DATA_CONSENT_VERSION,
      receivedAt: expect.any(String),
    });
    expect(new Date(evidence.receivedAt).getFullYear()).toBeGreaterThan(2020);
    expect(() => createConsentEvidence({ consent: false })).toThrow();
  });
});
