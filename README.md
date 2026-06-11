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

| Команда                                           | Что делает                                                                                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run up`                                      | Полный локальный подъём: `build:prod`, API на 3001 и Vite-фронт на 5173                                                                                                                        |
| `npm run dev`                                     | Только Vite-фронт на 5173; API-запросы проксируются на уже запущенный `server`                                                                                                                 |
| `npm run server`                                  | Только Express API на 3001                                                                                                                                                                     |
| `npm run build`                                   | Прод-сборка в `dist/`                                                                                                                                                                          |
| `npm run preview`                                 | Локальный smoke-тест прод-сборки                                                                                                                                                               |
| `npm test`                                        | Vitest unit/integration tests                                                                                                                                                                  |
| `npm run e2e`                                     | Playwright E2E smoke/user-flow тесты                                                                                                                                                           |
| `npm run load:test`                               | Короткий нагрузочный прогон API; настраивается `API_BASE`, `LOAD_CONCURRENCY`                                                                                                                  |
| `npm run load:soak`                               | Длинный soak-прогон API на 30 минут для контроля RSS/event loop                                                                                                                                |
| `node scripts/importPrice.js [path/to/price.xls]` | Импорт прайса → `data/products.json`, отчёты, `public/sitemap.xml`, `public/robots.txt`, runtime HTML карточек при `PUBLIC_ARTIFACTS_DIR`                                                      |
| `npm run import:price:scheduled`                  | Guard-запуск для планировщика: импортирует прайс только если сегодняшний запуск после 04:30 ещё не выполнялся                                                                                  |
| `npm run check:product-prerender`                 | Проверка, что все product URL из sitemap имеют HTML с meta/JSON-LD, включая long-tail за `PRODUCT_PRERENDER_LIMIT`                                                                             |
| `node scripts/importPrice.js --dry-run`           | То же, но без записи файлов                                                                                                                                                                    |
| `./deploy/post-deploy-smoke.sh`                   | Post-deploy smoke: локальный `/healthz`, `/api/health`, homepage shell, sitemap/robots, `/api/forms/health`, `/api/runtime` и `/api/vk/health?refresh=1` при токене, runtime product-prerender |
| `./deploy/deploy-release.sh --tag <release-tag>`  | Production build + `compose up -d --no-build` + smoke + запись release state в `deploy/state/production-release.env`                                                                           |
| `./deploy/rollback.sh [--tag <release-tag>]`      | Rollback на предыдущий good release tag из state-файла или на явно переданный tag                                                                                                              |

## Конфигурация (`.env`)

Все локальные переменные описаны в [`.env.example`](./.env.example).
Production-основа без секретов лежит отдельно:
[`.env.production.example`](./.env.production.example). Кратко:

### Хранение секретов

В репозитории хранятся только безопасные шаблоны:
[`.env.example`](./.env.example) для локальной разработки и
[`.env.production.example`](./.env.production.example) для приватного
production env. Локальные файлы `.env`, `.env.staging`, `.env.production` и
другие `.env.*` игнорируются Git; `.dockerignore` также исключает их из Docker
build context, оставляя в контексте только шаблоны без реальных секретов.

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

Подготовка production env:

```bash
sudo install -m 600 .env.production.example /etc/yuzhural-site/production.env
sudoedit /etc/yuzhural-site/production.env
npm run check:env -- --production --env-file /etc/yuzhural-site/production.env
```

Шаблон специально оставляет секреты пустыми, поэтому preflight должен падать,
пока оператор не заполнит обязательные production-значения вроде
`INTERNAL_METRICS_TOKEN` и, если формы включены, SMTP-блок.

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

Для локальной разработки без реального SMTP есть явный dev-only режим:

```env
FORMS_ENABLED=true
FORMS_DELIVERY_MODE=local_file
FORMS_LOCAL_OUTBOX_DIR=./data/forms-outbox
```

В этом режиме `/api/quote` и `/api/lead-request` работают, `/api/forms/health`
возвращает `200`, а письма сохраняются JSON-файлами в локальный outbox.
В `production` режим `FORMS_DELIVERY_MODE=local_file` запрещён. Для production
форм используйте только `FORMS_ENABLED=true`, `FORMS_DELIVERY_MODE=smtp` и
заполненные `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`QUOTE_TO_EMAIL`. Если формы временно не готовы, задайте `FORMS_ENABLED=false`.

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
   Если формы отключены или SMTP недоступен, этот endpoint вернёт `503` и:
   ```json
   {
     "ok": false,
     "status": "unavailable"
   }
   ```
   Подробная SMTP-диагностика доступна только в `/api/runtime` при заданном
   `INTERNAL_METRICS_TOKEN` и передаче токена через `Authorization: Bearer <token>`
   или `x-internal-metrics-token: <token>`.

