// Файл проверяет prerender-процесс, итоговый HTML и SEO-данные сгенерированных страниц.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildJsonLdScripts,
  buildHomePrerenderData,
  buildCatalogPrerenderData,
  buildMetaTags,
  buildCompactProductBodyShell,
  buildPrerenderDataScript,
  buildRouteCssLinks,
  buildProductBodyShell,
  extractProductsPayload,
  injectIntoTemplate,
  injectIntoThinTemplate,
  loadProducts,
  loadServerRenderer,
  loadTemplate,
  minifyPrerenderHtml,
  normalizePrerenderHtml,
  parseProductPrerenderInclude,
  parseProductPrerenderLimit,
  prerender,
  prerenderProducts,
  selectBuildPrerenderProducts,
  validatePrerenderProducts,
} from './prerender.js';
import { SITE_URL } from '../src/lib/siteConfig.js';

const template = `<!doctype html>
<html lang="ru">
  <head>
    <title>Old title</title>
    <meta name="description" content="old description">
    <meta property="og:title" content="old og">
    <meta name="twitter:title" content="old twitter">
    <link rel="canonical" href="https://old.example/">
    <script type="application/ld+json" id="old-ld">{"old":true}</script>
    <script type="module" src="/assets/index.js"></script>
  </head>
  <body>
    <div id="root"><main>Old app shell</main></div>
  </body>
</html>`;

const product = {
  id: 101,
  slug: 'vvgng-ls-3h2-5',
  title: 'ВВГнг(A)-LS 3х2,5',
  fullName: 'Кабель ВВГнг(A)-LS 3х2,5',
  name: 'ВВГнг(A)-LS',
  mark: 'ВВГнг(A)-LS',
  sku: 'SKU-101',
  crossSection: '2,5',
  cores: 3,
  groundCores: 1,
  voltage: 0.66,
  price: 125.5,
  stock: 42,
  catalogSection: 'Силовой кабель',
  catalogSectionSlug: 'silovoy-kabel',
  catalogCategory: 'Кабель силовой',
  catalogCategorySlug: 'kabel-silovoy',
  manufacturer: 'Завод & Ко',
  image: '/images/vvg.png',
};

const manifest = {
  'index.html': {
    file: 'assets/index.js',
    src: 'index.html',
    isEntry: true,
    css: ['assets/index.css'],
  },
  'src/pages/CatalogPage.jsx': {
    file: 'assets/CatalogPage.js',
    src: 'src/pages/CatalogPage.jsx',
    css: ['assets/catalog.css'],
    imports: ['index.html', '_ProductCard.js'],
  },
  'src/pages/ProductPage.jsx': {
    file: 'assets/ProductPage.js',
    src: 'src/pages/ProductPage.jsx',
    css: ['assets/product-detail.css'],
    imports: ['_ProductCard.js'],
  },
  'src/pages/AboutPage.jsx': {
    file: 'assets/AboutPage.js',
    src: 'src/pages/AboutPage.jsx',
    css: ['assets/static-page.css'],
  },
  '_ProductCard.js': {
    file: 'assets/ProductCard.js',
    css: ['assets/product-card.css'],
  },
};

const tempDirs = [];

function createRenderAppMock() {
  return vi.fn((url, { prerenderData = {} } = {}) =>
    [
      '<main data-ssr="true" data-url="',
      url,
      '">',
      prerenderData.product?.title || 'SSR shell',
      '</main>',
    ].join('')
  );
}

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-prerender-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
  vi.restoreAllMocks();
});

