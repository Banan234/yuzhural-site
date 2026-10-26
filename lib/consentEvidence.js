import { PERSONAL_DATA_CONSENT_VERSION } from '../shared/personalDataConsent.js';

export function validateConsent(input) {
  if (input?.consent !== true)
    return 'Подтвердите согласие на обработку персональных данных.';
  if (input.consentVersion !== PERSONAL_DATA_CONSENT_VERSION)
    return 'Текст согласия обновился. Обновите страницу, ознакомьтесь с согласием и отправьте форму повторно.';
  return null;
}

export function createConsentEvidence(input) {
  const error = validateConsent(input);
  if (error) throw new Error(error);
  return {
    accepted: true,
    receivedAt: new Date().toISOString(),
    version: input.consentVersion,
  };
}
