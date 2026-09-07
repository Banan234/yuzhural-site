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
}) {
  const [form, setForm] = useState(() => buildInitialForm(defaultComment));
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const commentRef = useRef(null);
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

    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitted(false);
      return;
    }

    try {
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
            formatMessage(messages.text.leadDefaultCommentPrefix, { source }),
          source,
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
      setServerMessage(result.message || messages.success.leadSent);
      setForm(buildInitialForm(''));
      renderedAtRef.current = Date.now();
      setErrors({});
    } catch (error) {
      captureException(error, { source: 'HeroLeadForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || messages.errors.leadForm.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="hero-lead-card">
      <div className="hero-lead-card__head">
        <h2 className="hero-lead-card__title">{title}</h2>
        <p className="hero-lead-card__subtitle">{subtitle}</p>
      </div>

      {isSubmitted ? <div className="form-success">{serverMessage}</div> : null}

      {!isSubmitted && serverMessage ? (
        <div className="form-error">{serverMessage}</div>
      ) : null}

      <form className="hero-lead-form" onSubmit={handleSubmit} noValidate>
        <HoneypotField
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
        <div className="hero-lead-form__field">
          <label htmlFor={fieldIds.phone}>Ваш телефон</label>
          <input
            id={fieldIds.phone}
            name="phone"
            type="text"
            value={form.phone}
            onChange={handleChange}
            placeholder="+7 ___ - __ - __"
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
            Комментарий{' '}
            <span className="hero-lead-form__optional">(необязательно)</span>
          </label>
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
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <textarea
            ref={commentRef}
            id={fieldIds.comment}
            name="comment"
            value={form.comment}
            onChange={handleChange}
            placeholder="Например: ВВГ 3×2.5, 500 метров"
            className="hero-lead-form__textarea"
            rows={3}
            maxLength={MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
          />
        </div>

        <label className="hero-lead-form__consent">
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
            <a href="/privacy">обработку персональных&nbsp;данных</a>
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
      </form>
    </div>
  );
}
