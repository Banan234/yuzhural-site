import { PERSONAL_DATA_CONSENT_VERSION } from '../../../shared/personalDataConsent';
// Файл реализует лид-форму на главном экране, включая отправку, аналитику и антибот-поля.

import { useEffect, useRef, useState } from 'react';
import HoneypotField from '../forms/HoneypotField';
import { expectOkApiJson } from '../../lib/apiResponse';
import { captureException } from '../../lib/errorTracking';
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  isValidRussianPhone,
} from '../../../shared/quoteValidation.js';
import { formatMessage, messages } from '../../../shared/messages.js';
import { trackEvent } from '../../lib/analytics';
import {
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_WORKING_HOURS_DISPLAY,
} from '../../lib/siteConfig';

const quickCommentOptions = [
  { label: 'ВВГ', value: 'ВВГ' },
  { label: 'АВВГ', value: 'АВВГ' },
  { label: 'КГ', value: 'КГ' },
  { label: 'Нужен подбор', value: 'Нужен подбор кабеля' },
];

const initialForm = {
  phone: '',
  comment: '',
  consent: false,
};

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, '');
}

function buildInitialForm(defaultComment) {
  return {
    ...initialForm,
    comment: defaultComment,
  };
}

export default function HeroLeadForm({
  title = 'Не тратьте время на поиск кабеля',
  subtitle = 'Ответим в течение 15 минут',
  submitLabel = 'Получить КП',
  defaultComment = '',
  source = 'Главная страница',
  idPrefix = 'lead',
  mode = 'lead',
  onDone,
}) {
  const isCallback = mode === 'callback';
  const [form, setForm] = useState(() => buildInitialForm(defaultComment));
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const commentRef = useRef(null);
  const phoneRef = useRef(null);
  const consentRef = useRef(null);
  const statusRef = useRef(null);
  const submittingRef = useRef(false);
  const [submittedPhone, setSubmittedPhone] = useState('');
  const renderedAtRef = useRef(Date.now());
  const previousDefaultCommentRef = useRef(defaultComment);
  const fieldIds = {
    phone: `${idPrefix}-phone`,
    comment: `${idPrefix}-comment`,
    consent: `${idPrefix}-consent`,
  };
  const errorIds = {
    phone: `${fieldIds.phone}-error`,
    consent: `${fieldIds.consent}-error`,
  };

  useEffect(() => {
    if (isSubmitted || serverMessage) statusRef.current?.focus();
  }, [isSubmitted, serverMessage]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }));

    setServerMessage('');
    setIsSubmitted(false);
  }

  function validate() {
    const nextErrors = {};
    const normalizedPhone = normalizePhone(form.phone.trim());

    if (!isValidRussianPhone(normalizedPhone)) {
      nextErrors.phone = messages.errors.leadForm.phoneInvalid;
    }

    if (!form.consent) {
      nextErrors.consent = messages.errors.leadForm.consentRequired;
    }

    return nextErrors;
  }

  function parseCommentTokens(comment) {
    return comment
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function handleQuickComment(value) {
    setForm((prev) => {
      const items = parseCommentTokens(prev.comment);
      const hasValue = items.includes(value);
      const nextComment = hasValue
        ? items.filter((item) => item !== value).join(', ')
        : [...items, value].join(', ');

      return {
        ...prev,
        comment: nextComment,
      };
    });

    setErrors((prev) => ({
      ...prev,
      comment: '',
    }));
    setServerMessage('');
    setIsSubmitted(false);

    requestAnimationFrame(() => {
      commentRef.current?.focus();
    });
  }

  useEffect(() => {
    const previousDefaultComment = previousDefaultCommentRef.current;
    previousDefaultCommentRef.current = defaultComment;

    if (previousDefaultComment === defaultComment) {
      return;
    }

    setForm((prev) => {
      const hasUntouchedComment =
        prev.comment.trim() === '' || prev.comment === previousDefaultComment;

      if (!hasUntouchedComment) {
        return prev;
      }

      return {
        ...prev,
        comment: defaultComment,
      };
    });
    setErrors({});
    setServerMessage('');
    setIsSubmitted(false);
  }, [defaultComment]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitted(false);
      (nextErrors.phone ? phoneRef : consentRef).current?.focus();
      return;
    }

    try {
      submittingRef.current = true;
      setIsSubmitting(true);
      setServerMessage('');

      const response = await fetch('/api/lead-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: form.phone.trim(),
          comment:
            form.comment.trim() ||
            (isCallback
              ? 'Просьба перезвонить'
              : formatMessage(messages.text.leadDefaultCommentPrefix, {
                  source,
                })),
          source,
          consent: form.consent,
          consentVersion: PERSONAL_DATA_CONSENT_VERSION,
          requestType: isCallback ? 'callback' : 'lead',
          page: window.location.pathname,
          createdAt: new Date().toLocaleString('ru-RU'),
          rendered_at: renderedAtRef.current,
          submit_at: Date.now(),
          company_website: honeypot,
        }),
      });

      const result = await expectOkApiJson(
        response,
        messages.errors.leadForm.submitFailed
      );

      setIsSubmitted(true);
      setSubmittedPhone(form.phone.trim());
      setServerMessage(result.message || messages.success.leadSent);
      setForm(buildInitialForm(''));
      renderedAtRef.current = Date.now();
      setErrors({});
      trackEvent(isCallback ? 'callback-submit' : 'lead-submit', { source });
    } catch (error) {
      captureException(error, { source: 'HeroLeadForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || messages.errors.leadForm.submitFailed);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`hero-lead-card${isCallback ? ' hero-lead-card--callback' : ''}`}
    >
      <div className="hero-lead-card__head">
        <h2 className="hero-lead-card__title">{title}</h2>
        {!isSubmitted ? (
          <p className="hero-lead-card__subtitle">{subtitle}</p>
        ) : null}
        {isCallback && !isSubmitted ? (
          <p className="hero-lead-card__schedule">
            {SITE_WORKING_HOURS_DISPLAY} · время Челябинска
          </p>
        ) : null}
      </div>

      {isSubmitted ? (
        <div
          className="hero-lead-form__success"
          role="status"
          tabIndex={-1}
          ref={statusRef}
        >
          <span className="hero-lead-form__success-icon" aria-hidden="true">
            ✓
          </span>
          <h3>
            {isCallback ? 'Заявка на звонок отправлена' : 'Спасибо за заявку'}
          </h3>
          <p>
            {isCallback
              ? `Менеджер позвонит вам по номеру ${submittedPhone}. Если сейчас нерабочее время, свяжемся в ближайший рабочий день.`
              : serverMessage}
          </p>
          {isCallback ? (
            <p>{SITE_WORKING_HOURS_DISPLAY} · время Челябинска</p>
          ) : null}
          {onDone ? (
            <button
              type="button"
              className="button-primary hero-lead-form__submit"
              onClick={onDone}
            >
              Готово
            </button>
          ) : null}
        </div>
      ) : null}

      {!isSubmitted && serverMessage ? (
        <div
          className="form-error hero-lead-form__error"
          role="alert"
          tabIndex={-1}
          ref={statusRef}
        >
          <p>{serverMessage}</p>
          <a href={SITE_PHONE_HREF}>Позвонить нам: {SITE_PHONE_DISPLAY}</a>
        </div>
      ) : null}

      {!isSubmitted ? (
        <form
          className="hero-lead-form"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <HoneypotField
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
          <div className="hero-lead-form__field">
            <label htmlFor={fieldIds.phone}>Ваш телефон</label>
            <input
              ref={phoneRef}
              id={fieldIds.phone}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={32}
              required
              disabled={isSubmitting}
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 (999) 123-45-67"
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={errors.phone ? errorIds.phone : undefined}
            />
            {errors.phone ? (
              <span id={errorIds.phone} className="field-error">
                {errors.phone}
              </span>
            ) : null}
          </div>

          <div className="hero-lead-form__field">
            <label htmlFor={fieldIds.comment}>
              {isCallback ? 'О чём хотите узнать?' : 'Комментарий'}{' '}
              <span className="hero-lead-form__optional">(необязательно)</span>
            </label>
            {!isCallback ? (
              <div
                className="hero-lead-form__quick-buttons"
                role="group"
                aria-label="Быстрые варианты комментария"
              >
                {quickCommentOptions.map((option) => {
                  const isActive = parseCommentTokens(form.comment).includes(
                    option.value
                  );

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`hero-lead-form__quick-btn${isActive ? ' hero-lead-form__quick-btn--active' : ''}`}
                      onClick={() => handleQuickComment(option.value)}
                      aria-pressed={isActive}
                      disabled={isSubmitting}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <textarea
              ref={commentRef}
              id={fieldIds.comment}
              name="comment"
              value={form.comment}
              onChange={handleChange}
              placeholder={
                isCallback
                  ? 'Например, наличие кабеля, цена или самовывоз'
                  : 'Например: ВВГ 3×2.5, 500 метров'
              }
              disabled={isSubmitting}
              className="hero-lead-form__textarea"
              rows={3}
              maxLength={MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
            />
          </div>

          <label className="hero-lead-form__consent">
            <input
              ref={consentRef}
              id={fieldIds.consent}
              name="consent"
              type="checkbox"
              checked={form.consent}
              required
              disabled={isSubmitting}
              onChange={handleChange}
              aria-invalid={errors.consent ? 'true' : undefined}
              aria-describedby={errors.consent ? errorIds.consent : undefined}
            />
            <span>
              Даю согласие на{' '}
              <a
                href="/personal-data-consent"
                target="_blank"
                rel="noopener noreferrer"
                title="Откроется в новой вкладке"
              >
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

          <button
            type="submit"
            className="button-primary hero-lead-form__submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправка...' : submitLabel}
          </button>
          {isCallback ? (
            <p className="hero-lead-form__direct">
              Удобнее позвонить самим?{' '}
              <a href={SITE_PHONE_HREF}>{SITE_PHONE_DISPLAY}</a>
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
