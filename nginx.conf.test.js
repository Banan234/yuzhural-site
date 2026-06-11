// Файл проверяет nginx-конфигурацию на важные заголовки, прокси-правила и корректные fallback-сценарии.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('./nginx.conf', import.meta.url), 'utf8');

function getLocationBlock(path) {
  const match = config.match(
    new RegExp(
      `location\\s+${path.replace('/', '\\/')}\\s*\\{[\\s\\S]*?\\n    \\}`
    )
  );
  return match?.[0] || '';
}

describe('nginx security headers', () => {
  it('sets frontend CSP and HSTS at server level', () => {
    expect(config).toContain(
      'add_header Content-Security-Policy $site_csp always;'
    );
    expect(config).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("script-src 'self' https://mc.yandex.ru");
    expect(config).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(config).toContain(
      "connect-src 'self' https://mc.yandex.ru https://*.mc.yandex.ru https://*.ingest.sentry.io https://*.sentry.io"
    );
    expect(config).toContain('frame-src https://yandex.ru https://yandex.com');
    expect(config).toContain("default-src 'none'; base-uri 'none';");
    expect(config).toContain('add_header Permissions-Policy "');
    expect(config).toContain(
      'add_header Cross-Origin-Opener-Policy same-origin always;'
    );
    expect(config).toContain('absolute_redirect off;');
    expect(config).toContain('port_in_redirect off;');
    expect(config).toContain('server_tokens off;');
    expect(config).toContain('more_clear_headers Server;');
  });

  it('duplicates security headers in /assets because add_header is not inherited there', () => {
    const assetsBlock = getLocationBlock('/assets/');

    expect(assetsBlock).toContain(
      'add_header Content-Security-Policy $site_csp always;'
    );
    expect(assetsBlock).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
    expect(assetsBlock).toContain(
      'add_header X-Content-Type-Options nosniff always;'
    );
    expect(assetsBlock).toContain('add_header X-Frame-Options DENY always;');
    expect(assetsBlock).toContain(
      'add_header Referrer-Policy strict-origin-when-cross-origin always;'
    );
    expect(assetsBlock).toContain('add_header Permissions-Policy "');
    expect(assetsBlock).toContain(
      'add_header Cross-Origin-Opener-Policy same-origin always;'
    );
    expect(assetsBlock).toContain(
      'more_set_headers "Cache-Control: public, max-age=31536000, immutable";'
    );
  });
});

describe('nginx compression', () => {
  it('enables brotli with gzip fallback for text assets', () => {
    expect(config).toContain('brotli on;');
    expect(config).toContain('brotli_static on;');
    expect(config).toContain('brotli_comp_level 5;');
    expect(config).toContain('brotli_min_length 1024;');
    expect(config).toContain('brotli_types');
    expect(config).toContain('text/html');
    expect(config).toContain('application/javascript');
    expect(config).toContain('application/json');
    expect(config).toContain('image/svg+xml');
    expect(config).toContain('gzip on;');
    expect(config).toContain('gzip_vary on;');
  });
});

describe('nginx static cache rules', () => {
  it('caches stable public assets outside vite /assets', () => {
    expect(config).toContain(
      'location ~ ^/(hero-bg[^/]*\\.(?:avif|webp)|logo\\.(?:webp|png)|favicon-32\\.png|favicon\\.ico|product-placeholder\\.svg|category-placeholders/[A-Za-z0-9-]+\\.svg|fonts/[A-Za-z0-9._-]+)$'
    );
    expect(config).toContain(
      'more_set_headers "Cache-Control: public, max-age=31536000, immutable";'
    );
  });
});

describe('nginx product prerender routing', () => {
  it('serves flat product prerender files for pretty product URLs', () => {
    expect(config).toContain('location ~ ^/product/([A-Za-z0-9-]+)$');
    expect(config).toContain(
      'try_files /runtime-data/public/product/$1.html /html/product/$1.html =404;'
    );
  });

  it('redirects trailing slash product URLs to the slashless canonical path', () => {
    expect(config).toContain('location ~ ^/product/([A-Za-z0-9-]+)/+$');
    expect(config).toContain('return 308 /product/$1;');
  });
});

