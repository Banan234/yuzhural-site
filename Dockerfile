# syntax=docker/dockerfile:1.7
# Файл собирает production-образы API и nginx-статики, включая build, prerender и runtime-слои.

# ---------- 1. Зависимости (всё, включая dev) ----------
# Отдельный слой ускоряет повторные сборки: при правке кода без изменения
# package*.json npm ci не перезапускается.
ARG NODE_VERSION=24.22.1
FROM node:${NODE_VERSION}-slim AS deps
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# ---------- 2. Сборка фронта (vite → dist/) + prerender SEO ----------
# build:prod = vite build && scripts/prerender.js. Prerender пишет статику
# главной/каталога/контактов и ограниченный набор product HTML для важных SKU.
# Полный согласованный fallback (HTML/sitemap/price) генерируется в data/public.
# Runtime-импорт заменяет его приоритетным целостным выпуском из volume.
FROM node:${NODE_VERSION}-slim AS build
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
ARG SITE_URL=https://yu-uek.ru
ARG VITE_SITE_URL=https://yu-uek.ru
ARG VITE_YANDEX_METRIKA_ID=
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0
ARG PRODUCT_PRERENDER_LIMIT=720
ARG PRODUCT_PRERENDER_INCLUDE=
ENV SITE_URL=$SITE_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_YANDEX_METRIKA_ID=$VITE_YANDEX_METRIKA_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE \
    PRODUCT_PRERENDER_LIMIT=$PRODUCT_PRERENDER_LIMIT \
    PRODUCT_PRERENDER_INCLUDE=$PRODUCT_PRERENDER_INCLUDE
COPY --chown=node:node --from=deps /home/node/app/node_modules ./node_modules
COPY --chown=node:node . .
RUN npm run build:prod

# ---------- 3. Production-зависимости (без vitest/eslint/prettier) ----------
FROM node:${NODE_VERSION}-slim AS prod-deps
USER node
WORKDIR /home/node
RUN mkdir -p app
WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 4. Runtime для Express API ----------
# Финальный образ — slim + только то, что нужно node server.js в проде.
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

# curl нужен для HEALTHCHECK; ставим минимально и чистим apt-кэш.
# Disable retry-based package download reuse until the APT security update is installed.
RUN apt-get -o Acquire::Retries=0 update \
    && apt-get -o Acquire::Retries=0 install -y --no-install-recommends --only-upgrade apt libapt-pkg6.0 \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=prod-deps /home/node/app/node_modules ./node_modules
COPY server.js cable-image-style.json ./
COPY --from=build /home/node/app/dist/index.html ./dist/index.html
COPY --from=build /home/node/app/dist/.vite ./dist/.vite
COPY --from=build /home/node/app/dist/server ./dist/server
COPY --from=build /home/node/app/data/public ./data/public
COPY lib ./lib
COPY src/lib ./src/lib
COPY shared ./shared
COPY data ./data
COPY scripts ./scripts

# Не root. Базовый образ node предоставляет пользователя `node` (uid 1000).
RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "server.js"]

# ---------- 5. Brotli и headers-more модули под точную версию nginx ----------
FROM nginx:1.30.6-alpine AS brotli-builder
RUN apk add --no-cache --virtual .brotli-build-deps \
    build-base \
    cmake \
    curl \
    git \
    linux-headers \
    openssl-dev \
    pcre2-dev \
    zlib-dev
WORKDIR /tmp
RUN set -eux; \
    NGINX_VERSION="$(nginx -v 2>&1 | sed -E 's#nginx version: nginx/##')"; \
    curl -fsSL -o nginx.tar.gz "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz"; \
    tar -zxf nginx.tar.gz; \
    curl -fsSL -o ngx-brotli.tar.gz "https://codeload.github.com/google/ngx_brotli/tar.gz/53e0fb55f250f48fe80c0ddbf6c0f7103cdbaae1"; \
    echo "27a4352dae4ba4922f9f013f3f0d02359aceeef2701872efa42849c3ba05457a  ngx-brotli.tar.gz" | sha256sum -c -; \
    mkdir -p ngx_brotli; \
    tar -xzf ngx-brotli.tar.gz --strip-components=1 -C ngx_brotli; \
    curl -fsSL -o brotli.tar.gz "https://codeload.github.com/google/brotli/tar.gz/db24a98aed38a16de78cc05ca15cdd8dc2a0d92d"; \
    echo "113b9685dfc14dd2f3360d077283266eec2fbdfb0fe3e5600f11be151da0d68e  brotli.tar.gz" | sha256sum -c -; \
    mkdir -p ngx_brotli/deps/brotli; \
    tar -xzf brotli.tar.gz --strip-components=1 -C ngx_brotli/deps/brotli; \
    curl -fsSL -o headers-more.tar.gz "https://codeload.github.com/openresty/headers-more-nginx-module/tar.gz/21066f7eed72e4de4f6ec47b93e8d5f36c38b84a"; \
    echo "52f3f4dc1b34efa887155e92398052bf477702b2753585fe3482e2dd0136ea62  headers-more.tar.gz" | sha256sum -c -; \
    mkdir -p headers-more-nginx-module; \
    tar -xzf headers-more.tar.gz --strip-components=1 -C headers-more-nginx-module; \
    cd /tmp/ngx_brotli/deps/brotli; \
    mkdir out; \
    cd out; \
    cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF ..; \
    cmake --build . --config Release --target brotlienc; \
    cd "/tmp/nginx-${NGINX_VERSION}"; \
    ./configure --with-compat --add-dynamic-module=/tmp/ngx_brotli --add-dynamic-module=/tmp/headers-more-nginx-module; \
    make modules; \
    mkdir -p /tmp/nginx-modules; \
    cp objs/ngx_http_brotli_filter_module.so objs/ngx_http_brotli_static_module.so objs/ngx_http_headers_more_filter_module.so /tmp/nginx-modules/

# ---------- 6. Nginx со статикой и прокси на API ----------
FROM nginx:1.30.6-alpine AS web
RUN apk add --no-cache curl \
    && apk upgrade --no-cache libxslt zlib
COPY --from=brotli-builder /tmp/nginx-modules/ /etc/nginx/modules/
RUN { \
      echo 'load_module modules/ngx_http_brotli_filter_module.so;'; \
      echo 'load_module modules/ngx_http_brotli_static_module.so;'; \
      echo 'load_module modules/ngx_http_headers_more_filter_module.so;'; \
      cat /etc/nginx/nginx.conf; \
    } > /tmp/nginx.conf \
    && mv /tmp/nginx.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Fill the long tail first, then preserve the existing SSR pages for important SKUs.
COPY --from=build /home/node/app/data/public/product /usr/share/nginx/html/product
COPY --from=build /home/node/app/dist /usr/share/nginx/html
# Refresh public metadata after dist (whose public/ inputs may predate the active release).
COPY --from=build /home/node/app/data/public/*.xml /home/node/app/data/public/robots.txt /home/node/app/data/public/price.xls /home/node/app/data/public/price-buyer.xlsx /home/node/app/data/public/redirects* /usr/share/nginx/html/
RUN mkdir -p /usr/share/nginx/runtime-data/catalog-current/public

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1/healthz || exit 1
