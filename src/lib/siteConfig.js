// Файл хранит единые настройки компании, контакты, URL, реквизиты и schema.org данные сайта.

// Единый источник правды о компании. Используется и на сайте (JSON-LD,
// мета-теги), и в скриптах (sitemap.xml, robots.txt, серверные ответы).
//
// Базовый URL читается из VITE_SITE_URL (или SITE_URL для серверных скриптов),
// чтобы dev-сборка не лезла в продовый домен.

function readSiteUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromNode = process.env.SITE_URL || process.env.VITE_SITE_URL;
    if (fromNode) return fromNode;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const fromVite = import.meta.env.VITE_SITE_URL;
    if (fromVite) return fromVite;
  }
  return 'https://yu-uek.ru';
}

function readPublicConfigValue(nodeName, viteName, fallback) {
  if (typeof process !== 'undefined' && process.env) {
    const fromNode = process.env[nodeName] || process.env[viteName];
    if (fromNode) return fromNode;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const fromVite = import.meta.env[viteName];
    if (fromVite) return fromVite;
  }
  return fallback;
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizePhoneDisplay(value) {
  return String(value || '').replace(/(?<=\d)-(?=\d)/g, '\u2011');
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTelegramUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '');
}

export const SITE_URL = trimTrailingSlash(readSiteUrl());
export const SITE_NAME = 'ЮжУралЭлектроКабель';
export const SITE_LEGAL_NAME = readPublicConfigValue(
  'SITE_LEGAL_NAME',
  'VITE_SITE_LEGAL_NAME',
  'ООО «ЮУЭК»'
);
export const SITE_LEGAL_FULL_NAME = readPublicConfigValue(
  'SITE_LEGAL_FULL_NAME',
  'VITE_SITE_LEGAL_FULL_NAME',
  'Общество с ограниченной ответственностью «ЮжУралЭлектроКабель»'
);
export const SITE_DESCRIPTION =
  'Оптовая поставка кабельно-проводниковой продукции в Челябинске и по России. Склад, отгрузка от 1 дня, работа с юрлицами по НДС.';
export const SITE_LOGO_PATH = '/logo.png';
export const SITE_OG_IMAGE_PATH = '/og-product.png';

export const SITE_PHONE = readPublicConfigValue(
  'SITE_PHONE',
  'VITE_SITE_PHONE',
  '+79043069494'
);
const rawSitePhoneDisplay = readPublicConfigValue(
  'SITE_PHONE_DISPLAY',
  'VITE_SITE_PHONE_DISPLAY',
  '+7\u00a0904\u00a0306-94-94'
);
export const SITE_PHONE_DISPLAY = normalizePhoneDisplay(rawSitePhoneDisplay);
export const SITE_PHONE_HREF = `tel:${SITE_PHONE}`;
export const SITE_EMAIL = readPublicConfigValue(
  'SITE_EMAIL',
  'VITE_SITE_EMAIL',
  'kabelh@bk.ru'
);
export const SITE_EMAIL_HREF = `mailto:${SITE_EMAIL}`;
export const SITE_WHATSAPP_PHONE = normalizePhoneDigits(
  readPublicConfigValue(
    'SITE_WHATSAPP_PHONE',
    'VITE_SITE_WHATSAPP_PHONE',
    '79227230010'
  )
);
export const SITE_TELEGRAM_USERNAME = normalizeTelegramUsername(
  readPublicConfigValue(
    'SITE_TELEGRAM_USERNAME',
    'VITE_SITE_TELEGRAM_USERNAME',
    'ocnuz'
  )
);
export const SITE_TELEGRAM_BUSINESS_CHAT_SLUG = String(
  readPublicConfigValue(
    'SITE_TELEGRAM_BUSINESS_CHAT_SLUG',
    'VITE_SITE_TELEGRAM_BUSINESS_CHAT_SLUG',
    ''
  )
).trim();
export const SITE_MESSENGER_PROMPT = readPublicConfigValue(
  'SITE_MESSENGER_PROMPT',
  'VITE_SITE_MESSENGER_PROMPT',
  'Здравствуйте! Интересует кабельная продукция. Нужна консультация.'
);
export const SITE_WHATSAPP_URL = `https://wa.me/${SITE_WHATSAPP_PHONE}`;
export const SITE_TELEGRAM_URL = `https://t.me/${SITE_TELEGRAM_USERNAME}`;
export const SITE_TAX_ID = readPublicConfigValue(
  'SITE_TAX_ID',
  'VITE_SITE_TAX_ID',
  '7453351320'
);
export const SITE_REGISTRATION_NUMBER = readPublicConfigValue(
  'SITE_REGISTRATION_NUMBER',
  'VITE_SITE_REGISTRATION_NUMBER',
  '1237400004445'
);

