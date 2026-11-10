import {
  calculateQuote,
  quoteMoneyPayload,
} from '../../../shared/quoteMoney.js';
import { formatPhone } from '../../lib/formatPhone';
import { PERSONAL_DATA_CONSENT_VERSION } from '../../../shared/personalDataConsent';
// Файл реализует лид-форму на главном экране, включая отправку, аналитику и антибот-поля.

import { useEffect, useRef, useState } from 'react';
import LeadAttachment from '../forms/LeadAttachment';
import HoneypotField from '../forms/HoneypotField';
import { submitLeadRequest } from '../../lib/submitLeadRequest';
import { captureException } from '../../lib/errorTracking';
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  isValidRussianPhone,
} from '../../../shared/quoteValidation.js';
import { formatMessage, messages } from '../../../shared/messages.js';
import { trackEvent } from '../../lib/analytics';
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF } from '../../lib/siteConfig';

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
  draftRef,
  quoteItems = null,
  onQuoteSent,
}) {
  const isCallback = mode === 'callback';
  const isQuote = quoteItems !== null;
  const submissionRef = useRef(draftRef?.current?.submission || null);
  const [previousPhone, setPreviousPhone] = useState(
    draftRef?.current?.previousPhone || ''
  );
  const sentFormRef = useRef(null);
  const [requestId, setRequestId] = useState(
    draftRef?.current?.requestId || ''
  );
  const [file, setFile] = useState(() => draftRef?.current?.file || null);
  const [form, setForm] = useState(
    () => draftRef?.current?.form || buildInitialForm(defaultComment)
  );
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
  const renderedAtRef = useRef(draftRef?.current?.renderedAt || Date.now());
  const mountedRef = useRef(false);
  const restoredSubmissionRef = useRef(draftRef?.current?.submission);
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
    if (draftRef)
      draftRef.current = isSubmitted
        ? null
        : {
            form,
            file,
            submission: submissionRef.current,
            previousPhone,
            requestId,
            renderedAt: renderedAtRef.current,
          };
  }, [draftRef, form, file, isSubmitted, previousPhone, requestId]);

  useEffect(() => {
    if (isSubmitted || serverMessage) statusRef.current?.focus();
  }, [isSubmitted, serverMessage]);

  useEffect(() => {
    mountedRef.current = true;
    const submission = restoredSubmissionRef.current;
    if (submission?.pending) {
      submittingRef.current = true;
      setIsSubmitting(true);
      observeSubmission(submission.pending, submission.snapshot, submission);
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function observeSubmission(promise, snapshot, submission) {
    try {
      const result = await promise;
      if (draftRef?.current?.submission === submission) draftRef.current = null;
      if (!mountedRef.current) return;
      sentFormRef.current = snapshot;
      setRequestId(result.requestId || '');
      setIsSubmitted(true);
      setFile(null);
      setSubmittedPhone(snapshot.form.phone.trim());
      setServerMessage(result.message || messages.success.leadSent);
      setForm(buildInitialForm(''));
      renderedAtRef.current = Date.now();
      setErrors({});
      if (!submission?.tracked) {
        if (submission) submission.tracked = true;
        if (isQuote) onQuoteSent?.();
        trackEvent(
          isQuote
            ? 'quote-submit'
            : isCallback
              ? 'callback-submit'
              : 'lead-submit',
          { source }
        );
      }
    } catch (error) {
      if (!mountedRef.current) return;
      captureException(error, { source: 'HeroLeadForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || messages.errors.leadForm.submitFailed);
    } finally {
      if (submission) submission.pending = null;
      if (mountedRef.current) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : name === 'phone'
            ? prev.phone === '+7 (' && /^77$/.test(value.replace(/\D/g, ''))
              ? '+7 ('
              : formatPhone(value)
            : value,
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

      let payload = {
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
      };
      if (isQuote) {
        const money = calculateQuote(quoteItems);
        payload = {
          ...payload,
          customer: {
            name: '',
            phone: payload.phone,
            email: '',
            comment: payload.comment,
            preferredChannel: 'phone',
            consent: payload.consent,
            consentVersion: payload.consentVersion,
          },
          items: money.items,
          ...quoteMoneyPayload(money),
          requestType: 'quote',
        };
      }
      {
        const fingerprint = JSON.stringify({
          phone: payload.phone,
          comment: payload.comment,
          previousPhone,
          items: isQuote ? payload.items : undefined,
        });
        if (
          !submissionRef.current ||
          submissionRef.current.fingerprint !== fingerprint ||
          submissionRef.current.file !== file
        ) {
          submissionRef.current = {
            id: crypto.randomUUID(),
            fingerprint,
            file,
            previousRequestId: previousPhone ? requestId : undefined,
            source: payload.source,
            page: payload.page,
          };
        }
        payload.source = submissionRef.current.source;
        payload.page = submissionRef.current.page;
        payload.submissionId = submissionRef.current.id;
        if (previousPhone) {
          payload.previousPhone = previousPhone;
          payload.previousRequestId =
            submissionRef.current.previousRequestId || requestId;
        }
        if (draftRef)
          draftRef.current = {
            form,
            file,
            submission: submissionRef.current,
            previousPhone,
            requestId,
            renderedAt: renderedAtRef.current,
          };
      }
      const promise = submitLeadRequest(
        payload,
        file,
        isQuote ? { endpoint: '/api/quote' } : {}
      );
      const submission = submissionRef.current;
      const snapshot = { form, file };
      if (submission) {
        submission.pending = promise;
        submission.snapshot = snapshot;
      }
      await observeSubmission(promise, snapshot, submission);
    } catch (error) {
      captureException(error, { source: 'HeroLeadForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || messages.errors.leadForm.submitFailed);
    } finally {
      if (mountedRef.current) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
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
      </div>

      {isSubmitted ? (
        <div
          className="hero-lead-form__success"
          role="status"
          tabIndex={-1}
          ref={statusRef}
        >
          <div className="hero-lead-form__success-heading">
            <span className="hero-lead-form__success-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" focusable="false">
                <path
                  d="m7 16 6 6L25 9"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h3>Заявка принята</h3>
          </div>
          <p>
            {isCallback
              ? `Менеджер перезвонит вам на номер ${submittedPhone} в рабочее время.`
              : serverMessage}
          </p>
          {requestId && <p>Заявка № {requestId}</p>}
          {isCallback ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setPreviousPhone(submittedPhone);
                setForm({
                  ...sentFormRef.current.form,
                  phone: submittedPhone,
                  consent: false,
                });
                setFile(sentFormRef.current.file);
                submissionRef.current = null;
                setServerMessage('');
                setIsSubmitted(false);
                requestAnimationFrame(() => {
                  phoneRef.current?.focus();
                  phoneRef.current?.select();
                });
              }}
            >
              Изменить заявку
            </button>
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
          <div className="hero-lead-form__error-heading">
            <span className="hero-lead-form__error-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" focusable="false">
                <path
                  d="m7 7 10 10M17 7 7 17"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h3>Не удалось отправить заявку</h3>
          </div>
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
          {previousPhone ? (
            <p>
              Исправление номера: ранее указали {previousPhone}. Отправим
              менеджеру новый номер взамен предыдущего.
            </p>
          ) : null}
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
              onFocus={() => {
                if (!form.phone)
                  setForm((prev) => ({ ...prev, phone: '+7 (' }));
              }}
              onBlur={() => {
                if (form.phone.replace(/\D/g, '') === '7') {
                  setForm((prev) => ({ ...prev, phone: '' }));
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Backspace' &&
                  event.currentTarget.selectionStart ===
                    event.currentTarget.selectionEnd &&
                  event.currentTarget.selectionStart ===
                    event.currentTarget.value.length &&
                  /\D$/.test(event.currentTarget.value)
                ) {
                  event.preventDefault();
                  const digits = form.phone.replace(/\D/g, '').slice(0, -1);
                  setForm((prev) => ({ ...prev, phone: formatPhone(digits) }));
                }
              }}
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
              rows={isCallback ? 2 : 3}
              maxLength={MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
            />
          </div>

          {isCallback ? (
            <LeadAttachment
              id={`${idPrefix}-file`}
              file={file}
              multiple={isQuote}
              onChange={setFile}
              disabled={isSubmitting}
            />
          ) : null}
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
              </a>
              {isCallback ? (
                '.'
              ) : (
                <>
                  {' '}
                  ·{' '}
                  <a href="/privacy/" target="_blank" rel="noopener noreferrer">
                    Политика конфиденциальности
                  </a>
                </>
              )}
            </span>
          </label>
          {errors.consent ? (
            <span id={errorIds.consent} className="field-error">
              {errors.consent}
            </span>
          ) : null}

          {isCallback ? (
            <p className="hero-lead-form__privacy">
              <a
                href="/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                title="Откроется в новой вкладке"
              >
                Политика конфиденциальности
              </a>
            </p>
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
              Или позвоните нам:{' '}
              <a href={SITE_PHONE_HREF}>{SITE_PHONE_DISPLAY}</a>
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