describe('nginx reverse proxy canonical redirects', () => {
  it('preserves the external forwarded proto for the API upstream', () => {
    expect(config).toContain('map $http_x_forwarded_proto $forwarded_proto {');
    expect(config).toContain('default $scheme;');
    expect(config).toContain('~*^https?$ $http_x_forwarded_proto;');
    expect(config).toContain(
      'proxy_set_header X-Forwarded-Proto $forwarded_proto;'
    );
  });

  it('hides upstream server identity on proxied API responses', () => {
    const apiBlock = getLocationBlock('/api/');

    expect(apiBlock).toContain(
      'add_header Content-Security-Policy $api_csp always;'
    );
    expect(apiBlock).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
    );
    expect(apiBlock).toContain(
      'add_header X-Content-Type-Options nosniff always;'
    );
    expect(apiBlock).toContain('add_header X-Frame-Options DENY always;');
    expect(apiBlock).toContain(
      'add_header Referrer-Policy strict-origin-when-cross-origin always;'
    );
    expect(apiBlock).toContain('add_header Permissions-Policy "');
    expect(apiBlock).toContain(
      'add_header Cross-Origin-Opener-Policy same-origin always;'
    );
    expect(apiBlock).toContain('proxy_hide_header Server;');
    expect(apiBlock).toContain('proxy_hide_header Content-Security-Policy;');
    expect(apiBlock).toContain('proxy_hide_header Cross-Origin-Opener-Policy;');
    expect(apiBlock).toContain('proxy_hide_header Permissions-Policy;');
    expect(apiBlock).toContain('proxy_hide_header Referrer-Policy;');
    expect(apiBlock).toContain('proxy_hide_header Strict-Transport-Security;');
    expect(apiBlock).toContain('proxy_hide_header X-Content-Type-Options;');
    expect(apiBlock).toContain('proxy_hide_header X-Frame-Options;');
    expect(apiBlock).toContain('proxy_hide_header X-Powered-By;');
  });

  it('redirects base SPA routes to trailing-slash canonicals', () => {
    expect(config).toContain(
      'location ~ ^/(catalog|contacts|delivery|payment|about)$'
    );
    expect(config).toContain('return 308 /$1/$is_args$args;');
    expect(config).toContain(
      'location ~ ^/(catalog|contacts|delivery|payment|about)/+$'
    );
    expect(config).toContain('return 308 /$1/;');
    expect(config).toContain('location ~ ^/catalog/([A-Za-z0-9-]+)/+$');
    expect(config).toContain('return 308 /catalog/$1;');
  });

  it('serves only known SPA routes and returns 404 for unknown ones', () => {
    expect(config).toContain('location = / {');
    expect(config).toContain('try_files /index.html =404;');
    expect(config).toContain('location = /catalog/ {');
    expect(config).toContain('try_files /catalog/index.html =404;');
    expect(config).toContain('location = /about/ {');
    expect(config).toContain('location = /contacts/ {');
    expect(config).toContain('location = /delivery/ {');
    expect(config).toContain('location = /payment/ {');
    expect(config).toContain('location = /cart {');
    expect(config).toContain('location = /internal/runtime {');
    expect(config).toContain('location ~ ^/catalog/([A-Za-z0-9-]+)$ {');
    expect(config).toContain('try_files /catalog/$1/index.html =404;');
    expect(config).toContain('location / {');
    expect(config).toContain('try_files $uri =404;');
    expect(config).not.toContain('try_files $uri $uri/ /index.html;');
  });

  it('serves the internal runtime SPA route without opening a wildcard fallback', () => {
    const runtimeBlock = getLocationBlock('= /internal/runtime');
    const rootFallbackBlock = getLocationBlock('/');

    expect(runtimeBlock).toContain('try_files /index.html =404;');
    expect(rootFallbackBlock).toContain('try_files $uri =404;');
    expect(rootFallbackBlock).not.toContain('/index.html');
  });
});

describe('nginx 404 handling', () => {
  it('serves a dedicated internal 404 page instead of index.html', () => {
    expect(config).toContain('error_page 404 /404.html;');
    expect(config).toContain('location = /404.html {');
    expect(config).toContain('internal;');
    expect(config).toContain('try_files /404.html =404;');
  });
});

describe('nginx runtime import artifacts', () => {
  it('serves updated price, robots and sitemaps before build-time fallbacks', () => {
    expect(config).toContain('root /usr/share/nginx/html;');
    expect(config).toContain(
      'location ~ ^/(robots\\.txt|sitemap(?:-[A-Za-z0-9-]+)?\\.xml|price\\.xls)$'
    );
    expect(config).toContain('root /usr/share/nginx;');
    expect(config).toContain(
      'try_files /runtime-data/public/$1 /html/$1 =404;'
    );
  });

  it('does not include executable nginx config from the runtime data directory', () => {
    const runtimeInclude =
      'include /usr/share/nginx/runtime-data/public/redirects.nginx.conf*;';
    const buildInclude = 'include /usr/share/nginx/html/redirects.nginx.conf*;';

    expect(config).toContain(buildInclude);
    expect(config).not.toContain(runtimeInclude);
  });
});
