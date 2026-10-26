import { PERSONAL_DATA_CONSENT_VERSION } from '../../../shared/personalDataConsent';
import { useRef, useState } from 'react';
import HoneypotField from '../forms/HoneypotField';
import {
  isValidEmail,
  isValidRussianPhone,
} from '../../../shared/quoteValidation.js';
import { expectOkApiJson } from '../../lib/apiResponse';
import { captureException } from '../../lib/errorTracking';
import { trackEvent } from '../../lib/analytics';

function formatPhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 11 && /^7[78]/.test(digits)) digits = digits.slice(1);
  if (digits.startsWith('7') || digits.startsWith('8'))
    digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

export default function ContactRequestForm() {
  const [channel, setChannel] = useState('phone');
  const [name, setName] = useState('');
  const [contacts, setContacts] = useState({ phone: '', email: '' });
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [success, setSuccess] = useState(false);
  const renderedAt = useRef(Date.now());
  const submitting = useRef(false);
  const nameRef = useRef(null);
  const contactRef = useRef(null);
  const consentRef = useRef(null);
  const statusRef = useRef(null);
  const isEmail = channel === 'email';

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const contact = isEmail
      ? contacts.email.trim()
      : contacts.phone.replace(/[^\d+]/g, '');
    const nextErrors = {};
    if (name.trim().length < 2) nextErrors.name = 'Укажите ваше имя';
    if (isEmail ? !isValidEmail(contact) : !isValidRussianPhone(contact)) {
      nextErrors.contact = isEmail
        ? 'Укажите корректный email'
        : 'Укажите корректный телефон';
    }
    if (!consent)
      nextErrors.consent = 'Подтвердите согласие на обработку данных';
    setErrors(nextErrors);
    setStatus('');
    if (Object.keys(nextErrors).length) {
      (nextErrors.name
        ? nameRef
        : nextErrors.contact
          ? contactRef
          : consentRef
      ).current?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/lead-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contactChannel: channel,
          [channel]: contact,
          consent,
          consentVersion: PERSONAL_DATA_CONSENT_VERSION,
          source: 'Главная: помощь с подбором кабеля',
          comment: isEmail
            ? 'Просьба связаться по email'
            : 'Просьба перезвонить',
          requestType: 'lead',
          page: window.location.pathname,
          rendered_at: renderedAt.current,
          submit_at: Date.now(),
          company_website: honeypot,
          createdAt: new Date().toLocaleString('ru-RU'),
        }),
      });
      await expectOkApiJson(
        response,
        'Не удалось отправить заявку. Попробуйте ещё раз.'
      );
      setSuccess(true);
      setStatus(
        isEmail
          ? `Заявка принята. Ответим на ${contact}.`
          : `Заявка принята. Позвоним на ${contact}.`
      );
      trackEvent('lead-submit', {
        source: 'Главная: помощь с подбором кабеля',
        channel,
      });
    } catch (error) {
      setStatus(
        error.message || 'Не удалось отправить заявку. Попробуйте ещё раз.'
      );
      captureException(error, { source: 'ContactRequestForm.submit' });
    } finally {
      submitting.current = false;
      setPending(false);
      requestAnimationFrame(() => statusRef.current?.focus());
    }
  }

  if (success)
    return (
      <p
        className="home-contact-form__success"
        role="status"
        tabIndex={-1}
        ref={statusRef}
      >
        {status}
      </p>
    );

  return (
    <form
      className="home-contact-form"
      onSubmit={submit}
      noValidate
      aria-label="Заявка на связь"
      aria-busy={pending}
    >
      <HoneypotField
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
      />
      <fieldset className="home-contact-form__channels" disabled={pending}>
        <legend>Как с вами связаться?</legend>
        {['phone', 'email'].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="home-contact-channel"
              value={value}
              checked={channel === value}
              onChange={() => {
                setChannel(value);
                setErrors({});
                setStatus('');
              }}
            />
            <span>{value === 'phone' ? 'Телефон' : 'Email'}</span>
          </label>
        ))}
      </fieldset>
      <div className="home-contact-form__row">
        <label className="visually-hidden" htmlFor="home-contact-name">
          Ваше имя
        </label>
        <input
          id="home-contact-name"
          ref={nameRef}
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          maxLength={100}
          required
          disabled={pending}
          placeholder="Ваше имя"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'home-contact-name-error' : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((prev) => ({ ...prev, name: '' }));
            setStatus('');
          }}
        />
        <label className="visually-hidden" htmlFor="home-contact-value">
          {isEmail ? 'Ваш email' : 'Ваш телефон'}
        </label>
        <input
          key={channel}
          id="home-contact-value"
          ref={contactRef}
          type={isEmail ? 'email' : 'tel'}
          inputMode={isEmail ? 'email' : 'tel'}
          autoComplete={isEmail ? 'email' : 'tel'}
          name={channel}
          value={contacts[channel]}
          maxLength={isEmail ? 254 : 32}
          required
          disabled={pending}
          placeholder={isEmail ? 'mail@company.ru' : '+7 (999) 123-45-67'}
          onFocus={() => {
            if (!isEmail && !contacts.phone) {
              setContacts((prev) => ({ ...prev, phone: '+7 (' }));
            }
          }}
          onBlur={() => {
            if (!isEmail && contacts.phone.replace(/\D/g, '') === '7') {
              setContacts((prev) => ({ ...prev, phone: '' }));
            }
          }}
          onKeyDown={(event) => {
            if (
              !isEmail &&
              event.key === 'Backspace' &&
              event.currentTarget.selectionStart ===
                event.currentTarget.selectionEnd &&
              event.currentTarget.selectionStart ===
                event.currentTarget.value.length &&
              /\D$/.test(event.currentTarget.value)
            ) {
              event.preventDefault();
              const digits = contacts.phone.replace(/\D/g, '').slice(0, -1);
              setContacts((prev) => ({ ...prev, phone: formatPhone(digits) }));
            }
          }}
          aria-invalid={errors.contact ? true : undefined}
          aria-describedby={errors.contact ? 'home-contact-error' : undefined}
          onChange={(event) => {
            const repeatsPrefix =
              !isEmail &&
              contacts.phone === '+7 (' &&
              /^77$/.test(event.target.value.replace(/\D/g, ''));
            const value = isEmail
              ? event.target.value
              : repeatsPrefix
                ? '+7 ('
                : formatPhone(event.target.value);
            setContacts((prev) => ({ ...prev, [channel]: value }));
            setErrors((prev) => ({ ...prev, contact: '' }));
            setStatus('');
          }}
        />
        <button className="button-primary" disabled={pending} type="submit">
          {pending
            ? 'Отправляем…'
            : isEmail
              ? 'Напишите мне'
              : 'Заказать звонок'}
        </button>
      </div>
      {errors.name && (
        <span className="field-error" id="home-contact-name-error">
          {errors.name}
        </span>
      )}
      {errors.contact && (
        <span className="field-error" id="home-contact-error">
          {errors.contact}
        </span>
      )}
      <div className="home-contact-form__footer">
        <label className="home-contact-form__consent">
          <input
            ref={consentRef}
            type="checkbox"
            checked={consent}
            required
            disabled={pending}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={
              errors.consent ? 'home-contact-consent-error' : undefined
            }
            onChange={(event) => {
              setConsent(event.target.checked);
              setErrors((prev) => ({ ...prev, consent: '' }));
            }}
          />
          <span>
            Даю согласие на{' '}
            <a href="/personal-data-consent">обработку персональных данных</a> ·{' '}
            <a href="/privacy/" target="_blank" rel="noopener noreferrer">
              Политика конфиденциальности
            </a>
          </span>
        </label>
      </div>
      {errors.consent && (
        <span className="field-error" id="home-contact-consent-error">
          {errors.consent}
        </span>
      )}
      {status && (
        <p className="field-error" role="alert" tabIndex={-1} ref={statusRef}>
          {status}
        </p>
      )}
    </form>
  );
}