Если планируете использовать именно `Yandex 360`, есть отдельная пошаговая
инструкция с production env, preflight и smoke-check:
[docs/yandex-360-smtp-setup.md](./docs/yandex-360-smtp-setup.md).
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
- `VK_CALLBACK_URL=https://<domain>/api/vk/callback`

Если `VK_CALLBACK_URL` пуст, backend попробует собрать его как
`<SITE_URL>/api/vk/callback` или `<VITE_SITE_URL>/api/vk/callback`.
Для production `SITE_URL` и `VITE_SITE_URL` должны совпадать и указывать на
публичный `https://yu-uek.ru` или актуальный домен; `localhost`, private IP и
tunnel-домены в production preflight не проходят.

Необязательные переменные:

- `VK_CALLBACK_SERVER_ID` — если нужно обновлять конкретный callback-сервер в VK
- `VK_CALLBACK_SERVER_TITLE` — имя callback-сервера при создании/поиске
- `VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS` — интервал фоновой live-probe
  проверки публичного callback URL; `0` отключает scheduler

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
доступен только с тем же токеном, что и `GET /api/runtime`
(`INTERNAL_METRICS_TOKEN`), через `Authorization: Bearer <token>` или
`x-internal-metrics-token: <token>`, и показывает:

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

`deploy/post-deploy-smoke.sh` автоматически проверяет этот endpoint после
`/api/runtime`, если задан `INTERNAL_METRICS_TOKEN`. Для включённого VK bridge
smoke требует `"ok": true` и `"status": "ready"`. Если VK bridge на конкретной
среде намеренно отключён, задайте `VK_SMOKE_ALLOW_DISABLED=true`; тогда smoke
примет только явный disabled response `"ok": false`, `"status": "unavailable"`.

При запущенном сервере backend также сам делает периодический live probe
публичного callback URL и пишет transition-based логи:

- `vk.callback.public_probe_unhealthy` — публичный endpoint перестал отвечать
  корректно;
- `vk.callback.public_probe_recovered` — endpoint восстановился;
- `vk.callback.public_probe_still_unhealthy` — деградация продолжается;
- `vk.callback.secret_mismatch_threshold` — накопились отклонённые callback по
  неверному `secret`.

Для браузерной диагностики есть скрытая внутренняя страница
`/internal/runtime`. Она не добавлена в публичную навигацию, требует
`INTERNAL_METRICS_TOKEN` и показывает runtime, VK bridge status и кнопку
принудительного `refresh=1` probe без `curl`. Токен на этой странице хранится
только в `sessionStorage` текущей вкладки браузера; legacy-значение из
`localStorage`, если оно осталось от старой версии, автоматически переносится и
удаляется.

### Reverse proxy

`TRUSTED_PROXY_IPS` задаёт, от каких proxy Express принимает
`X-Forwarded-For`. По умолчанию используется `loopback`, что подходит для
Nginx на той же машине. Если перед приложением стоят CDN или балансер,
укажите только их IP/CIDR через запятую, например:

```env
TRUSTED_PROXY_IPS=loopback,10.0.0.0/8,172.16.0.0/12
```

В Docker compose production/staging значение по умолчанию — точечный IP
контейнера `web` в bridge-сети (`172.30.0.10` для production и `172.31.0.10`
для staging), чтобы Express доверял `X-Forwarded-For` только от локального
Nginx и rate-limit форм считался по реальному клиентскому IP, а не по IP
контейнера proxy.

### Логи и нагрузочные проверки

Access-log пишет JSON в stdout/stderr, но под production-нагрузкой успешные
`2xx/3xx` запросы семплируются через `ACCESS_LOG_SUCCESS_SAMPLE_RATE`
(по умолчанию 10%). `4xx/5xx` и успешные запросы медленнее `ACCESS_LOG_SLOW_MS`
логируются всегда. Это снижает риск, что Docker/stdout станет bottleneck при
наплыве посетителей.