export const SITE_OFFICE_ADDRESS = {
  streetAddress: readPublicConfigValue(
    'SITE_STREET_ADDRESS',
    'VITE_SITE_STREET_ADDRESS',
    'ул. Южная, д. 9А, офис 4'
  ),
  addressLocality: 'Челябинск',
  addressRegion: 'Челябинская область',
  postalCode: '454000',
  addressCountry: 'RU',
};
export const SITE_WAREHOUSE_ADDRESS = {
  streetAddress: readPublicConfigValue(
    'SITE_WAREHOUSE_STREET_ADDRESS',
    'VITE_SITE_WAREHOUSE_STREET_ADDRESS',
    'просп. Победы, 290В'
  ),
  addressLocality: SITE_OFFICE_ADDRESS.addressLocality,
  addressRegion: SITE_OFFICE_ADDRESS.addressRegion,
  postalCode: SITE_OFFICE_ADDRESS.postalCode,
  addressCountry: SITE_OFFICE_ADDRESS.addressCountry,
};
export const SITE_ADDRESS = SITE_OFFICE_ADDRESS;
export const SITE_OFFICE_ADDRESS_DISPLAY = `г. ${SITE_OFFICE_ADDRESS.addressLocality}, ${SITE_OFFICE_ADDRESS.streetAddress}`;
export const SITE_WAREHOUSE_ADDRESS_DISPLAY = `г. ${SITE_WAREHOUSE_ADDRESS.addressLocality}, ${SITE_WAREHOUSE_ADDRESS.streetAddress}`;
export const SITE_ADDRESS_DISPLAY = SITE_OFFICE_ADDRESS_DISPLAY;
export const SITE_CITY_DISPLAY = `г. ${SITE_OFFICE_ADDRESS.addressLocality}`;
export const SITE_OFFICE_MAP_URL = `https://yandex.ru/maps/?text=${encodeURIComponent(SITE_OFFICE_ADDRESS_DISPLAY)}`;
export const SITE_OFFICE_MAP_EMBED_URL = `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(SITE_OFFICE_ADDRESS_DISPLAY)}&z=16`;
export const SITE_WAREHOUSE_MAP_URL = 'https://yandex.com/maps/-/CPcpVKnV';
export const SITE_WAREHOUSE_MAP_EMBED_URL =
  'https://yandex.com/map-widget/v1/?um=constructor%3A8172d3d6be8ab83bca46d1d7c24cafb84f99a9d78676cdeed43b2a123670e103&source=constructor';
export const SITE_MAP_URL = SITE_OFFICE_MAP_URL;
export const SITE_MAP_EMBED_URL = SITE_OFFICE_MAP_EMBED_URL;

// Часы работы — формат schema.org openingHours: «Пн–Пт 09:00–17:00».
export const SITE_WORKING_HOURS_DISPLAY = 'Пн–Пт 09:00–17:00';
export const SITE_OPENING_HOURS = ['Mo-Fr 09:00-17:00'];
export const SITE_OPENING_HOURS_SPECIFICATION = [
  {
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '17:00',
  },
];

export const SITE_SOCIAL_LINKS = [];

export function buildWhatsAppLink(message = SITE_MESSENGER_PROMPT) {
  const params = new URLSearchParams({ text: message });
  return `${SITE_WHATSAPP_URL}?${params.toString()}`;
}