describe('prerender HTML helpers', () => {
  it('перезаписывает SEO-теги и root-shell без дублирования старого head', () => {
    const html = injectIntoTemplate(template, {
      headExtras: [
        '<title>New title</title>',
        '<meta name="description" content="new description">',
        '<script type="application/ld+json" id="new-ld">{"new":true}</script>',
      ].join('\n'),
      bodyShell: '<section><h1>SEO shell</h1></section>',
    });

    expect(html).toContain('<title>New title</title>');
    expect(html).toContain('new description');
    expect(html).toContain(
      '<div id="root"><section><h1>SEO shell</h1></section></div>'
    );
    expect(html).toContain(
      '<script type="module" src="/assets/index.js"></script>'
    );
    expect(html.indexOf('<title>New title</title>')).toBeLessThan(
      html.indexOf('<script type="module" src="/assets/index.js"></script>')
    );
    expect(html.match(/<head>[\s\S]*?<\/head>/)[0]).not.toMatch(/\n\s*\n/);
    expect(html).not.toContain('Old title');
    expect(html).not.toContain('old description');
    expect(html).not.toContain('old og');
    expect(html).not.toContain('old twitter');
    expect(html).not.toContain('https://old.example/');
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
  });

  it('добавляет данные prerender до клиентской гидратации', () => {
    const html = injectIntoTemplate(template, {
      headExtras: '<title>New title</title>',
      bodyShell: '<main data-ssr="true">SSR shell</main>',
      bodyEndExtras: buildPrerenderDataScript({
        product: { slug: 'bad-script', title: '</script><script>alert(1)' },
      }),
    });

    expect(html).toContain(
      '<script type="application/json" id="yuzhural-prerender-data">'
    );
    expect(html).toContain('\\u003c/script>');
    expect(html).not.toContain('</script><script>alert(1)');
  });

  it('строит компактный product HTML без fallback-комментариев и старых SEO-тегов', () => {
    const html = injectIntoThinTemplate(template, {
      headExtras: [
        '<title>Product title</title>',
        '<meta name="description" content="product description">',
      ].join('\n'),
      bodyShell: '<section><h1>SEO shell</h1></section>',
    });

    expect(html).toContain('<!DOCTYPE html><html lang="ru"><head>');
    expect(html).toContain('<title>Product title</title>');
    expect(html).toContain(
      '<meta name="description" content="product description">'
    );
    expect(html).toContain(
      '<script type="module" src="/assets/index.js"></script>'
    );
    expect(html.indexOf('<title>Product title</title>')).toBeLessThan(
      html.indexOf('<script type="module" src="/assets/index.js"></script>')
    );
    expect(html).toContain(
      '<div id="root"><section><h1>SEO shell</h1></section></div>'
    );
    expect(html).not.toContain('Old title');
    expect(html).not.toContain('old description');
    expect(html).not.toContain('old og');
    expect(html).not.toContain('old twitter');
    expect(html).not.toContain('<!--');
  });

  it('минифицирует безопасные промежутки между тегами', () => {
    expect(minifyPrerenderHtml('<div>\n  <span>Текст</span>\n</div>')).toBe(
      '<div><span>Текст</span></div>'
    );
  });

  it('нормализует React SSR-атрибуты в валидный HTML', () => {
    const html = normalizePrerenderHtml(
      '<!doctype html><form noValidate=""><input autoComplete="off" inputMode="numeric" maxLength="10"/><iframe referrerPolicy="no-referrer"></iframe></form>'
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<form novalidate>');
    expect(html).toContain('autocomplete="off"');
    expect(html).toContain('inputmode="numeric"');
    expect(html).toContain('maxlength="10"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).not.toContain('autoComplete');
    expect(html).not.toContain('maxLength');
    expect(html).not.toContain('noValidate');
  });

  it('экранирует HTML-спецсимволы в meta-тегах', () => {
    const html = buildMetaTags({
      title: 'Кабель "A&B" <test>',
      description: '5 > 3 & 2 < 4',
      canonical: 'https://example.test/product/a?x=1&y=2',
      ogType: 'product',
    });

    expect(html).toContain(
      '<title>Кабель &quot;A&amp;B&quot; &lt;test&gt;</title>'
    );
    expect(html).toContain('content="5 &gt; 3 &amp; 2 &lt; 4"');
    expect(html).toContain('href="https://example.test/product/a?x=1&amp;y=2"');
    expect(html).toContain('property="og:type" content="product"');
  });

  it('ограничивает meta/OG/Twitter description до 160 символов', () => {
    const html = buildMetaTags({
      title: 'Длинное описание',
      description: 'Оптовая поставка кабеля со склада в Челябинске. '.repeat(8),
      canonical: 'https://example.test/product/long-description',
    });
    const descriptions = [
      ...html.matchAll(
        /<(?:meta name="description"|meta property="og:description"|meta name="twitter:description") content="([^"]*)">/g
      ),
    ].map((match) => match[1]);

    expect(descriptions).toHaveLength(3);
    expect(descriptions.every((description) => description.length <= 160)).toBe(
      true
    );
    expect(new Set(descriptions).size).toBe(1);
  });

  it('умеет собирать noindex-страницу без canonical', () => {
    const html = buildMetaTags({
      title: 'Страница не найдена — Example',
      description: 'Такой страницы нет',
      noindex: true,
    });

    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
  });

  it('заменяет SVG social image на общий PNG-фолбэк', () => {
    const html = buildMetaTags({
      title: 'Товар с плейсхолдером',
      description: 'Описание товара',
      canonical: 'https://example.test/product/placeholder',
      ogType: 'product',
      ogImage: '/product-placeholder.svg',
    });

    expect(html).toContain(
      `<meta property="og:image" content="${SITE_URL}/og-product.png">`
    );
    expect(html).toContain(
      `<meta name="twitter:image" content="${SITE_URL}/og-product.png">`
    );
    expect(html).not.toContain('product-placeholder.svg');
  });

  it('строит stylesheet links для CSS чанков текущего route', () => {
    const catalogLinks = buildRouteCssLinks('/catalog', manifest);
    const productLinks = buildRouteCssLinks(
      '/product/vvgng-ls-3h2-5',
      manifest
    );
    const homeLinks = buildRouteCssLinks('/', manifest);

    expect(catalogLinks).toContain('href="/assets/catalog.css"');
    expect(catalogLinks).toContain('href="/assets/product-card.css"');
    expect(catalogLinks).not.toContain('href="/assets/index.css"');
    expect(productLinks).toContain('href="/assets/product-detail.css"');
    expect(productLinks).toContain('data-prerender="route-css"');
    expect(homeLinks).toBe('');
  });

  it('экранирует закрывающие теги внутри JSON-LD', () => {
    const html = buildJsonLdScripts(
      [
        { '@type': 'Product', name: '</script><script>alert(1)</script>' },
        null,
      ],
      'ld'
    );

    expect(html).toContain('id="ld-0"');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('\\u003cscript>');
    expect(html).not.toContain('id="ld-1"');
    expect(html).not.toContain('</script><script>');
  });

  it('строит видимый product-shell с хлебными крошками и характеристиками', () => {
    const html = buildProductBodyShell({
      ...product,
      title: 'ВВГ <опасный тег>',
      catalogCategory: 'Кабель & провод',
    });

    expect(html).toContain('<h1>ВВГ &lt;опасный тег&gt;</h1>');
    expect(html).toContain('aria-label="Хлебные крошки"');
    expect(html).toContain('Кабель &amp; провод');
    expect(html).toContain('<dt>Количество жил</dt><dd>3</dd>');
    expect(html).toContain('<dt>Напряжение</dt><dd>0,66 кВ</dd>');
    expect(html).toContain('<dt>Производитель</dt><dd>Завод &amp; Ко</dd>');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('<опасный тег>');
  });

  it.each(['4х24 AWG', '1,8х4,0/1,92', '7х(2х1,5)', '3х2,5+'])(
    'keeps full configuration %s and attributes in prerendered cards',
    (configuration) => {
      const input = {
        ...product,
        conductorConfiguration: configuration,
        groupCores: 2,
        groundSection: 1.5,
        attributes: ['Э', 'нг(А)-LS'],
      };
      const item = buildCatalogPrerenderData([input]).items[0];
      expect(item).toMatchObject({
        conductorConfiguration: configuration,
        groupCores: 2,
        groundCores: 1,
        groundSection: 1.5,
        attributes: ['Э', 'нг(А)-LS'],
      });
      expect(item.shortDescription).toBe(
        `${input.mark} · ${configuration} · Э, нг(А)-LS`
      );
      const html = buildProductBodyShell(input);
      expect(html).toContain(
        `<dt>Конфигурация жил</dt><dd>${configuration}</dd>`
      );
      expect(html).toContain('<dt>Особенности</dt><dd>Э, нг(А)-LS</dd>');
      expect(html).not.toContain('<dt>Количество жил</dt>');
      expect(html).not.toContain(`${configuration} мм`);
    }
  );

  it('includes legacy additional conductor sections in prerendered descriptions', () => {
    const input = { ...product, crossSection: 2.5, groundSection: 1.5 };
    const item = buildCatalogPrerenderData([input]).items[0];
    expect(item.shortDescription).toContain('3х2,5+1х1,5 мм2');
    expect(buildProductBodyShell(input)).toContain(
      '<dt>Доп. жила</dt><dd>1х1,5 мм2</dd>'
    );
  });

  it('строит компактный product-shell без дублирования JSON-LD данных', () => {
    const html = buildCompactProductBodyShell(product);

    expect(html).toContain('<h1>ВВГнг(A)-LS 3х2,5</h1>');
    expect(html).toContain('<p>');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('<dl');
  });

  it('выбирает build-time product prerender по лимиту и явным SKU/slug', () => {
    const products = [
      { ...product, slug: 'first-product', sku: 'SKU-1' },
      { ...product, slug: 'second-product', sku: 'SKU-2' },
      { ...product, slug: 'third-product', sku: 'SKU-3' },
    ];

    expect(parseProductPrerenderLimit('all')).toBeNull();
    expect(parseProductPrerenderLimit('0')).toBe(0);
    expect(
      parseProductPrerenderInclude(' SKU-3, /product/second-product ')
    ).toEqual(['sku-3', 'second-product']);

    const selection = selectBuildPrerenderProducts(products, {
      limit: 1,
      include: ['SKU-3', 'missing-sku'],
    });

    expect(selection.products.map((item) => item.slug)).toEqual([
      'third-product',
      'first-product',
    ]);
    expect(selection.missing).toEqual(['missing-sku']);
  });

  it('готовит featured-товары для SSR главной без loading-заглушки', () => {
    const featured = buildHomePrerenderData([
      { ...product, id: 1, slug: 'regular', stock: 500, promoted: false },
      { ...product, id: 2, slug: 'promoted', stock: 10, promoted: true },
      { ...product, id: 3, slug: 'stock-leader', stock: 1000 },
    ]);

    expect(featured.featuredProducts.map((item) => item.slug)).toEqual([
      'promoted',
      'stock-leader',
      'regular',
    ]);
    expect(featured.featuredProducts[0]).toMatchObject({
      id: 2,
      title: 'ВВГнг(A)-LS 3х2,5',
      image: '/images/vvg.png',
    });
  });
});

