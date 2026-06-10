<!-- Файл объясняет назначение проекта, локальный запуск, конфигурацию, импорт прайса, SEO и деплой. -->

# ЮжУралЭлектроКабель — сайт + B2B-каталог

React 18 + Vite + Express. Каталог из 6 700+ позиций импортируется из прайса Excel,
заявки уходят на почту менеджеру, аналитика — Яндекс.Метрика, для SEO
генерируются sitemap.xml/robots.txt и JSON-LD (Product + Organization).

## Быстрый старт

```bash
git clone …
cd yuzhural-site
npm install
cp .env.example .env   # заполните по комментариям внутри файла
npm run up             # build/prerender + API на 3001 + фронт на 5173
```

Полный набор команд:

| Команда                                           | Что делает                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run up`                                      | Полный локальный подъём: `build:prod`, API на 3001 и Vite-фронт на 5173                                                                   |
| `npm run dev`                                     | Только Vite-фронт на 5173; API-запросы проксируются на уже запущенный `server`                                                            |
| `npm run server`                                  | Только Express API на 3001                                                                                                                |
| `npm run build`                                   | Прод-сборка в `dist/`                                                                                                                     |
| `npm run preview`                                 | Локальный smoke-тест прод-сборки                                                                                                          |
| `npx vitest run`                                  | Тесты (39 кейсов)                                                                                                                         |
| `npm run e2e`                                     | Playwright E2E smoke/user-flow тесты                                                                                                      |
| `npm run load:test`                               | Короткий нагрузочный прогон API; настраивается `API_BASE`, `LOAD_CONCURRENCY`                                                             |
| `npm run load:soak`                               | Длинный soak-прогон API на 30 минут для контроля RSS/event loop                                                                           |
| `node scripts/importPrice.js [path/to/price.xls]` | Импорт прайса → `data/products.json`, отчёты, `public/sitemap.xml`, `public/robots.txt`, runtime HTML карточек при `PUBLIC_ARTIFACTS_DIR` |
| `npm run import:price:scheduled`                  | Guard-запуск для планировщика: импортирует прайс только если сегодняшний запуск после 04:30 ещё не выполнялся                            |
| `npm run check:product-prerender`                 | Проверка, что все product URL из sitemap имеют HTML с meta/JSON-LD, включая long-tail за `PRODUCT_PRERENDER_LIMIT`                        |
| `node scripts/importPrice.js --dry-run`           | То же, но без записи файлов                                                                                                               |

## Конфигурация (`.env`)

Все переменные описаны в [`.env.example`](./.env.example). Кратко:

### Хранение секретов

В репозитории хранится только безопасный [`.env.example`](./.env.example) с
пустыми значениями и плейсхолдерами. Локальные файлы `.env`, `.env.staging`,
`.env.production` и другие `.env.*` игнорируются Git; `.dockerignore` также
исключает их из Docker build context, оставляя в контексте только
`.env.example`.

Для production не коммитьте реальные `SMTP_PASS`, `INTERNAL_METRICS_TOKEN`,
Sentry DSN, URL прайса с токеном и другие секреты. Храните их вне репозитория:

- на VPS — в отдельном env-файле с правами только для пользователя деплоя,
  например `/etc/yuzhural-site/production.env`;
- в Docker — передавайте на runtime через `docker compose --env-file
/etc/yuzhural-site/production.env up -d --no-build` или через `env_file`,
  указывающий на файл вне рабочей копии;
- в CI/CD — через secrets хранилища платформы (`GitHub Actions secrets`,
  GitLab CI variables и т.п.);
- в managed-инфраструктуре — через secret manager/Vault/SSM/Secrets Manager и
  инъекцию переменных окружения при запуске контейнера.

Build args в `docker-compose.yml` предназначены только для публичных значений,
которые попадают во фронтовый bundle (`VITE_*`, `SITE_URL`, release tag).
Никогда не передавайте туда SMTP-пароли, внутренние токены или другие секреты:
они могут попасть в слои образа, историю build и клиентский JavaScript.

### Почта (SMTP)

`server.js` использует `nodemailer`. В production поведение явное:

- либо `FORMS_ENABLED=true`, заполнены `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM`, `QUOTE_TO_EMAIL`, и `transporter.verify()` успешно проходит
  на старте;
- либо `FORMS_ENABLED=false`, и сервер стартует с отключёнными form-endpoints
  (`/api/quote`, `/api/lead-request` отвечают `503` с понятным сообщением).

Если в production формы включены, но SMTP-блок неполный или `verify()` не
проходит, сервер завершит старт с ошибкой до `listen()`. В staging/dev сервер
пишет явную ошибку с инструкцией в лог, а формы отвечают пользовательским
сообщением без SMTP-деталей.

1. Заведите ящик на корпоративном домене (Яндекс.360, Mail для бизнеса и т.п.).
2. Включите двухфакторную аутентификацию и выпустите **app password** —
   обычный пароль почты Яндекс не пропустит, нужен именно специальный пароль
   для приложений.
3. Заполните в `.env`:
   ```
   FORMS_ENABLED=true
   SMTP_HOST=smtp.yandex.ru
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=sale@yourdomain.ru
   SMTP_PASS=<app password>
   SMTP_FROM="ООО ЮжУралЭлектроКабель <sale@yourdomain.ru>"
   QUOTE_TO_EMAIL=sale@yourdomain.ru
   SMTP_POOL=true
   SMTP_POOL_MAX_CONNECTIONS=2
   SMTP_CONNECTION_TIMEOUT_MS=10000
   SMTP_SOCKET_TIMEOUT_MS=20000
   SMTP_SEND_RETRIES=1
   ```
4. Перезапустите `npm run dev`. Сначала проверьте health-check форм:
   ```bash
   curl http://localhost:3001/api/forms/health
   ```
   Для настроенной среды публичный ответ должен содержать только готовность форм:
   ```json
   {
     "ok": true,
     "status": "ready"
   }
   ```
   Подробная SMTP-диагностика доступна только в `/api/runtime` при заданном
   `INTERNAL_METRICS_TOKEN`.
   Затем можно отправить тестовую заявку:
   ```bash
   curl -X POST http://localhost:3001/api/quote \
     -H 'content-type: application/json' \
     -d '{"customer":{"name":"Test","phone":"+79991112233"},"items":[{"title":"ВВГнг 3х2.5","quantity":100,"unit":"м","price":120}]}'
   ```

> `From:` и `SMTP_USER` должны указывать на один и тот же ящик (или его алиас),
> иначе провайдер отклонит письмо. `Reply-To:` сервер подставляет из email
> клиента только если он его сам указал в форме (поле опциональное).

Если почтовые формы на среде не нужны, задайте:

```env
FORMS_ENABLED=false
```

В этом режиме SMTP-переменные можно не заполнять, но `/api/quote` и
`/api/lead-request` будут недоступны и вернут `503`.

SMTP-транспорт создаётся один раз на Express app и по умолчанию работает через
pool: `SMTP_POOL=true`, `SMTP_POOL_MAX_CONNECTIONS=2`,
`SMTP_POOL_MAX_MESSAGES=100`. Handshake/socket ограничены таймаутами, а
`sendMail` делает один retry (`SMTP_SEND_RETRIES=1`) для временных сетевых
ошибок и 4xx-ответов SMTP. Внешний HTTP-timeout вокруг `sendMail` не ставим:
он не отменяет уже начатую SMTP-операцию и может показать ошибку при фактически
доставленном письме.

### VK callback и временные tunnel URL

Для локальной отладки связки `сайт -> VK -> сайт` можно временно пробрасывать
`/api/vk/callback` наружу через tunnel (`cloudflared`, `ngrok`,
`localtunnel`). Это удобно для разработки, но такие URL не стоит считать
стабильной точкой входа:

- tunnel может умереть из-за сна ноутбука, смены сети/VPN, падения локального
  процесса или проблем у shared tunnel-сервиса;
- при этом backend на `localhost:3001` может продолжать работать, но VK уже не
  сможет доставить callback, и ответы менеджера перестанут возвращаться в чат
  сайта;
- ошибка в VK Callback API вида `Сервер вернул неправильный ответ` в таком
  сценарии часто означает именно сломанный tunnel, а не дефект backend-логики.

Быстрая проверка tunnel:

```bash
curl -X POST <public-callback-url> \
  -H 'content-type: application/json' \
  -d '{"type":"confirmation","group_id":<VK_GROUP_ID>}'
