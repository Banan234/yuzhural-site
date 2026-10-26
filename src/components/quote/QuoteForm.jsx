import { PERSONAL_DATA_CONSENT_VERSION } from '../../../shared/personalDataConsent';
// Файл управляет формой запроса КП: позиции, контакты, PDF, отправка и пользовательские ошибки.

import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '../../store/useCartStore';
import { trackEvent } from '../../lib/analytics';
import { expectOkApiJson } from '../../lib/apiResponse';
import { captureException } from '../../lib/errorTracking';
import HoneypotField from '../forms/HoneypotField';
import { removeStoredValue } from '../../lib/browserStorage';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';
import { messages } from '../../../shared/messages.js';
import { MAX_QUOTE_CUSTOMER_COMMENT_LENGTH } from '../../../shared/quoteValidation.js';
import { validateForm } from './quoteFormValidation';

import SpecificationFiles from './SpecificationFiles';
import { validateSpecificationFiles } from '../../../shared/specificationFiles';
import '../../styles/pages/purchase.css';

const LEGACY_FORM_STORAGE_KEY = 'yuzhural-quote-form';

const CHANNEL_OPTIONS = [
  { value: 'phone', label: 'Звонок' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
];

const initialForm = {
  name: '',
  phone: '',
  email: '',
  comment: '',
  preferredChannel: 'phone',
  consent: false,
};

export default function QuoteForm({
  title = 'Запрос коммерческого предложения',
  description = 'Заполните форму, и мы подготовим предложение по текущему составу корзины.',
  itemsOverride = null,
  idPrefix = 'quote',
  specificationOnly = false,
  defaultComment = '',
  compact = false,
}) {
  const { items: cartItems, clearCart } = useCartStore();
  const items = itemsOverride || cartItems;
  const shouldClearCartOnSuccess = !itemsOverride;

  const [form, setForm] = useState(() => ({
    ...initialForm,
    comment: defaultComment,
  }));
  const [files, setFiles] = useState([]);
  const [showOptional, setShowOptional] = useState(false);
  const [fileError, setFileError] = useState('');
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const renderedAtRef = useRef(Date.now());
  const fieldIds = {
    name: `${idPrefix}-name`,
    phone: `${idPrefix}-phone`,
    email: `${idPrefix}-email`,
    comment: `${idPrefix}-comment`,
    consent: `${idPrefix}-consent`,
  };
  const errorIds = {
    name: `${fieldIds.name}-error`,
    phone: `${fieldIds.phone}-error`,
    email: `${fieldIds.email}-error`,
    comment: `${fieldIds.comment}-error`,
    consent: `${fieldIds.consent}-error`,
  };

  const totalCount = items.length;
  const totalPrice = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  useEffect(() => {
    removeStoredValue(LEGACY_FORM_STORAGE_KEY);
  }, []);

  function handleChange(event) {
    const { checked, name, type, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: '',
      cart: '',
    }));

    setIsSubmitted(false);
    setServerMessage('');
  }

  function handleChannelChange(value) {
    setForm((prev) => ({ ...prev, preferredChannel: value }));
    setErrors((prev) => ({ ...prev, email: '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateForm(form, items, {
      hasSpecification: files.length > 0,
    });

    if (specificationOnly && files.length === 0)
      nextErrors.cart = 'Прикрепите спецификацию для расчёта.';
    const attachmentError = validateSpecificationFiles(files);
    setFileError(attachmentError);
    if (attachmentError || Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitted(false);
      return;
    }

    setIsSubmitting(true);
    setServerMessage('');

    const cleanedForm = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      comment: form.comment.trim(),
      preferredChannel: form.preferredChannel,
      consent: form.consent,
      consentVersion: PERSONAL_DATA_CONSENT_VERSION,
    };

    const orderPayload = {
      customer: cleanedForm,
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        title: item.title,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        unit: item.unit,
        comment: item.comment,
      })),
      totalCount,
      totalPrice,
      createdAt: new Date().toLocaleString('ru-RU'),
      rendered_at: renderedAtRef.current,
      submit_at: Date.now(),
      company_website: honeypot,
    };

    try {
      const multipart = new FormData();
      multipart.append('payload', JSON.stringify(orderPayload));
      files.forEach((file) =>
        multipart.append('specifications', file, file.name)
      );
      const response = await fetch('/api/quote', {
        method: 'POST',
        ...(files.length
          ? { body: multipart }
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderPayload),
            }),
      });

      const result = await expectOkApiJson(
        response,
        messages.errors.quoteForm.submitRequestFailed
      );

      trackEvent('quote-submit', {
        items: totalCount,
        total: Math.round(totalPrice),
        channel: cleanedForm.preferredChannel,
        hasEmail: Boolean(cleanedForm.email),
      });
      setSubmittedSummary({
        files: files.map((file) => file.name),
        positions: totalCount,
        contact: cleanedForm.phone,
        comment: cleanedForm.comment,
      });
      setFiles([]);
      setIsSubmitted(true);
      setServerMessage(result.message || messages.success.quoteSent);
      setErrors({});
      setForm(initialForm);
      renderedAtRef.current = Date.now();
      if (shouldClearCartOnSuccess) {
        clearCart();
      }
    } catch (error) {
      captureException(error, { source: 'QuoteForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || messages.errors.quoteForm.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="quote-form-wrap">
      {(title || description) && (
        <div className="quote-form-head">
          {title && (
            <h2 className="section-title section-title--left">{title}</h2>
          )}
          {description && <p className="page-subtitle">{description}</p>}
        </div>
      )}

      {!specificationOnly &&
      items.length === 0 &&
      files.length === 0 &&
      !isSubmitted ? (
        <div className="quote-empty-note">
          Прикрепите спецификацию или добавьте позиции из{' '}
          <a
            href={CATALOG_CANONICAL_PATH}
            style={{
              color: 'inherit',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            каталога
          </a>
        </div>
      ) : null}

      {errors.cart ? <div className="form-error">{errors.cart}</div> : null}

      {isSubmitted ? (
        <div className="form-success" role="status">
          {serverMessage}
          {submittedSummary && (
            <div className="specification-receipt">
              <strong>Отправлено:</strong>
              <p>
                Позиций из каталога: {submittedSummary.positions}. Телефон для
                связи: {submittedSummary.contact}.
              </p>
              {submittedSummary.files.length > 0 && (
                <ul>
                  {submittedSummary.files.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
              {submittedSummary.comment && <p>{submittedSummary.comment}</p>}
            </div>
          )}
        </div>
      ) : null}

      {!isSubmitted && serverMessage ? (
        <div className="form-error">{serverMessage}</div>
      ) : null}

      <form className="quote-form" onSubmit={handleSubmit} noValidate>
        <HoneypotField
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
        <SpecificationFiles
          files={files}
          onChange={setFiles}
          error={fileError}
          onError={setFileError}
          id={`${idPrefix}-files`}
          disabled={isSubmitting}
        />
        <div className="quote-form__grid">
          <div className="quote-field">
            <label htmlFor={fieldIds.name}>Имя *</label>
            <input
              id={fieldIds.name}
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="Иван Иванов"
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? errorIds.name : undefined}
            />
            {errors.name ? (
              <span id={errorIds.name} className="field-error">
                {errors.name}
              </span>
            ) : null}
          </div>

          <div className="quote-field">
            <label htmlFor={fieldIds.phone}>Телефон *</label>
            <input
              id={fieldIds.phone}
              name="phone"
              type="text"
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 (900) 000-00-00"
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={errors.phone ? errorIds.phone : undefined}
            />
            {errors.phone ? (
              <span id={errorIds.phone} className="field-error">
                {errors.phone}
              </span>
            ) : null}
          </div>

          {compact && (
            <button
              className="quote-form__optional-toggle"
              type="button"
              aria-expanded={showOptional}
              onClick={() => setShowOptional((value) => !value)}
            >
              {showOptional
                ? 'Скрыть дополнительные поля'
                : 'Добавить email и комментарий'}
            </button>
          )}
          {(!compact || showOptional) && (
            <div className="quote-field">
              <label htmlFor={fieldIds.email}>
                Email{' '}
                <span className="quote-field__optional">(опционально)</span>
              </label>
              <input
                id={fieldIds.email}
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="mail@company.ru"
                aria-invalid={errors.email ? 'true' : undefined}
                aria-describedby={errors.email ? errorIds.email : undefined}
              />
              {errors.email ? (
                <span id={errorIds.email} className="field-error">
                  {errors.email}
                </span>
              ) : null}
            </div>
          )}

          {!compact && (
            <div className="quote-field quote-field--full">
              <label>Как удобнее связаться?</label>
              <div className="quote-channels">
                {CHANNEL_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`quote-channel${
                      form.preferredChannel === option.value
                        ? ' quote-channel--active'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferredChannel"
                      value={option.value}
                      checked={form.preferredChannel === option.value}
                      onChange={() => handleChannelChange(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <span className="quote-field__hint">
                Если выбран мессенджер — отправим КП в чат на указанный телефон.
              </span>
            </div>
          )}

          {(!compact || showOptional) && (
            <div className="quote-field quote-field--full">
              <label htmlFor={fieldIds.comment}>Комментарий</label>
              <textarea
                id={fieldIds.comment}
                name="comment"
                value={form.comment}
                onChange={handleChange}
                placeholder="Уточнения по объему, срокам, самовывозу, реквизитам"
                rows={compact ? 2 : 5}
                maxLength={MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
                aria-invalid={errors.comment ? 'true' : undefined}
                aria-describedby={errors.comment ? errorIds.comment : undefined}
              />

              <div className="field-meta">
                {errors.comment ? (
                  <span id={errorIds.comment} className="field-error">
                    {errors.comment}
                  </span>
                ) : (
                  <span />
                )}

                <span className="char-counter">
                  {form.comment.length} / {MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
                </span>
              </div>
            </div>
          )}

          <div className="quote-field quote-field--full">
            <label className="quote-form__consent">
              <input
                id={fieldIds.consent}
                name="consent"
                type="checkbox"
                checked={form.consent}
                onChange={handleChange}
                aria-invalid={errors.consent ? 'true' : undefined}
                aria-describedby={errors.consent ? errorIds.consent : undefined}
              />
              <span>
                Даю согласие на{' '}
                <a href="/personal-data-consent">
                  обработку персональных&nbsp;данных
                </a>{' '}
                ·{' '}
                <a href="/privacy/" target="_blank" rel="noopener noreferrer">
                  Политика конфиденциальности
                </a>
              </span>
            </label>
            {errors.consent ? (
              <span id={errorIds.consent} className="field-error">
                {errors.consent}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="submit"
          className="button-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Отправка...' : 'Отправить запрос КП'}
        </button>
      </form>
    </div>
  );
}