export function buildTelegramLink(message = SITE_MESSENGER_PROMPT) {
  if (SITE_TELEGRAM_BUSINESS_CHAT_SLUG) {
    return `https://t.me/m/${encodeURIComponent(SITE_TELEGRAM_BUSINESS_CHAT_SLUG)}`;
  }

  const params = new URLSearchParams({
    url: SITE_URL,
    text: message,
  });
  return `https://t.me/share/url?${params.toString()}`;
}

export const SITE_REQUISITES = {
  legalName: SITE_LEGAL_NAME,
  fullLegalName: SITE_LEGAL_FULL_NAME,
  taxId: SITE_TAX_ID,
  registrationNumber: SITE_REGISTRATION_NUMBER,
};

export const SITE_QUOTE_RESPONSE_DISPLAY = 'в течение рабочего дня';

export const SITE_PUBLIC_DOCUMENTS = [
  {
    title: 'Прайс-лист',
    description: 'Excel-файл с номенклатурой и ориентиром по ценам.',
    href: '/price.xls',
    type: 'XLS',
  },
  {
    title: 'Типовой договор поставки',
    description: 'PDF для предварительной проверки условий закупки.',
    href: '/documents/supply-contract.pdf',
    type: 'PDF',
  },
  {
    title: 'Реквизиты компании',
    description: 'PDF с юридическими данными для бухгалтерии и проверки.',
    href: '/documents/company-details.pdf',
    type: 'PDF',
  },
];

export const SITE_REQUEST_DOCUMENTS = [
  'сертификаты соответствия на конкретную марку кабеля',
  'сертификаты пожарной безопасности, если они требуются для позиции',
  'паспорта качества и протоколы испытаний производителя',
  'фото склада, офиса или партии перед отгрузкой',
  'копии закрывающих документов по согласованной поставке',
];

export const SITE_MANUFACTURERS = [
  'ККЗ',
  'КРУИНВЭЛК',
  'ПИРОКОР',
  'ГЕРДА',
  'СОББИТ',
  'МЕТРОЛАН',
  'ТРАНСКАБ',
  'BELDEN',
  'HOLDCAB',
  'Prysmian',
  'SIEMENS',
];

export function absoluteUrl(path = '/') {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export function isRasterSocialImage(path) {
  return /\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(String(path || ''));
}

export function resolveSocialImageUrl(path = SITE_OG_IMAGE_PATH) {
  return absoluteUrl(
    path && isRasterSocialImage(path) ? path : SITE_OG_IMAGE_PATH
  );
}

export function buildOrganizationJsonLd(overrides = {}) {
  const organization = {
    '@type': 'Organization',
    '@id': `${SITE_URL}#organization`,
    name: SITE_NAME,
    legalName: SITE_LEGAL_FULL_NAME,
    url: SITE_URL,
    logo: absoluteUrl(SITE_LOGO_PATH),
    description: SITE_DESCRIPTION,
    telephone: SITE_PHONE,
    email: SITE_EMAIL,
    taxID: SITE_TAX_ID,
    identifier: [
      {
        '@type': 'PropertyValue',
        propertyID: 'ИНН',
        value: SITE_TAX_ID,
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'ОГРН',
        value: SITE_REGISTRATION_NUMBER,
      },
    ],
    address: {
      '@type': 'PostalAddress',
      ...SITE_OFFICE_ADDRESS,
    },
    openingHours: SITE_OPENING_HOURS,
    openingHoursSpecification: SITE_OPENING_HOURS_SPECIFICATION.map((item) => ({
      '@type': 'OpeningHoursSpecification',
      ...item,
    })),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: SITE_PHONE,
        email: SITE_EMAIL,
        contactType: 'sales',
        areaServed: 'RU',
        availableLanguage: ['ru'],
      },
    ],
    ...(SITE_SOCIAL_LINKS.length > 0 ? { sameAs: SITE_SOCIAL_LINKS } : {}),
  };

  return { ...organization, ...overrides };
}
