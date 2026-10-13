// Общие адреса и метаданные сервисов используются в навигации, SSR и sitemap.
import { MAX_QUOTE_CUSTOMER_COMMENT_LENGTH } from '../../shared/quoteValidation.js';
export const CABLE_SERVICES = [
  {
    key: 'weight',
    path: '/calculator/weight/',
    title: 'Вес и диаметр кабеля',
    short: 'Вес и диаметр',
    number: '01',
    description:
      'Масса кабеля и барабанов, наружный диаметр и расчёт нескольких позиций по таблицам изготовителей.',
  },
  {
    key: 'marking',
    path: '/services/marking/',
    title: 'Расшифровка маркировки',
    short: 'Маркировка',
    number: '02',
    description:
      'Конструкция, материалы и индексы исполнения. Разбор обозначения марки и размера кабеля.',
  },
  {
    key: 'reference',
    path: '/services/reference/',
    title: 'Справочник кабеля',
    short: 'Справочник',
    number: '03',
    description:
      'Назначение распространённых марок, технические таблицы и переход к продукции в каталоге.',
  },
  {
    key: 'analogs',
    path: '/services/analogs/',
    title: 'Подбор возможной замены',
    short: 'Замены',
    number: '04',
    description:
      'Сравнение родственных марок, различий конструкции и требований для согласования замены.',
  },
  {
    key: 'drum',
    path: '/services/drum/',
    title: 'Длина кабеля на барабане',
    short: 'Длина на барабане',
    number: '05',
    description:
      'Оценка длины по геометрии намотки или фактической массе кабеля без тары.',
  },
  {
    key: 'shipping',
    path: '/services/shipping/',
    title: 'Подготовка доставки',
    short: 'Доставка',
    number: '06',
    description:
      'Масса, объём и габариты грузовых мест. Проверка размещения и заявка на расчёт перевозки.',
  },
  {
    key: 'manufacturers',
    path: '/services/manufacturers/',
    title: 'Производители кабеля',
    short: 'Производители',
    number: '07',
    description:
      'Изготовители и опубликованные ими таблицы для точной марки и конструкции кабеля.',
  },
];
export const SERVICES_PATH = '/services/';
export function getCableService(key) {
  return CABLE_SERVICES.find((service) => service.key === key);
}
export function serviceUrl(key, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  );
  return `${getCableService(key)?.path || SERVICES_PATH}${query.size ? `?${query}` : ''}`;
}
export function catalogSearchUrl(search) {
  return `/catalog/?${new URLSearchParams({ search })}`;
}
export function requestServiceHelp(title, comment) {
  const text = String(comment);
  const truncated = text.length > MAX_QUOTE_CUSTOMER_COMMENT_LENGTH;
  const suffix =
    '\nПолный расчёт доступен в скачанном PDF или текстовом файле.';
  const summary = truncated
    ? text
        .slice(0, MAX_QUOTE_CUSTOMER_COMMENT_LENGTH - suffix.length)
        .replace(/\n[^\n]*$/, '') + suffix
    : text;
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', {
      detail: {
        title,
        subtitle: truncated
          ? 'В форму перенесено начало расчёта. Полный расчёт сохраните кнопкой PDF или «Скачать текст». Оставьте телефон для связи.'
          : 'Проверьте параметры в заявке и оставьте телефон для связи.',
        submitLabel: 'Отправить заявку',
        comment: summary,
        source: `Сервисы: ${title}`,
      },
    })
  );
}