```

Исправный tunnel должен вернуть строку из `VK_CALLBACK_CONFIRMATION_TOKEN`.
Если приходит `503`, `502`, DNS-ошибка или нет ответа, проблема во внешнем
туннеле.

На постоянном сервере/VPS этой проблемы в таком виде быть не должно: VK будет
ходить напрямую на стабильный публичный URL backend, без временной прокладки до
локального `localhost`.

### VK callback auto-config

Backend умеет автоматически синхронизировать callback-сервер VK при старте.
Это убирает ручные шаги в UI сообщества для production/staging.

Минимальный набор переменных:

- `VK_CALLBACK_AUTO_CONFIGURE=true`
- `VK_GROUP_ID=<group_id сообщества>`
- `VK_CALLBACK_SECRET=<secret key из Callback API>`
- `VK_CALLBACK_URL=<публичный https URL до /api/vk/callback>`

Если `VK_CALLBACK_URL` пуст, backend попробует собрать его как
`<SITE_URL>/api/vk/callback` или `<VITE_SITE_URL>/api/vk/callback`.

Необязательные переменные:

- `VK_CALLBACK_SERVER_ID` — если нужно обновлять конкретный callback-сервер в VK
- `VK_CALLBACK_SERVER_TITLE` — имя callback-сервера при создании/поиске

Что делает автоконфиг на старте:

- получает актуальный confirmation code через VK API и использует его для
  `/api/vk/callback`;
- находит существующий callback-сервер по `server_id`, URL или title;
- обновляет его либо создаёт новый;
- включает обязательные события `message_new` и `message_reply`, сохраняя
  остальные callback-флаги.

Практическое ограничение: обычного community token только с правом
`messages` недостаточно. Для методов `groups.getCallbackServers`,
`groups.getCallbackSettings` и смежных нужен токен сообщества с доступом к
Callback API-методам. Если scope недостаточен, сервер стартует, но запишет
ошибку `startup.vk_callback_failed`, а автосинхронизация не выполнится.

Для диагностики runtime есть внутренний endpoint `GET /api/vk/health`. Он
доступен только с тем же bearer token, что и `GET /api/runtime`
(`INTERNAL_METRICS_TOKEN`), и показывает:

- включён ли VK bridge и достаточно ли конфигурации для callback;
- `managerPeerId` и allowlist manager user id;
- результат последнего auto-config;
- время последнего успешного callback;
- последнее `secret_mismatch` и счётчик таких отклонений;
- состояние публичного callback URL, включая live probe;
- operational risk публичной точки входа (`public`, `tunnel`, `private`).

Если добавить `?refresh=1`, backend принудительно выполнит live probe:

```bash
curl -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" \
  "http://localhost:3001/api/vk/health?refresh=1"
