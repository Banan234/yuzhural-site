// Файл собирает JSON-LD для статических страниц: организация, хлебные крошки и информационные разделы.

import {
  SITE_NAME,
  SITE_PHONE,
  SITE_URL,
  absoluteUrl,
  buildOrganizationJsonLd,
} from './siteConfig.js';
import { ORDER_FAQ, PURCHASE_PAGES } from '../../shared/purchaseContent.js';
import { STATIC_PAGE_SEO } from './staticSeo.js';

const STATIC_PAGE_JSON_LD_IDS = {
  ...Object.fromEntries(
    Object.entries(PURCHASE_PAGES).map(([key, page]) => [
      page.path,
      `purchase-${key}-json-ld`,
    ])
  ),
  [STATIC_PAGE_SEO.about.path]: 'about-page-json-ld',
  [STATIC_PAGE_SEO.payment.path]: 'payment-page-json-ld',
  [STATIC_PAGE_SEO.delivery.path]: 'delivery-page-json-ld',
  [STATIC_PAGE_SEO.privacy.path]: 'privacy-page-json-ld',
};

function buildWebsiteReference() {
  return {
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  };
}

function buildOrganizationReference() {
  return buildOrganizationJsonLd();
}

function buildAboutPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.about.path)}#webpage`,
        url: absoluteUrl(STATIC_PAGE_SEO.about.path),
        name: STATIC_PAGE_SEO.about.fullTitle,
        description: STATIC_PAGE_SEO.about.description,
        isPartOf: buildWebsiteReference(),
        about: { '@id': `${SITE_URL}#organization` },
      },
      buildOrganizationReference(),
    ],
  };
}

function buildPaymentPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.payment.path)}#webpage`,
        url: absoluteUrl(STATIC_PAGE_SEO.payment.path),
        name: STATIC_PAGE_SEO.payment.fullTitle,
        description: STATIC_PAGE_SEO.payment.description,
        isPartOf: buildWebsiteReference(),
        provider: buildOrganizationReference(),
      },
      {
        '@type': 'FAQPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.payment.path)}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Можно ли оплатить кабель как юридическое лицо с НДС?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Да, выставляем счет по безналичному расчету, работаем с НДС и передаем закрывающие документы.',
            },
          },
          {
            '@type': 'Question',
            name: 'Как оплатить счет ИП или частному покупателю?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Счет можно оплатить в отделении банка, через мобильное приложение банка или по QR-коду, если он включен в документ.',
            },
          },
          {
            '@type': 'Question',
            name: 'Когда начинается отгрузка после оплаты?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Отгрузку начинаем после поступления денежных средств на расчетный счет и подтверждения комплектации заказа менеджером.',
            },
          },
        ],
      },
    ],
  };
}

function buildDeliveryPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.delivery.path)}#webpage`,
        url: absoluteUrl(STATIC_PAGE_SEO.delivery.path),
        name: STATIC_PAGE_SEO.delivery.fullTitle,
        description: STATIC_PAGE_SEO.delivery.description,
        isPartOf: buildWebsiteReference(),
        provider: {
          ...buildOrganizationJsonLd({ '@type': 'LocalBusiness' }),
          telephone: SITE_PHONE,
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.delivery.path)}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Как быстро отгружается кабель со склада?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Позиции в наличии обычно готовим к отгрузке от 1 рабочего дня после оплаты и согласования комплектации.',
            },
          },
          {
            '@type': 'Question',
            name: 'Можно ли отправить заказ транспортной компанией?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Да, отправляем кабельную продукцию транспортными компаниями по России и согласуем способ доставки при оформлении заказа.',
            },
          },
        ],
      },
    ],
  };
}

function buildPrivacyPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(STATIC_PAGE_SEO.privacy.path)}#webpage`,
        url: absoluteUrl(STATIC_PAGE_SEO.privacy.path),
        name: STATIC_PAGE_SEO.privacy.fullTitle,
        description: STATIC_PAGE_SEO.privacy.description,
        isPartOf: buildWebsiteReference(),
        about: { '@id': `${SITE_URL}#organization` },
        provider: buildOrganizationReference(),
      },
      buildOrganizationReference(),
    ],
  };
}

export function getStaticPageJsonLdId(path) {
  return STATIC_PAGE_JSON_LD_IDS[path] || '';
}

export function buildStaticPageJsonLd(path) {
  if (path === STATIC_PAGE_SEO.about.path) return buildAboutPageJsonLd();
  if (path === STATIC_PAGE_SEO.payment.path) return buildPaymentPageJsonLd();
  if (path === STATIC_PAGE_SEO.delivery.path) return buildDeliveryPageJsonLd();
  if (path === STATIC_PAGE_SEO.privacy.path) return buildPrivacyPageJsonLd();
  const page = Object.values(PURCHASE_PAGES).find((page) => page.path === path);
  if (!page) return null;
  const graph = [
    {
      '@type': 'WebPage',
      '@id': `${absoluteUrl(page.path)}#webpage`,
      url: absoluteUrl(page.path),
      name: `${page.title} — ${SITE_NAME}`,
      description: page.description,
      isPartOf: buildWebsiteReference(),
      provider: buildOrganizationReference(),
    },
  ];
  if (page.path === PURCHASE_PAGES.order.path)
    graph.push({
      '@type': 'FAQPage',
      '@id': `${absoluteUrl(page.path)}#faq`,
      mainEntity: ORDER_FAQ.map(([name, text]) => ({
        '@type': 'Question',
        name,
        acceptedAnswer: { '@type': 'Answer', text },
      })),
    });
  return { '@context': 'https://schema.org', '@graph': graph };
}