describe('prerender IO flow', () => {
  it('читает template, пишет статические страницы и карточки товаров', async () => {
    const distDir = await makeTempDir();
    const productsFile = path.join(distDir, 'products.json');
    const log = vi.fn();
    const renderApp = createRenderAppMock();

    await writeFile(path.join(distDir, 'index.html'), template, 'utf8');
    await mkdir(path.join(distDir, '.vite'), { recursive: true });
    await writeFile(
      path.join(distDir, '.vite', 'manifest.json'),
      JSON.stringify(manifest),
      'utf8'
    );
    await writeFile(productsFile, JSON.stringify({ items: [product] }), 'utf8');

    await prerender({
      outputDir: distDir,
      productsPath: productsFile,
      log,
      warn: vi.fn(),
      renderApp,
    });

    const homeHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
    const catalogHtml = await readFile(
      path.join(distDir, 'catalog', 'index.html'),
      'utf8'
    );
    const aboutHtml = await readFile(
      path.join(distDir, 'about', 'index.html'),
      'utf8'
    );
    const paymentHtml = await readFile(
      path.join(distDir, 'payment', 'index.html'),
      'utf8'
    );
    const deliveryHtml = await readFile(
      path.join(distDir, 'delivery', 'index.html'),
      'utf8'
    );
    const categoryHtml = await readFile(
      path.join(distDir, 'catalog', 'kabel-i-provod', 'index.html'),
      'utf8'
    );
    const notFoundHtml = await readFile(path.join(distDir, '404.html'), 'utf8');
    const productHtml = await readFile(
      path.join(distDir, 'product', `${product.slug}.html`),
      'utf8'
    );

    expect(homeHtml).toContain('<main data-ssr="true" data-url="/">');
    expect(homeHtml).toContain('data-prerender="home-hero"');
    expect(homeHtml).not.toContain('display:none');
    expect(catalogHtml).toContain('<main data-ssr="true" data-url="/catalog">');
    expect(catalogHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/catalog/">`
    );
    expect(catalogHtml).toContain('href="/assets/catalog.css"');
    expect(catalogHtml).toContain('href="/assets/product-card.css"');
    expect(catalogHtml).not.toContain('/hero-bg-1536.avif');
    expect(aboutHtml).toContain('id="about-page-json-ld"');
    expect(aboutHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/about/">`
    );
    expect(aboutHtml).toContain('href="/assets/static-page.css"');
    expect(paymentHtml).toContain('"@type":"FAQPage"');
    expect(paymentHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/payment/">`
    );
    expect(deliveryHtml).toContain('id="delivery-page-json-ld"');
    expect(deliveryHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/delivery/">`
    );
    expect(categoryHtml).toContain(
      '<main data-ssr="true" data-url="/catalog/kabel-i-provod">'
    );
    expect(notFoundHtml).toContain('<title>Страница не найдена —');
    expect(notFoundHtml).toContain(
      '<meta name="robots" content="noindex,follow">'
    );
    expect(productHtml).toContain(
      `<link rel="canonical" href="${SITE_URL}/product/${product.slug}">`
    );
    expect(productHtml).toContain('href="/assets/product-detail.css"');
    expect(productHtml).toContain('href="/assets/product-card.css"');
    expect(productHtml).not.toContain('/hero-bg-1536.avif');
    expect(productHtml).toContain(
      '<meta property="og:type" content="product">'
    );
    expect(productHtml).toContain('"@type":"Product"');
    expect(productHtml).toContain('"price":"125.50"');
    expect(productHtml).toContain('ВВГнг(A)-LS 3х2,5');
    expect(productHtml).toContain('id="yuzhural-prerender-data"');
    expect(renderApp).toHaveBeenCalledWith('/product/vvgng-ls-3h2-5', {
      prerenderData: {
        product: expect.objectContaining({
          ...product,
          specs: expect.objectContaining({ Напряжение: '0,66 кВ' }),
          shortDescription: expect.any(String),
        }),
      },
    });
    expect(renderApp).toHaveBeenCalledWith('/catalog/kabel-i-provod', {
      prerenderData: {
        catalog: expect.objectContaining({
          path: '/catalog/kabel-i-provod',
        }),
      },
    });
    expect(productHtml).not.toContain('display:none');
    expect(productHtml).not.toContain('<nav');
    expect(productHtml).not.toContain('<dl');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[prerender] products: 1/1 pages')
    );
    expect(productHtml).not.toContain('OpenGraph / Twitter');
    expect(log).toHaveBeenCalledWith('[prerender] done.');
  });

  it('provides full specs and traceability in product hydration data without visible warnings', async () => {
    const outputDir = await makeTempDir();
    const input = {
      ...product,
      fullName: 'Кабель 4х24 AWG нг(А)-LS',
      conductorConfiguration: '4х24 AWG',
      attributes: ['нг(А)-LS'],
      sourceName: 'Original source cable',
      parsingWarnings: ['incomplete-specification'],
    };
    const renderApp = createRenderAppMock();
    await prerenderProducts(template, [input], {
      outputDir,
      renderApp,
      log: vi.fn(),
    });
    const rendered = renderApp.mock.calls[0][1].prerenderData.product;
    expect(rendered).toMatchObject({
      fullName: input.fullName,
      sourceName: input.sourceName,
      parsingWarnings: input.parsingWarnings,
      specs: {
        'Конфигурация жил': '4х24 AWG',
        Особенности: 'нг(А)-LS',
        Напряжение: '0,66 кВ',
      },
    });
    const html = await readFile(
      path.join(outputDir, 'product', `${input.slug}.html`),
      'utf8'
    );
    const payload = JSON.parse(
      html.match(
        /<script type="application\/json" id="yuzhural-prerender-data">([^]*?)<\/script>/
      )[1]
    );
    expect(payload.product).toEqual(rendered);
    expect(buildProductBodyShell(rendered)).not.toContain(
      'incomplete-specification'
    );
    expect(buildCompactProductBodyShell(rendered)).not.toContain(
      'incomplete-specification'
    );
  });

  it('добавляет артикул в product title только для дублей', async () => {
    const distDir = await makeTempDir();
    const duplicateA = {
      ...product,
      slug: 'duplicate-a',
      sku: 'SKU-A',
      title: 'АВВГ 3х6+1х4',
    };
    const duplicateB = {
      ...product,
      slug: 'duplicate-b',
      sku: 'SKU-B',
      title: 'АВВГ 3х6+1х4',
    };
    const unique = {
      ...product,
      slug: 'unique-product',
      sku: 'SKU-C',
      title: 'ВВГнг(A)-LS 3х2,5',
    };

    await prerenderProducts(template, [duplicateA, duplicateB, unique], {
      outputDir: distDir,
      log: vi.fn(),
      validate: false,
    });

    const duplicateHtml = await readFile(
      path.join(distDir, 'product', `${duplicateA.slug}.html`),
      'utf8'
    );
    const uniqueHtml = await readFile(
      path.join(distDir, 'product', `${unique.slug}.html`),
      'utf8'
    );

    expect(duplicateHtml).toContain('<title>АВВГ 3х6+1х4, арт. SKU-A —');
    expect(uniqueHtml).toContain('<title>ВВГнг(A)-LS 3х2,5 —');
    expect(uniqueHtml).not.toContain('арт. SKU-C');
  });

  it('ограничивает build-time product prerender, но считает дубли по полному каталогу', async () => {
    const distDir = await makeTempDir();
    const productsFile = path.join(distDir, 'products.json');
    const duplicateA = {
      ...product,
      slug: 'duplicate-a',
      sku: 'SKU-A',
      title: 'АВВГ 3х6+1х4',
    };
    const duplicateB = {
      ...product,
      slug: 'duplicate-b',
      sku: 'SKU-B',
      title: 'АВВГ 3х6+1х4',
    };
    const third = {
      ...product,
      slug: 'third-product',
      sku: 'SKU-C',
      title: 'ВВГнг(A)-LS 3х2,5',
    };
    const log = vi.fn();

    await writeFile(path.join(distDir, 'index.html'), template, 'utf8');
    await writeFile(
      productsFile,
      JSON.stringify({ items: [duplicateA, duplicateB, third] }),
      'utf8'
    );

    await prerender({
      outputDir: distDir,
      productsPath: productsFile,
      log,
      warn: vi.fn(),
      renderApp: createRenderAppMock(),
      productPrerenderLimit: 1,
      productPrerenderInclude: ['SKU-C'],
    });

    const explicitHtml = await readFile(
      path.join(distDir, 'product', `${third.slug}.html`),
      'utf8'
    );
    const limitedHtml = await readFile(
      path.join(distDir, 'product', `${duplicateA.slug}.html`),
      'utf8'
    );

    expect(explicitHtml).toContain('<title>ВВГнг(A)-LS 3х2,5 —');
    expect(limitedHtml).toContain('<title>АВВГ 3х6+1х4, арт. SKU-A —');
    await expect(
      readFile(path.join(distDir, 'product', `${duplicateB.slug}.html`), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[prerender] build product cap: 2/3 pages')
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[prerender] products: 2/3 pages')
    );
  });

  it('валидирует товары до записи статических и товарных страниц', async () => {
    const distDir = await makeTempDir();
    const productsFile = path.join(distDir, 'products.json');

    await writeFile(path.join(distDir, 'index.html'), template, 'utf8');
    await writeFile(
      productsFile,
      JSON.stringify({
        items: [
          {
            slug: '../bad',
            fullName: '',
            id: 'not-id',
            price: 'много',
            image: { src: '/bad.png' },
          },
        ],
      }),
      'utf8'
    );

    await expect(
      prerender({
        outputDir: distDir,
        productsPath: productsFile,
        log: vi.fn(),
        warn: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: 'PrerenderProductValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'items[0].slug' }),
        expect.objectContaining({ path: 'items[0].title/fullName/name' }),
        expect.objectContaining({ path: 'items[0].sku' }),
        expect.objectContaining({ path: 'items[0].id' }),
        expect.objectContaining({ path: 'items[0].price' }),
        expect.objectContaining({ path: 'items[0].image' }),
      ]),
    });

    await expect(
      readFile(path.join(distDir, 'catalog', 'index.html'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(path.join(distDir, 'product', '..', 'bad', 'index.html'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('падает понятной ошибкой, если vite-шаблон без root', async () => {
    const distDir = await makeTempDir();
    await writeFile(path.join(distDir, 'index.html'), '<html></html>', 'utf8');

    await expect(loadTemplate({ outputDir: distDir })).rejects.toThrow(
      'dist/index.html не содержит <div id="root">'
    );
  });

  it('падает понятной ошибкой, если SSR bundle не собран', async () => {
    const distDir = await makeTempDir();

    await expect(loadServerRenderer({ outputDir: distDir })).rejects.toThrow(
      'SSR bundle не найден'
    );
  });

  it('возвращает пустой список товаров и предупреждение при отсутствии products.json', async () => {
    const warn = vi.fn();

    await expect(
      loadProducts({
        filePath: path.join(await makeTempDir(), 'missing-products.json'),
        warn,
      })
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('data/products.json не найден')
    );
  });

  it('не принимает products.json с неверной root-структурой', async () => {
    expect(() => extractProductsPayload({ items: null })).toThrow(
      'ожидался массив товаров или объект с массивом items'
    );
  });
});

describe('validatePrerenderProducts', () => {
  it('принимает минимально пригодный для prerender товар', () => {
    expect(() =>
      validatePrerenderProducts([
        {
          slug: 'minimal-product-1',
          fullName: 'Минимальный товар',
          id: 1,
          image: '/product-placeholder.svg',
        },
      ])
    ).not.toThrow();
  });

  it('сообщает пути к повреждённым полям', () => {
    let error;
    try {
      validatePrerenderProducts([
        null,
        {
          slug: 'bad/product',
          title: 123,
          fullName: '',
          name: '',
          sku: '',
          id: 0,
          catalogCategorySlug: 'силовой-кабель',
          stock: -1,
          voltage: 'нет',
        },
      ]);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({
      name: 'PrerenderProductValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'items[1].voltage' }),
      ]),
    });
    expect(error.message).toMatchInlineSnapshot(`
      "[prerender] products.json не прошёл проверку схемы товара: 9 ошибок.
      - items[0]: ожидался объект товара
      - items[1].slug: обязательный URL-сегмент: латиница, цифры и дефисы без /, пробелов и query
      - items[1].title/fullName/name: нужно хотя бы одно непустое название товара
      - items[1].sku: нужен непустой sku или положительный числовой id для JSON-LD
      - items[1].id: должен быть положительным целым числом
      - items[1].title: должно быть строкой или null
      - items[1].catalogCategorySlug: должен быть URL-сегментом: латиница, цифры и дефисы
      - items[1].stock: должно быть числом >= 0
      - items[1].voltage: должно быть числом > 0"
    `);
  });
});
