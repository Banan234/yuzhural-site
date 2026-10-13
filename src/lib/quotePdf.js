// Файл генерирует PDF коммерческого предложения из выбранных товаров и контактных данных.

// Генерация коммерческого предложения в PDF.
// Шрифты Roboto-Regular/Roboto-Bold лежат в public/fonts и грузятся по HTTP.
// Браузерный cache-control работает между обновлениями страницы, а в module-scope
// остаётся только base64 текущей вкладки для передачи в jsPDF VFS.

import {
  SITE_ADDRESS,
  SITE_EMAIL,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_PHONE_DISPLAY,
  SITE_URL,
} from './siteConfig.js';
import { formatMessage, messages } from '../../shared/messages.js';

const COMPANY = {
  name: SITE_NAME,
  legal: SITE_LEGAL_NAME,
  city: SITE_ADDRESS.addressLocality,
  phone: SITE_PHONE_DISPLAY,
  email: SITE_EMAIL,
  site: SITE_URL.replace(/^https?:\/\//i, ''),
};

const QUOTE_VALIDITY_DAYS = 3;
const FONT_REGULAR = 'Roboto';
const FONT_BOLD = 'Roboto-Bold';
const FONT_FILES = {
  regular: '/fonts/Roboto-Regular-v2026.ttf',
  bold: '/fonts/Roboto-Bold-v2026.ttf',
};

let cachedFontDataPromise = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchFontBase64(url) {
  const response = await fetch(url, { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error(formatMessage(messages.errors.pdf.fontLoadFailed, { url }));
  }

  return arrayBufferToBase64(await response.arrayBuffer());
}

async function loadFontData() {
  if (!cachedFontDataPromise) {
    cachedFontDataPromise = Promise.all([
      fetchFontBase64(FONT_FILES.regular),
      fetchFontBase64(FONT_FILES.bold),
    ]).then(([robotoRegularBase64, robotoBoldBase64]) => ({
      robotoRegularBase64,
      robotoBoldBase64,
    }));
  }

  return cachedFontDataPromise;
}

export async function registerFonts(doc) {
  const { robotoRegularBase64, robotoBoldBase64 } = await loadFontData();
  doc.addFileToVFS('Roboto-Regular.ttf', robotoRegularBase64);
  doc.addFont('Roboto-Regular.ttf', FONT_REGULAR, 'normal');
  doc.addFileToVFS('Roboto-Bold.ttf', robotoBoldBase64);
  doc.addFont('Roboto-Bold.ttf', FONT_BOLD, 'normal');
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function buildQuoteNumber(date) {
  const yymmdd =
    String(date.getFullYear()).slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `КП-${yymmdd}-${random}`;
}

export async function generateQuotePdf({ items, customer = null } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(messages.errors.pdf.emptyItems);
  }

  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default || autoTableModule.autoTable;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registerFonts(doc);
  doc.setFont(FONT_REGULAR, 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const today = new Date();
  const validUntil = new Date(
    today.getTime() + QUOTE_VALIDITY_DAYS * 24 * 3600 * 1000
  );
  const quoteNumber = buildQuoteNumber(today);

  // ─── Шапка
  doc.setFont(FONT_BOLD, 'normal');
  doc.setFontSize(16);
  doc.text(COMPANY.name, margin, 18);

  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(COMPANY.legal, margin, 24);
  doc.text(
    `г. ${COMPANY.city} · ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.site}`,
    margin,
    28.5
  );

  // Номер и дата справа
  doc.setTextColor(20);
  doc.setFont(FONT_BOLD, 'normal');
  doc.setFontSize(11);
  doc.text(`Коммерческое предложение`, pageWidth - margin, 18, {
    align: 'right',
  });
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  doc.text(`№ ${quoteNumber}`, pageWidth - margin, 24, { align: 'right' });
  doc.text(`от ${formatDate(today)}`, pageWidth - margin, 28.5, {
    align: 'right',
  });

  // Линия-разделитель
  doc.setDrawColor(220);
  doc.setLineWidth(0.4);
  doc.line(margin, 33, pageWidth - margin, 33);

  // ─── Адресат
  let cursorY = 41;
  if (customer && (customer.name || customer.phone || customer.email)) {
    doc.setFont(FONT_BOLD, 'normal');
    doc.setFontSize(10);
    doc.text('Адресат:', margin, cursorY);
    doc.setFont(FONT_REGULAR, 'normal');
    doc.setFontSize(10);
    const lines = [customer.name, customer.phone, customer.email].filter(
      Boolean
    );
    cursorY += 5;
    for (const line of lines) {
      doc.text(String(line), margin, cursorY);
      cursorY += 4.5;
    }
    cursorY += 2;
  }

  // ─── Таблица позиций
  let totalPrice = 0;
  let totalCount = 0;
  const tableBody = items.map((item, idx) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const lineTotal = price * quantity;
    totalPrice += lineTotal;
    totalCount += quantity;

    const titleParts = [];
    if (item.title) titleParts.push(String(item.title));
    if (item.sku) titleParts.push(`SKU: ${item.sku}`);
    if (item.comment) titleParts.push(`Комм.: ${item.comment}`);

    return [
      String(idx + 1),
      titleParts.join('\n'),
      `${formatNumber(quantity)} ${item.unit || 'м'}`,
      price > 0 ? `${formatNumber(price)} ₽` : 'по запросу',
      lineTotal > 0 ? `${formatNumber(lineTotal)} ₽` : '—',
    ];
  });

  autoTable(doc, {
    startY: cursorY,
    head: [['№', 'Наименование', 'Кол-во', 'Цена', 'Сумма']],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      font: FONT_REGULAR,
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      textColor: [20, 20, 20],
    },
    headStyles: {
      font: FONT_BOLD,
      fillColor: [16, 34, 56],
      textColor: 255,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [248, 250, 253] },
  });

  // ─── Итог
  const afterTableY = doc.lastAutoTable.finalY + 6;
  doc.setFont(FONT_BOLD, 'normal');
  doc.setFontSize(11);
  doc.text(
    `Итого: ${formatNumber(totalPrice)} ₽`,
    pageWidth - margin,
    afterTableY,
    { align: 'right' }
  );
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Позиций: ${items.length} · Общее количество: ${formatNumber(totalCount)}`,
    pageWidth - margin,
    afterTableY + 5,
    { align: 'right' }
  );

  // ─── Примечания внизу
  doc.setTextColor(20);
  doc.setFont(FONT_REGULAR, 'normal');
  doc.setFontSize(9);
  let footerY = afterTableY + 14;
  const notes = [
    `Предложение действительно ${QUOTE_VALIDITY_DAYS} дня — до ${formatDate(validUntil)}.`,
    'Цены указаны с НДС. Условия отгрузки и доставки согласовываются отдельно.',
    'При оптовых объёмах от 5 000 м — индивидуальная скидка.',
    `По вопросам: ${COMPANY.phone} · ${COMPANY.email}`,
  ];
  for (const note of notes) {
    doc.text(note, margin, footerY);
    footerY += 4.5;
  }

  // ─── Подвал
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`${COMPANY.legal} · ${COMPANY.site}`, margin, pageHeight - 10);
  doc.text(
    `${quoteNumber} · ${formatDate(today)}`,
    pageWidth - margin,
    pageHeight - 10,
    { align: 'right' }
  );

  doc.save(`${quoteNumber}.pdf`);
  return { quoteNumber, totalPrice, totalCount };
}