```

Это полезно, чтобы быстро отличить ошибку в backend-логике от умершего tunnel
или неработающего публичного URL.

### Reverse proxy

`TRUSTED_PROXY_IPS` задаёт, от каких proxy Express принимает
`X-Forwarded-For`. По умолчанию используется `loopback`, что подходит для
Nginx на той же машине. Если перед приложением стоят CDN или балансер,
укажите только их IP/CIDR через запятую, например:

```env
TRUSTED_PROXY_IPS=loopback,10.0.0.0/8,172.16.0.0/12
```

В Docker compose production/staging значение по умолчанию — `uniquelocal`,
чтобы Express доверял `X-Forwarded-For` от Nginx в bridge-сети и rate-limit
форм считался по реальному клиентскому IP, а не по IP контейнера Nginx.

### Логи и нагрузочные проверки

Access-log пишет JSON в stdout/stderr, но под production-нагрузкой успешные
`2xx/3xx` запросы семплируются через `ACCESS_LOG_SUCCESS_SAMPLE_RATE`
(по умолчанию 10%). `4xx/5xx` и успешные запросы медленнее `ACCESS_LOG_SLOW_MS`
логируются всегда. Это снижает риск, что Docker/stdout станет bottleneck при
наплыве посетителей.

`/api/health` публичный и отдаёт только liveness-данные. Runtime-метрики
доступны отдельно на `/api/runtime` только при заданном `INTERNAL_METRICS_TOKEN`
и запросе с `Authorization: Bearer <token>`: RSS/heap в MB, active requests,
CPU usage и event-loop delay. Для локального stress-test:

```bash
npm run server
API_BASE=http://127.0.0.1:3001 LOAD_CONCURRENCY=10,50,100 LOAD_DURATION_SEC=60 npm run load:test
```

Для проверки статики вместе с API сначала соберите и поднимите preview:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
STATIC_BASE=http://127.0.0.1:4173 npm run load:test
```

