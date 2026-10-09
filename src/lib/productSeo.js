// Файл строит SEO-метаданные, canonical и JSON-LD для страниц товара без React-зависимостей.

// SEO-логика для карточки товара. Используется и в React (ProductPage),
// и в build-time prerender (scripts/prerender.js) — поэтому никаких импортов
// из react/react-router здесь быть не должно.

import { CATALOG_CANONICAL_PATH } from './canonicalPaths.js';
import {
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from './siteConfig.js';
import { normalizeMetaDescription } from './metaDescription.js';
import { getProductImage } from '../../shared/productImages.js';

const PRODUCT_META_DESCRIPTION_MIN_LENGTH = 80;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProductName(product) {
  return (
    normalizeText(product?.title) ||
    normalizeText(product?.fullName) ||
    normalizeText(product?.name) ||
    normalizeText(product?.mark) ||
    ''
  );
}

function hasPhrase(value, phrase) {
  return value
    .toLocaleLowerCase('ru-RU')
    .includes(phrase.toLocaleLowerCase('ru-RU'));
}

function pushUnique(parts, value) {
  const normalized = normalizeText(value);
  if (!normalized) return;

  const next = normalized.replace(/[.;]+$/u, '');
  if (!next) return;

  if (parts.some((part) => hasPhrase(part, next) || hasPhrase(next, part))) {
    return;
  }

  parts.push(next);
}

function formatNumber(value, maximumFractionDigits = 3) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('ru-RU', {
    maximumFractionDigits,
  });
}

function formatPrice(product) {
  const price = Number(product?.price);
  if (!Number.isFinite(price) || price <= 0) return '';

  const unit = normalizeText(product.unit);
  return `Цена от ${formatNumber(price, 2)} ₽${unit ? `/${unit}` : ''}`;
}

function formatProductSpecs(product) {
  const specs = [];
  const conductorConfiguration = normalizeText(product?.conductorConfiguration);
  const cores = Number(product?.cores);
  const groundCores = Number(product?.groundCores);
  const groupCores = Number(product?.groupCores);
  const groundSection = formatNumber(product?.groundSection);
  const crossSection = formatNumber(product?.crossSection);
  const voltage = formatNumber(product?.voltage);

  if (conductorConfiguration) {
    specs.push(`конфигурация жил ${conductorConfiguration}`);
  } else if (cores > 0 && groupCores > 0 && crossSection) {
    const additional =
      groundCores > 0 && groundSection
        ? `+${formatNumber(groundCores)}х${groundSection}`
        : '';
    specs.push(
      `сечение ${formatNumber(cores)}х(${formatNumber(groupCores)}х${crossSection})${additional} мм²`
    );
  } else if (Number.isFinite(cores) && cores > 0) {
    const coresLabel =
      Number.isFinite(groundCores) && groundCores > 0
        ? `${formatNumber(cores)}+${formatNumber(groundCores)} жилы`
        : `${formatNumber(cores)} жилы`;
    specs.push(coresLabel);
  }

  if (
    !conductorConfiguration &&
    !(cores > 0 && groupCores > 0) &&
    crossSection
  ) {
    const section =
      cores > 0 && groundCores > 0 && groundSection
        ? `${formatNumber(cores)}х${crossSection}+${formatNumber(groundCores)}х${groundSection}`
        : crossSection;
    specs.push(`сечение ${section} мм²`);
  }

  if (voltage) {
    specs.push(`${voltage} кВ`);
  }

  if (Array.isArray(product?.attributes)) {
    const attributes = product.attributes.map(normalizeText).filter(Boolean);
    if (attributes.length > 0) specs.push(attributes.join(', '));
  }

  return specs.join(', ');
}

export function buildProductMetaTitle(product, { disambiguate = false } = {}) {
  const title = getProductName(product);
  if (!title) return '';

  const sku = normalizeText(product?.sku || product?.id);
  return disambiguate && sku ? `${title}, арт. ${sku}` : title;
}

export function buildProductJsonLd(product) {
  if (!product) return null;

  const url = absoluteUrl(`/product/${product.slug}`);
  const price = Number(product.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const stock = Number(product.stock);
  const hasStock = Number.isFinite(stock) && stock > 0;
  const brandName =
    product.catalogBrand || product.manufacturer || SITE_LEGAL_NAME;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title || product.fullName || product.name,
    sku: product.sku || String(product.id),
    url,
    description: buildProductMetaDescription(product),
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    category: product.catalogCategory || product.catalogSection || undefined,
  };

  const productImage = getProductImage(product);
  if (productImage) {
    data.image = absoluteUrl(productImage);
  }

  if (product.mark) {
    data.mpn = product.mark;
  }

  if (hasPrice) {
    data.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'RUB',
      price: price.toFixed(2),
      availability: hasStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
      },
    };
  }

  return data;
}

function getCatalogPath(slug) {
  return slug ? `/catalog/${slug}` : CATALOG_CANONICAL_PATH;
}

export function getProductBreadcrumbs(product) {
  const items = [
    { label: 'Главная', to: '/' },
    { label: 'Каталог', to: CATALOG_CANONICAL_PATH },
  ];
  const hasSection = Boolean(product.catalogSection);
  const hasCategory = Boolean(product.catalogCategory);
  const isSameCatalogLevel =
    (product.catalogSectionSlug &&
      product.catalogSectionSlug === product.catalogCategorySlug) ||
    product.catalogSection === product.catalogCategory;

  if (hasSection) {
    items.push({
      label: product.catalogSection,
      to: getCatalogPath(product.catalogSectionSlug),
    });
  }

  if (hasCategory && !isSameCatalogLevel) {
    items.push({
      label: product.catalogCategory,
      to: getCatalogPath(product.catalogCategorySlug),
    });
  }

  items.push({
    label:
      product.title ||
      product.fullName ||
      product.name ||
      product.mark ||
      'Карточка товара',
    to: `/product/${product.slug}`,
    isCurrent: true,
  });

  return items;
}

export function buildProductBreadcrumbJsonLd(product) {
  if (!product) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: getProductBreadcrumbs(product).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.to),
    })),
  };
}

export function buildProductMetaDescription(product) {
  if (!product) return '';

  const existingDescription = normalizeText(product.description);
  if (existingDescription.length >= PRODUCT_META_DESCRIPTION_MIN_LENGTH) {
    return normalizeMetaDescription(existingDescription);
  }

  const parts = [];
  pushUnique(parts, existingDescription || getProductName(product));
  pushUnique(parts, product.catalogCategory || product.catalogSection);
  pushUnique(parts, formatProductSpecs(product));
  pushUnique(parts, formatPrice(product));
  pushUnique(
    parts,
    'Купить оптом в Челябинске со склада и под заказ, подготовим КП для юрлиц'
  );

  return normalizeMetaDescription(parts.join('. '));
}
