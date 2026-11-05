// Quote amounts: round each decimal product half up to integer kopecks, then sum.
import { isProductPending } from './productAvailability.js';

function decimalParts(value) {
  const [base, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = base.split('.');
  let digits = BigInt(whole + fraction);
  let scale = fraction.length - Number(exponent);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}

function lineKopecks(price, quantity) {
  const p = decimalParts(price),
    q = decimalParts(quantity);
  const denominator = 10n ** BigInt(p.scale + q.scale);
  const rounded = (p.digits * q.digits * 100n + denominator / 2n) / denominator;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

export function calculateQuote(items = [], { pendingIds = new Set() } = {}) {
  const available = items.filter(
    (item) => !isProductPending(item) && !pendingIds.has(Number(item.id))
  );
  const rows = available.map((item) => {
    const quantity = Number(item.quantity),
      price = Number(item.price);
    const quantityValid =
      ['number', 'string'].includes(typeof item.quantity) &&
      Number.isFinite(quantity) &&
      quantity > 0;
    const priceTypeValid = ['number', 'string'].includes(typeof item.price);
    const unknownPrice =
      item.price == null ||
      (priceTypeValid && (String(item.price).trim() === '' || price === 0));
    const priceValid = priceTypeValid && Number.isFinite(price) && price > 0;
    const amount =
      quantityValid && priceValid ? lineKopecks(price, quantity) : null;
    return {
      item,
      quantity,
      price,
      lineKopecks: amount,
      invalid:
        !quantityValid ||
        (!unknownPrice && !priceValid) ||
        (priceValid && amount === null),
    };
  });
  const knownSubtotalKopecks = rows.reduce(
    (sum, row) => sum + (row.lineKopecks ?? 0),
    0
  );
  const invalid =
    rows.some((row) => row.invalid) ||
    !Number.isSafeInteger(knownSubtotalKopecks);
  const unknownPriceCount = rows.filter(
    (row) => row.lineKopecks === null
  ).length;
  const complete = rows.length > 0 && unknownPriceCount === 0 && !invalid;
  return {
    items: available,
    rows,
    itemCount: rows.length,
    excludedPendingCount: items.length - available.length,
    knownSubtotalKopecks: invalid ? null : knownSubtotalKopecks,
    unknownPriceCount,
    complete,
    invalid,
    totalKopecks: complete ? knownSubtotalKopecks : null,
    totalPrice: complete ? knownSubtotalKopecks / 100 : null,
  };
}

export function formatQuoteMoney(kopecks) {
  if (!Number.isSafeInteger(kopecks) || kopecks < 0)
    throw new RangeError('Invalid money amount');
  const value = BigInt(kopecks);
  return `${(value / 100n).toLocaleString('ru-RU')},${String(value % 100n).padStart(2, '0')} ₽`;
}

export function formatQuoteUnitPrice(value) {
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 20 })} ₽`;
}

export function getQuoteTotalDisplay(quote) {
  if (quote.complete)
    return {
      label: 'Предварительная сумма',
      value: formatQuoteMoney(quote.totalKopecks),
      detail: '',
    };
  if (!quote.invalid && quote.rows.some((row) => row.lineKopecks !== null)) {
    return {
      label: 'Известная часть',
      value: formatQuoteMoney(quote.knownSubtotalKopecks),
      detail: `Ещё ${quote.unknownPriceCount} поз. — по запросу. Полная сумма после расчёта.`,
    };
  }
  return {
    label: 'Предварительная сумма',
    value: 'Итог будет рассчитан в КП',
    detail: '',
  };
}

export function quoteMoneyPayload(quote) {
  return {
    totalCount: quote.itemCount,
    totalPrice: quote.totalPrice,
    knownSubtotalKopecks: quote.knownSubtotalKopecks,
    totalKopecks: quote.totalKopecks,
    unknownPriceCount: quote.unknownPriceCount,
    totalComplete: quote.complete,
  };
}
