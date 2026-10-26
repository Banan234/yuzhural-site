// Файл хранит SEO-метаданные статических страниц и тексты для canonical/meta tags.

import { SITE_NAME } from './siteConfig.js';
import { toCanonicalSitePath } from './canonicalPaths.js';

export const STATIC_PAGE_SEO = {
  about: {
    path: toCanonicalSitePath('/about'),
    title: 'О компании',
    fullTitle: `О компании — ${SITE_NAME}`,
    description:
      'ЮжУралЭлектроКабель — надёжный поставщик кабельно-проводниковой продукции. Работаем с 2008 года, более 5000 позиций в наличии.',
  },
  delivery: {
    path: toCanonicalSitePath('/delivery'),
    title: 'Получение заказа',
    fullTitle: `Получение заказа — ${SITE_NAME}`,
    description:
      'Получение кабеля со склада в Челябинске: самовывоз лично или вашей транспортной компанией. График выдачи, документы и условия погрузки.',
  },
  payment: {
    path: toCanonicalSitePath('/payment'),
    title: 'Оплата',
    fullTitle: `Оплата — ${SITE_NAME}`,
    description:
      'Оплата и оформление поставки в ЮжУралЭлектроКабель: счёт или договор после подтверждения наличия, цены и условий отгрузки для компаний и физических лиц.',
  },
  privacy: {
    path: '/privacy',
    title: 'Политика конфиденциальности',
    fullTitle: `Политика конфиденциальности — ${SITE_NAME}`,
    description:
      'Политика конфиденциальности и обработки персональных данных на сайте ЮжУралЭлектроКабель: формы заявок, аналитика, cookie, хранение и порядок обращения.',
  },
};