`/api/health` публичный и отдаёт только liveness-данные. Runtime-метрики
доступны отдельно на `/api/runtime` только при заданном `INTERNAL_METRICS_TOKEN`
и запросе с `Authorization: Bearer <token>` или
`x-internal-metrics-token: <token>`: RSS/heap в MB, active requests, CPU usage
и event-loop delay. Без валидного токена endpoint отвечает `404`. Для
локального stress-test:

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
совпадать. В production это должен быть публичный `https://yu-uek.ru` или
актуальный домен без слэша на конце. Подставляются в:

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
пока не запустится импортёр. Для production теперь есть воспроизводимый путь
через файлы из репозитория:

1. Подготовьте production env-файл, например `/etc/yuzhural-site/production.env`.
2. Убедитесь, что production compose уже поднят и `app` service работает.
3. Установите systemd timer из репозитория:

```bash
./deploy/install-price-import-timer.sh /opt/yuzhural-site /etc/yuzhural-site/production.env
systemctl list-timers --all | grep yuzhural-price-import
```

Что делает этот automation-контур:

- systemd каждые 30 минут вызывает `deploy/run-price-import.sh --scheduled`;
- внутри контейнера `app` запускается `npm run import:price:scheduled`;
- guard `scripts/runScheduledPriceImport.js` импортирует прайс только один раз
  в день после окна `04:30`, а пропущенный запуск догоняется на ближайшем тике;
  в шаблоне systemd unit из репозитория это окно считается в `TZ=Europe/Moscow`;
- source URL (`PRICE_URL` или `PRICE_PAGE_URL`) и SEO/runtime-настройки берутся
  из того же env-файла, что и production deploy.

Для внепланового ручного запуска используйте:

```bash
./deploy/run-price-import.sh --env-file /etc/yuzhural-site/production.env --force
```

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

Production deploy теперь сводится к одной команде:

```bash
./deploy/deploy-release.sh \
  --env-file /etc/yuzhural-site/production.env \
  --tag "$(date +%Y%m%d%H%M)-$(git rev-parse --short HEAD)"
```

Для первого деплоя до переключения внешнего DNS/TLS можно временно пропустить
публичные проверки:

```bash
./deploy/deploy-release.sh \
  --env-file /etc/yuzhural-site/production.env \
  --skip-public-checks
```

Скрипт делает:

- `docker compose build`;
- `docker compose up -d --no-build` c тем же env-файлом, который попадает в контейнеры;
- `./deploy/post-deploy-smoke.sh` с проверками `/healthz`, `/api/health`,
  homepage shell, sitemap/robots, `/api/forms/health`, `/api/runtime` при токене,
  `/api/vk/health?refresh=1` при токене и `npm run check:product-prerender`
  внутри `app`;
- запись release state в `deploy/state/production-release.env`.

Для быстрого операционного прогона перед релизом и сразу после него используйте
[docs/production-readiness-checklist.md](./docs/production-readiness-checklist.md).

Smoke можно вызывать и отдельно:

```bash
./deploy/post-deploy-smoke.sh --env-file /etc/yuzhural-site/production.env
```

Перед деплоем убедитесь, что на хосте есть `./data/products.json`: этот каталог
смонтирован в `app` как `/app/data`, чтобы импорт прайса не терялся при
пересоздании контейнера. Runtime-артефакты импорта для Nginx лежат в
`./data/public` и создаются автоматически при импорте внутри app-контейнера.
`web` сначала отдаёт runtime HTML карточек из `./data/public/product`, затем
fallback из build-time prerender в образе.

### Rollback

Rollback — это переключение на предыдущий рабочий release tag без `--build`.

```bash
./deploy/rollback.sh --env-file /etc/yuzhural-site/production.env
```

По умолчанию скрипт сам выбирает target:

- `LAST_GOOD_RELEASE_TAG`, если последний deploy уже сломал production и smoke не прошёл;
- `PREVIOUS_GOOD_RELEASE_TAG`, если нужен откат от текущего успешного релиза.

Явный tag тоже поддержан:

```bash
./deploy/rollback.sh \
  --env-file /etc/yuzhural-site/production.env \
  --tag <previous-good-tag>
```

Если образы хранятся в registry, перед rollback выполните `docker compose pull`.
Если нужного образа нет локально или в registry, `--no-build` специально
остановит rollback вместо случайной пересборки текущей рабочей директории.
