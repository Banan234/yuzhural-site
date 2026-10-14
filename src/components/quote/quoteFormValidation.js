// Файл валидирует клиентские поля формы КП и возвращает сообщения ошибок по именам полей.

// Клиентская валидация формы КП. Возвращает { fieldName: 'сообщение' }.
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  MAX_QUOTE_ITEM_COMMENT_LENGTH,
  MAX_QUOTE_ITEMS,
  isValidEmail,
  isValidRussianPhone,
} from '../../../shared/quoteValidation.js';
import { formatMessage, messages } from '../../../shared/messages.js';

export function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function validateForm(form, items, { hasSpecification = false } = {}) {
  const errors = {};

  const name = String(form?.name || '').trim();
  const phone = normalizePhone(String(form?.phone || '').trim());
  const email = String(form?.email || '').trim();
  const comment = String(form?.comment || '').trim();
  const preferredChannel = form?.preferredChannel;

  if (!name) {
    errors.name = messages.errors.quoteForm.nameRequired;
  } else if (name.length < 2) {
    errors.name = messages.errors.quoteForm.nameTooShort;
  }

  if (!phone) {
    errors.phone = messages.errors.quoteForm.phoneRequired;
  } else if (!isValidRussianPhone(phone)) {
    errors.phone = messages.errors.quoteForm.phoneInvalid;
  }

  // Email опционален. Проверяем формат только если поле заполнено,
  // либо если клиент сам выбрал email как канал связи.
  if (email) {
    if (!isValidEmail(email)) {
      errors.email = messages.errors.quoteForm.emailInvalid;
    }
  } else if (preferredChannel === 'email') {
    errors.email = messages.errors.quoteForm.emailRequiredForChannel;
  }

  if (comment.length > MAX_QUOTE_CUSTOMER_COMMENT_LENGTH) {
    errors.comment = formatMessage(
      messages.errors.quoteForm.customerCommentTooLong,
      { max: MAX_QUOTE_CUSTOMER_COMMENT_LENGTH }
    );
  }

  if (form?.consent !== true) {
    errors.consent = messages.errors.quoteForm.consentRequired;
  }

  if (!Array.isArray(items) || (!hasSpecification && items.length === 0)) {
    errors.cart = messages.errors.quoteForm.cartEmpty;
  } else if (items.length > MAX_QUOTE_ITEMS) {
    errors.cart = formatMessage(messages.errors.quoteForm.tooManyItems, {
      max: MAX_QUOTE_ITEMS,
    });
  } else if (
    items.some(
      (item) =>
        String(item?.comment || '').trim().length >
        MAX_QUOTE_ITEM_COMMENT_LENGTH
    )
  ) {
    errors.cart = formatMessage(messages.errors.quoteForm.itemCommentTooLong, {
      max: MAX_QUOTE_ITEM_COMMENT_LENGTH,
    });
  }

  return errors;
}
