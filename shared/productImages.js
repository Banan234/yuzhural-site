// Файл определяет правила выбора изображений товаров и fallback-ассетов для карточек каталога.
import generatedProductImages from './generatedProductImages.json' with { type: 'json' };
import rejectedProductImages from './rejectedProductImages.json' with { type: 'json' };

export const PRODUCT_IMAGE_FALLBACKS = {
  powerCable: '/category-placeholders/power-cable.svg',
  controlCable: '/category-placeholders/control-cable.svg',
  flexibleCable: '/category-placeholders/flexible-cable.svg',
  communicationCable: '/category-placeholders/communication-cable.svg',
  wire: '/category-placeholders/wire.svg',
  nonCable: '/category-placeholders/non-cable.svg',
};

const GENERIC_PRODUCT_IMAGES = new Set(['', '/product-placeholder.svg']);

const IMAGE_BY_SLUG = {
  'kabeli-peredachi-dannykh': PRODUCT_IMAGE_FALLBACKS.communicationCable,
  'silovoy-kabel': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'importnye-kabeli': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kabeli-shakhtnye': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kabeli-neftepogr': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kabeli-nagrevatelnye': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kabeli-sudovye': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kabel-vodopogr': PRODUCT_IMAGE_FALLBACKS.powerCable,
  'kontrolnyy-kabel': PRODUCT_IMAGE_FALLBACKS.controlCable,
  'montazhnyy-kabel': PRODUCT_IMAGE_FALLBACKS.controlCable,
  'kabeli-termoparny': PRODUCT_IMAGE_FALLBACKS.controlCable,
  'gibkiy-kabel': PRODUCT_IMAGE_FALLBACKS.flexibleCable,
  'kabeli-podvizhnogo-sostava': PRODUCT_IMAGE_FALLBACKS.flexibleCable,
  'bortovye-provoda': PRODUCT_IMAGE_FALLBACKS.flexibleCable,
  'kabeli-svyazi': PRODUCT_IMAGE_FALLBACKS.communicationCable,
  'signalno-blokirovochnye': PRODUCT_IMAGE_FALLBACKS.communicationCable,
  'kabeli-pozharnoy-signalizacii': PRODUCT_IMAGE_FALLBACKS.communicationCable,
  'lan-kabeli': PRODUCT_IMAGE_FALLBACKS.communicationCable,
  provoda: PRODUCT_IMAGE_FALLBACKS.wire,
  sip: PRODUCT_IMAGE_FALLBACKS.wire,
  'nekabelnaya-produkciya': PRODUCT_IMAGE_FALLBACKS.nonCable,
};

const IMAGE_BY_NAME = [
  {
    test: /некабельн|муфт|сальник|щит|лоток|гофр|труб|крепеж|кабель-канал/i,
    image: PRODUCT_IMAGE_FALLBACKS.nonCable,
    label: 'некабельная продукция',
  },
  {
    test: /провод|провода|сип|шввп|пвс|пугв|пув|пв-?3|апв/i,
    image: PRODUCT_IMAGE_FALLBACKS.wire,
    label: 'провода',
  },
  {
    test: /связ|lan|utp|ftp|тпп|ксп|квк|сигнал|пожар|охран|оптик/i,
    image: PRODUCT_IMAGE_FALLBACKS.communicationCable,
    label: 'кабели связи',
  },
  {
    test: /гибк|подвиж|бортов|кг\b|рпш|нршм|olflex/i,
    image: PRODUCT_IMAGE_FALLBACKS.flexibleCable,
    label: 'гибкий кабель',
  },
  {
    test: /контроль|монтаж|кввг|мкэш|мкш|куин|термопар/i,
    image: PRODUCT_IMAGE_FALLBACKS.controlCable,
    label: 'контрольный кабель',
  },
  {
    test: /силов|ввг|аввг|вбшв|пвп|апвп|кабель/i,
    image: PRODUCT_IMAGE_FALLBACKS.powerCable,
    label: 'силовой кабель',
  },
];

function clean(value) {
  return String(value || '').trim();
}

function isGenericProductImage(src) {
  return (
    GENERIC_PRODUCT_IMAGES.has(clean(src)) ||
    Object.values(PRODUCT_IMAGE_FALLBACKS).includes(clean(src))
  );
}

const imageBindingName = (value) =>
  clean(value)
    .toUpperCase()
    .replace(/[XХ×]/gu, 'Х')
    .replace(/,/gu, '.')
    .replace(/\s+/gu, '');

export function getGeneratedProductImage(
  product,
  manifest = generatedProductImages
) {
  const entry = manifest.bySku?.[clean(product?.sku)];
  if (rejectedProductImages.byVisualKey?.[entry?.visualKey]) return '';
  if (entry?.status !== 'approved' || entry.kind !== 'generated-illustration')
    return '';
  if (
    entry.productId != null &&
    product.id != null &&
    String(entry.productId) !== String(product.id)
  )
    return '';
  if (
    entry.primaryCores != null &&
    product.cores != null &&
    Number(entry.primaryCores) !== Number(product.cores)
  )
    return '';
  if (
    entry.section != null &&
    product.crossSection != null &&
    Number(entry.section) !== Number(product.crossSection)
  )
    return '';
  const names = [
    product.sourceName,
    product.name,
    product.fullName,
    product.title,
  ]
    .filter(Boolean)
    .map(imageBindingName);
  if (
    ![entry.sourceName, entry.productName]
      .filter(Boolean)
      .some((name) => names.includes(imageBindingName(name)))
  )
    return '';
  return typeof entry.image === 'string' &&
    /^\/[A-Za-z0-9/_-]+\.png$/u.test(entry.image)
    ? entry.image
    : '';
}

function lookupBySlug(product) {
  for (const key of [
    'catalogSubcategorySlug',
    'catalogCategorySlug',
    'catalogSectionSlug',
  ]) {
    const image = IMAGE_BY_SLUG[clean(product?.[key])];
    if (image) return image;
  }
  return '';
}

function getCategoryText(product) {
  return [
    product?.catalogCategory,
    product?.catalogSection,
    product?.category,
    product?.catalogType,
    product?.title,
    product?.fullName,
    product?.name,
    product?.mark,
  ]
    .map(clean)
    .filter(Boolean)
    .join(' ');
}

function lookupByName(product) {
  const text = getCategoryText(product);
  const match = IMAGE_BY_NAME.find((item) => item.test.test(text));
  return match?.image || '';
}

export function getProductImage(product, manifest = generatedProductImages) {
  const image = clean(product?.image);
  if (!isGenericProductImage(image)) return image;

  return (
    getGeneratedProductImage(product, manifest) ||
    lookupBySlug(product) ||
    lookupByName(product) ||
    PRODUCT_IMAGE_FALLBACKS.nonCable
  );
}

export function getProductImageAlt(product) {
  const title = clean(
    product?.title || product?.fullName || product?.name || product?.mark
  );
  const category =
    clean(
      product?.catalogCategory || product?.category || product?.catalogSection
    ) || 'категория товара';

  if (title) {
    const image = getGeneratedProductImage(product);
    const illustrated = image && getProductImage(product) === image;
    return illustrated
      ? `${title} — иллюстрация конструкции кабеля`
      : `${title} — ${category}`;
  }
  return `Изображение товара: ${category}`;
}
