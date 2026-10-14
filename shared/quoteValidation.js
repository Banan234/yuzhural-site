// Файл задаёт общие правила валидации payload заявки, телефонов, email и лимитов формы.

// Серверная валидация payload заявки. Шарится между server.js и тестами.
// Зеркальная клиентская проверка живёт в src/components/quote/quoteFormValidation.js
// — синхронизировать правила удобнее, когда оба места ссылаются на один источник.

export const MAX_QUOTE_ITEMS = 200;
export const MAX_QUOTE_PAYLOAD_BYTES = 64 * 1024;
export const MAX_QUOTE_TOTAL_TEXT_LENGTH = 50_000;
export const MAX_QUOTE_CUSTOMER_NAME_LENGTH = 120;
export const MAX_QUOTE_CUSTOMER_COMMENT_LENGTH = 1000;
export const MAX_QUOTE_PREFERRED_CHANNEL_LENGTH = 20;
export const MAX_QUOTE_ITEM_SKU_LENGTH = 80;
export const MAX_QUOTE_ITEM_TITLE_LENGTH = 300;
export const MAX_QUOTE_ITEM_CATEGORY_LENGTH = 160;
export const MAX_QUOTE_ITEM_UNIT_LENGTH = 20;
export const MAX_QUOTE_ITEM_COMMENT_LENGTH = 500;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 §4.5.3.1.3
export const MAX_EMAIL_LOCAL_LENGTH = 64; // RFC 5321 §4.5.3.1.1

// Прагматичный паттерн: ASCII-only (IDN приходят punycoded), TLD ≥ 2 букв,
// без потребления квантификаторов на одинаковом классе (защита от ReDoS).
const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export function isValidEmail(value) {
  const email = String(value || '').trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  const atIndex = email.indexOf('@');
  if (atIndex < 0 || atIndex > MAX_EMAIL_LOCAL_LENGTH) return false;
  return EMAIL_RE.test(email);
}

// Валидация телефона по российскому плану нумерации. Сайт обслуживает
// Челябинск/Урал — иностранные номера в B2B-сегменте практически не встречаются.
// Отбрасывает повторяющиеся и последовательные номера, которые пропускала
// старая проверка `digits.length >= 10`.
export function isValidRussianPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) return false;
  // Первая цифра кода оператора/региона: 3–9 (план нумерации РФ; 0/1/2 не используются).
  if (!/^[3-9]/.test(digits)) return false;
  // Все одинаковые цифры — мусор (3333333333, 9999999999).
  if (/^(\d)\1{9}$/.test(digits)) return false;
  // Простые последовательности.
  if (digits === '9876543210' || digits === '1234567890') return false;
  return true;
}

function getUtf8ByteLength(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

export function getQuotePayloadSizeBytes(payload) {
  try {
    return getUtf8ByteLength(JSON.stringify(payload ?? {}));
  } catch {
    return Infinity;
  }
}

function getStringLength(value) {
  return String(value ?? '').trim().length;
}

function isWithinLength(value, maxLength) {
  return getStringLength(value) <= maxLength;
}

function sumTextLength(values) {
  return values.reduce((sum, value) => sum + getStringLength(value), 0);
}

export function getQuoteKnownTextLength({ customer, items } = {}) {
  const customerLength = customer
    ? sumTextLength([
        customer.name,
        customer.phone,
        customer.email,
        customer.comment,
        customer.preferredChannel,
      ])
    : 0;
  const itemsLength = Array.isArray(items)
    ? items.reduce(
        (sum, item) =>
          sum +
          sumTextLength([
            item?.sku,
            item?.title,
            item?.category,
            item?.unit,
            item?.comment,
          ]),
        0
      )
    : 0;

  return customerLength + itemsLength;
}

function isValidQuoteItem(item) {
  if (!item || typeof item !== 'object') return false;

  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return false;

  return (
    isWithinLength(item.sku, MAX_QUOTE_ITEM_SKU_LENGTH) &&
    isWithinLength(item.title, MAX_QUOTE_ITEM_TITLE_LENGTH) &&
    isWithinLength(item.category, MAX_QUOTE_ITEM_CATEGORY_LENGTH) &&
    isWithinLength(item.unit, MAX_QUOTE_ITEM_UNIT_LENGTH) &&
    isWithinLength(item.comment, MAX_QUOTE_ITEM_COMMENT_LENGTH)
  );
}

export function isValidQuoteRequest(
  payload = {},
  { allowEmptyItems = false } = {}
) {
  const { customer, items } = payload;
  if (
    !customer ||
    !Array.isArray(items) ||
    (!allowEmptyItems && items.length === 0)
  ) {
    return false;
  }

  if (getQuotePayloadSizeBytes(payload) > MAX_QUOTE_PAYLOAD_BYTES) {
    return false;
  }

  if (items.length > MAX_QUOTE_ITEMS) {
    return false;
  }

  if (
    getQuoteKnownTextLength({ customer, items }) > MAX_QUOTE_TOTAL_TEXT_LENGTH
  ) {
    return false;
  }

  if (!isValidRussianPhone(customer.phone)) {
    return false;
  }

  if (customer.consent !== true) {
    return false;
  }

  if (
    !isWithinLength(customer.name, MAX_QUOTE_CUSTOMER_NAME_LENGTH) ||
    !isWithinLength(customer.comment, MAX_QUOTE_CUSTOMER_COMMENT_LENGTH) ||
    !isWithinLength(
      customer.preferredChannel,
      MAX_QUOTE_PREFERRED_CHANNEL_LENGTH
    )
  ) {
    return false;
  }

  // Email опционален. Но если он есть — должен быть валидным.
  const email = String(customer.email || '').trim();
  if (email && !isValidEmail(email)) {
    return false;
  }

  // Если клиент выбрал email как канал связи — он обязан быть.
  if (customer.preferredChannel === 'email' && !email) {
    return false;
  }

  if (!items.every(isValidQuoteItem)) {
    return false;
  }

  return true;
}