### Аналитика

`VITE_YANDEX_METRIKA_ID` — номер счётчика. Пустое значение полностью отключает
Метрику, скрипт `mc.yandex.ru` не подгружается. Цели, которые отправляет сайт:
`quote-open`, `quote-submit`, `price-download`, `product-view`, `search-submit`.
Если счётчик включён, `tag.js` вставляется асинхронно после `load`/`idle`;
clickmap, accurate bounce и webvisor по умолчанию выключены.

#### Подключение Яндекс Метрики

1. Войдите в [Яндекс Метрику](https://metrika.yandex.ru/) и создайте новый счётчик.
2. В поле «Адрес сайта» укажите будущий продакшен-домен без `http`, `https` и `www`, например `yu-uek.ru`. Если сайт ещё не опубликован, счётчик всё равно можно создать заранее.
3. Скопируйте номер счётчика и пропишите его в локальный `.env`:

   ```env
   VITE_YANDEX_METRIKA_ID=12345678
   ```

4. Если для staging нужен отдельный счётчик, задайте `STAGING_YANDEX_METRIKA_ID`.
5. После изменения переменной пересоберите фронтенд и заново задеплойте сайт:

   ```bash
   npm run build
   ```

   Если деплой идёт через Docker Compose, передайте переменную окружения и пересоздайте контейнеры.

Проверка: после деплоя откройте сайт и убедитесь в интерфейсе Метрики, что появился хотя бы один визит. Пока сайт не опубликован и код счётчика не попал в собранный фронтенд, данные собираться не будут.

`VITE_SENTRY_DSN` включает Sentry/GlitchTip. SDK грузится отдельным lazy-чанком
после `load`/`idle`; ранние ошибки буферизуются и могут форсировать загрузку.
Performance tracing включается только через `VITE_SENTRY_TRACES_SAMPLE_RATE`,
а replay/profiling по умолчанию остаются выключенными.

### SEO / canonical-домен

`SITE_URL` (для Node-скриптов) и `VITE_SITE_URL` (для сборки фронта) должны
совпадать. Подставляются в:

- `public/sitemap.xml` / `public/robots.txt` (генерация после импорта прайса);
- `<link rel="canonical">`, `og:url`, JSON-LD (`Product.url`, `Organization.url`).

## Структура

```
src/
  app/router.jsx           # маршруты (lazy-загрузка страниц)
  components/              # UI, layout, формы, каталог
  hooks/useSEO.js          # title, description, og:*, twitter, canonical
  hooks/useJsonLd.js       # вставка <script type="application/ld+json">
  lib/siteConfig.js        # NAP компании, базовый URL — единый источник правды
  lib/analytics.js         # Yandex.Metrika (no-op если id не задан)
  lib/quotePdf.js          # генератор КП в PDF (lazy + Roboto Cyrillic)
  pages/                   # все страницы (lazy через router.jsx)
  store/                   # zustand-сторы сайта (persist)
  styles/                  # глобальные + посекционные стили
scripts/
  importPrice.js           # чтение Excel → products.json + отчёты + SEO
  runScheduledPriceImport.js # guard для launchd/cron: пропускает импорт до 04:30 и после успешного запуска за день
  lib/siteSeo.js           # генератор sitemap.xml/robots.txt
shared/
  messages.js              # общие тексты ошибок/успеха для фронта и API
  quoteValidation.js       # общая серверная/клиентская валидация заявок
  catalogCategories.json   # статичное дерево категорий каталога
data/
  products.json            # выход импортёра, читается сервером
  productRegistry.json     # стабильные id/slug между импортами
public/
  sitemap.xml, robots.txt  # перезаписываются importPrice.js
server.js                  # Express + nodemailer
```

## Импорт прайса

```bash
node scripts/importPrice.js              # data/price.xls по умолчанию
node scripts/importPrice.js path.xls
node scripts/importPrice.js --dry-run    # только отчёт, без записи

# Скачать свежий прайс с сайта поставщика и сразу пересобрать каталог:
PRICE_URL=https://supplier.example/upload/price.xls npm run import:price:remote
node scripts/importPrice.js https://supplier.example/upload/price.xls

# Если поставщик меняет имя Excel-файла, но ссылка на страницу прайса стабильна:
PRICE_PAGE_URL=https://www.cablehome.ru/price/ npm run import:price:remote
node scripts/importPrice.js https://www.cablehome.ru/price/
```

После успешного запуска перезаписываются:
`data/products.json`, `data/import-report.{json,html}`, `data/import-history.json`,
`data/productRegistry.json`, `public/sitemap.xml`, `public/robots.txt`.

HTML-отчёт открывается прямо из консоли (выводится ссылка `file://...`).

Если импорт запускается внутри Docker app-контейнера, compose задаёт
`PUBLIC_ARTIFACTS_DIR=/app/data/public`: туда пишутся `price.xls`,
`redirects.*`, `sitemap*.xml`, `robots.txt` и runtime HTML карточек
`product/<slug>.html`, а Nginx отдаёт эти файлы поверх версий, собранных в
web-образ.

Build-time prerender карточек ограничен переменной `PRODUCT_PRERENDER_LIMIT`
(по умолчанию `720`), чтобы web-образ не тащил все 6 700+ HTML-файлов. Полный
product sitemap при этом сохраняется, а весь long tail обязан появиться в
runtime volume после импорта прайса.

Production-контракт такой:

1. `app` запускает `importPrice.js` с `PUBLIC_ARTIFACTS_DIR=/app/data/public`.
2. Импортёр пишет свежие `sitemap*.xml`, затем генерирует
   `product/<slug>.html` для всех product URL из sitemap.
3. В конце импортёр запускает аудит runtime-prerender. Если хотя бы один URL из
   sitemap не имеет HTML с canonical/meta/JSON-LD, или случайная карточка за
   `PRODUCT_PRERENDER_LIMIT` выглядит как голый `index.html`, импорт падает с
   ненулевым кодом.
4. Nginx отдаёт `/product/<slug>` из `./data/public/product/<slug>.html`, затем
   из build-time fallback для важных SKU. До успешного runtime-импорта long-tail
   URL могут попасть в SPA fallback, поэтому после деплоя/импорта держите
   `npm run check:product-prerender` в smoke-check.

Для ручного pinning важных позиций используйте `PRODUCT_PRERENDER_INCLUDE` со
списком SKU/slug; `PRODUCT_PRERENDER_LIMIT=all` возвращает прежний полный
build-time prerender.

### Автоматический ежедневный импорт (production)

`data/products.json` лежит в `.gitignore` — после `npm ci` каталог пустой,
пока не запустится импортёр. На проде нужен один из двух подходов:

**Системный cron (рекомендуется).** Скачивает свежий прайс с сайта поставщика
каждый день в 04:30 утра по Москве:

```cron
30 4 * * * cd /var/www/yuzhural-site && /usr/bin/env PRICE_PAGE_URL=https://www.cablehome.ru/price/ /usr/bin/node scripts/importPrice.js >> /var/log/yuzhural-import.log 2>&1
```

Если Excel лежит по неизменному прямому URL, вместо `PRICE_PAGE_URL` можно
использовать `PRICE_URL`. Если же поставщик меняет имя файла, удобнее
оставить стабильную страницу прайса, а ссылку на `.xls/.xlsx` импортёр
найдёт сам.

**Если cron недоступен (shared hosting).** Скрипт `import:price:remote` можно
вызывать по расписанию из панели хостинга, systemd-таймера или
GitHub Actions schedule. Минимальный workflow:

```yaml
# .github/workflows/import-price.yml
on:
  schedule: [{ cron: '30 1 * * *' }] # 04:30 МСК
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run import:price:remote
        env:
          PRICE_URL: ${{ secrets.PRICE_URL }}
      # дальше — деплой data/products.json и public/sitemap.xml на прод
```

В случае ошибки импортёр завершается с ненулевым кодом — и cron, и Actions
пришлют письмо/уведомление, ничего не теряется молча.

**macOS `launchd` (для личной машины).** Если импорт должен переживать сон,
выключение ноутбука и поздний вход в систему, используйте
`scripts/runScheduledPriceImport.js` вместе с user LaunchAgent. Этот guard:

- ничего не делает до сегодняшних `04:30`;
- не запускает повторный импорт, если он уже успешно прошёл сегодня после `04:30`;
- при `RunAtLoad` догоняет пропущенный запуск сразу после входа в систему или
  старта пользовательской сессии, если к этому моменту `04:30` уже прошли.

Локальная установленная конфигурация:

- plist: `~/Library/LaunchAgents/ru.yuzhural.price-import.plist`
- логи: `~/Library/Logs/yuzhural-price-import.log` и
  `~/Library/Logs/yuzhural-price-import.error.log`

Это временный вариант для локальной машины. Риски такого подхода: импорт
зависит от включённого ноутбука, пользовательской сессии, сети и может
сдвигаться по времени после сна/выключения. Когда появится стабильный сервер,
перенесите расписание на server-side scheduler (`cron`, `systemd timer` или
аналогичный always-on инструмент) и настройте уведомление при ошибке импорта.

**Примечание про Codex automation.** Если запускать импорт через локальную
automation в Codex app, это удобно для личной машины, но не стоит считать такой
вариант полностью надёжным при закрытом приложении или спящем компьютере. Для
гарантированного ежедневного обновления прайса используйте системный `cron`,
`systemd` timer или другой always-on scheduler на сервере.

## Docker deploy, staging и rollback

Production compose использует immutable tag из `DEPLOY_TAG`. Не деплойте только
`:latest`: rollback должен переключать compose на уже собранный предыдущий tag,
а не пересобирать текущую рабочую директорию.

### Staging / preview

Staging изолирован от production: другие container names, сеть и каталог
данных. При standalone-запуске сайт доступен на `http://localhost:8080`; если
production уже использует локальный `8080`, задайте `STAGING_HTTP_PORT=8081`.

```bash
cp .env.example .env.staging
# .env.staging игнорируется Git. Для shared/VPS лучше хранить staging-секреты
# вне рабочей копии и передавать их через docker compose --env-file.
# Задайте SMTP/QUOTE_TO_EMAIL, STAGING_SITE_URL и при необходимости
# STAGING_HTTP_PORT, STAGING_SENTRY_DSN.

mkdir -p data-staging
cp data/products.json data/productRegistry.json data-staging/

STAGING_DEPLOY_TAG=preview-$(git rev-parse --short HEAD) \
  docker compose -f docker-compose.staging.yml up -d --build

curl -fsS http://127.0.0.1:${STAGING_HTTP_PORT:-8080}/healthz
```

Если staging должен проверять свежий прайс отдельно от production, запускайте
импорт внутри staging-контейнера: `docker compose -f docker-compose.staging.yml exec app npm run import:price:remote`.

### Production release

Production `web` в `docker-compose.yml` по умолчанию слушает только
`127.0.0.1:8080` (`WEB_HTTP_BIND=127.0.0.1:8080`). Не публикуйте этот Nginx
на внешний plain HTTP: перед ним обязателен внешний TLS reverse proxy
(Caddy, Traefik, nginx на хосте или балансер), который принимает 443,
выпускает/обновляет сертификат и проксирует на `http://127.0.0.1:8080`.

Если локальный upstream-порт занят, поменяйте только loopback bind, например
`WEB_HTTP_BIND=127.0.0.1:8081`. Не используйте значения вида `0.0.0.0:80` на
публичном хосте: сайт не должен открываться в интернет по plain HTTP.

```bash
export DEPLOY_TAG=$(date +%Y%m%d%H%M)-$(git rev-parse --short HEAD)
export VITE_SENTRY_RELEASE=$DEPLOY_TAG

docker compose build
docker compose --env-file /etc/yuzhural-site/production.env up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
docker compose exec app npm run check:product-prerender
```

Перед деплоем убедитесь, что на хосте есть `./data/products.json`: этот каталог
смонтирован в `app` как `/app/data`, чтобы импорт прайса не терялся при
пересоздании контейнера. Runtime-артефакты импорта для Nginx лежат в
`./data/public` и создаются автоматически при импорте внутри app-контейнера.
`web` сначала отдаёт runtime HTML карточек из `./data/public/product`, затем
fallback из build-time prerender в образе.

### Rollback

Rollback — это переключение `DEPLOY_TAG` на предыдущий рабочий release tag без
`--build`.

```bash
export DEPLOY_TAG=<previous-good-tag>
export VITE_SENTRY_RELEASE=$DEPLOY_TAG

docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
```

Если образы хранятся в registry, перед `up` выполните `docker compose pull`.
Если предыдущего образа нет локально или в registry, `--no-build` специально
остановит rollback вместо того, чтобы случайно пересобрать новый образ.
