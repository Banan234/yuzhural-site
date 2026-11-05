<!-- Файл объясняет назначение проекта, локальный запуск, конфигурацию, импорт прайса, SEO и деплой. -->

# ЮжУралЭлектроКабель — сайт + B2B-каталог

React 18 + Vite + Express. Каталог из 6 700+ позиций импортируется из прайса Excel,
заявки уходят на почту менеджеру, аналитика — Яндекс.Метрика, для SEO
генерируются sitemap.xml/robots.txt и JSON-LD (Product + Organization).

## Быстрый старт

Пример использует nvm. При другом способе установки выберите Node24.22.1
и проверьте `node -v` перед `npm ci`; менять системный Node автоматически не нужно.

```bash
git clone …
cd yuzhural-site
nvm install
nvm use
npm ci
cp .env.example .env   # заполните по комментариям внутри файла
npm run up             # build/prerender + API на 3001 + фронт на 5173
```

Среда проекта — Node 24 LTS, версия в `.nvmrc` (24.22.1). CI читает этот файл;
все Node-стадии Docker используют тот же `NODE_VERSION`. Обновление версии
сопровождается чистой установкой, полными Vitest/Playwright и build:prod.
Node 20 снят с поддержки 30.04.2026; переход нужен для поддерживаемого runtime,
а не только для вспомогательного corpus-script. Node 24 поддерживается
до 30.04.2028: [официальный график](https://github.com/nodejs/Release/blob/main/schedule.json).
`node:sqlite` используется скриптами корпуса, не Express-процессом; на Node 24.22.1
API имеет статус Release candidate1.2 и доступен без `--experimental-sqlite`.
Предупреждения не отключаются. [Документация выбранной версии](https://github.com/nodejs/node/blob/v24.22.1/doc/api/sqlite.md).
Docker-запуск нужно проверять отдельно: успешная локальная сборка его не заменяет.

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
| `node scripts/importPrice.js [path/to/price.xls]` | Импорт прайса → отчёты и единый атомарный каталог в `data/catalog-current/`                                                                                                                    |
| `npm run import:price:scheduled`                  | Однократная проверка источника через `--if-changed`; расписание задаёт внешний планировщик                                                                                  |
| `npm run backup:create`                           | Снимок runtime-данных перед ручным изменением или импортом                                                                                                                                     |
| `npm run backup:list`                             | Список доступных резервных копий                                                                                                                                                               |
| `npm run backup:verify -- <id>`                   | Проверка SHA-256 выбранной резервной копии                                                                                                                                                     |
| `npm run backup:restore -- <id> [--apply]`        | Проверка или восстановление копии; без `--apply` файлы не меняются                                                                                                                             |
| `npm run monitor:health`                          | Проверка доступности сайта/API/форм и приватных runtime/VK endpoints при токене                                                                                                                |
| `npm run check:import`                            | Безопасный dry-run импорта и проверка защитных порогов без записи файлов                                                                                                                       |
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
Метрику, скрипт `mc.yandex.ru` не подгружается. При настроенном счётчике он
загружается только после согласия пользователя на категорию «Аналитика»;
отказ и отзыв согласия останавливают отправку новых событий и очищают доступные
cookie Метрики. Цели сайта: `quote-open`, `quote-submit`, `price-download`,
`product-view`, `search-submit` и события виджетов. `tag.js` вставляется
асинхронно после `load`/`idle`; автоматический сбор кликов, clickmap, accurate
bounce и webvisor выключены.

Баннер cookie предлагает принять все категории или только обязательные.
Необязательные категории настраиваются отдельно: «Аналитика» управляет
Яндекс.Метрикой, «Внешние сервисы» — встроенными картами Яндекса. Выбор хранится
в first-party cookie `yuzhural-cookie-consent` до 180 дней. Если браузер
блокирует cookie, выбор резервно хранится в `localStorage`. Настройки доступны
для изменения через ссылку «Настройки cookie» в футере. Обязательные функции
сайта, включая корзину, доступны без согласия на аналитику и карты.

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

- `data/catalog-current/public/sitemap.xml` / `robots.txt` (генерация после импорта прайса);
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
  runScheduledPriceImport.js # один вызов importPrice --if-changed; интервалы задаёт launchd/systemd
  lib/siteSeo.js           # генератор sitemap.xml/robots.txt
shared/
  messages.js              # общие тексты ошибок/успеха для фронта и API
  quoteValidation.js       # общая серверная/клиентская валидация заявок
  catalogCategories.json   # статичное дерево категорий каталога
data/
  catalog-current -> .catalog-current-releases/<release>
                            # продукты, реестр, sitemap и runtime HTML одной версии
  products.json             # совместимая копия каталога текущего выпуска
  productRegistry.json      # совместимая копия реестра текущего выпуска
public/
  redirects.json           # исходные redirects для сборки
server.js                  # Express + nodemailer
```

## Импорт прайса

```bash
node scripts/importPrice.js              # PRICE_URL → PRICE_PAGE_URL → data/price.xls
node scripts/importPrice.js path.xls
node scripts/importPrice.js --dry-run    # проверка в консоли, без установки каталога/отчётов

# Скачать свежий прайс с сайта поставщика и сразу пересобрать каталог:
PRICE_URL=https://supplier.example/upload/price.xls npm run import:price:remote
node scripts/importPrice.js https://supplier.example/upload/price.xls

# Если поставщик меняет имя Excel-файла, но ссылка на страницу прайса стабильна:
PRICE_PAGE_URL=https://www.cablehome.ru/price/ npm run import:price:remote
node scripts/importPrice.js https://www.cablehome.ru/price/
```

После успешного запуска одним переключением активируется новый каталог с
`products.json`, `productRegistry.json`, SEO-файлами и runtime HTML карточек.
Отчёт и история импорта записываются отдельно в `data/`.

Перед публикацией обычный импорт автоматически создаёт резервную копию в
`data/backups` (или в `BACKUP_DIR`). Действует контракт `partial-v1`:
корректные строки обновляются независимо от ошибок отдельных строк. Ошибочные
и неоднозначные коммерческие данные изолируются с физическими координатами
XLS в отчёте; неизвестные единицы не угадываются, неверная цена не становится
нулём. Известная проблемная карточка сохраняется как «Данные уточняются», без
цены и покупки. Действительно исчезнувший товар получает 404. Сомнение только
в классификации однозначно установленного прежнего товара не мешает обновить
корректные цену/остаток/единицу: остаётся служебный `classificationReview`.

Ошибки строк, новые review, подозрительные цены и изменения категорий дают
диагностику, а не глобальную блокировку прайса. Общая остановка сохраняется
для ошибок источника/структуры, пустого выпуска, нарушений безопасной подготовки
HTML/JSON и блокирующих порогов `minProducts`/`maxRemovedPercent`.
`--override-publish-guard` явно обходит агрегатные пороги с записью в отчёт,
но не ошибки источника, пустой выпуск или инварианты безопасной установки.
`--dry-run` не заменяет каталог, прайс, историю и отчёты и не отправляет письма;
при этом читает/скачивает источник и временно захватывает общую import-блокировку.
Публичный `/price.xls` остаётся исходным файлом поставщика байт в байт.
Подробности: [контракт импорта](docs/price-import-contract.md).

Резервные копии нужно дополнительно копировать за пределы сервера: локальный
backup защищает от ошибочного импорта, но не от потери диска или самого VPS.
Проверка и восстановление:

```bash
npm run backup:list
npm run backup:verify -- 20260907T120000Z
npm run backup:restore -- 20260907T120000Z       # только проверка
npm run backup:restore -- 20260907T120000Z --apply
```

### Внешний health-монитор

`npm run monitor:health` рассчитан на запуск cron/systemd каждые 5 минут. Он
проверяет `/healthz`, главную, sitemap, `/api/health`, состояние форм и, если задан
`INTERNAL_METRICS_TOKEN`, закрытые `/api/runtime` и `/api/vk/health?refresh=1`.
При сбое команда возвращает ненулевой код. Если задан `MONITOR_WEBHOOK_URL`,
уведомление отправляется только при переходе в ошибку, изменении набора проблем
или восстановлении; состояние хранится в `MONITOR_STATE_FILE`.

Пример ручного запуска:

```bash
MONITOR_BASE_URL=https://yu-uek.ru \
INTERNAL_METRICS_TOKEN='...' \
npm run monitor:health
```

Для production установите systemd timer после запуска compose:

```bash
./deploy/install-health-monitor-timer.sh \
  /opt/yuzhural-site /etc/yuzhural-site/production.env
systemctl list-timers --all | grep yuzhural-health-monitor
```

Timer запускает монитор внутри `app`-контейнера каждые 5 минут. В production
состояние (`MONITOR_STATE_FILE`) и backup-каталог должны лежать на persistent
volume; резервные копии дополнительно выгружайте на отдельное хранилище.

Webhook получает JSON с полем `text`, поэтому его можно подключить к небольшому
адаптеру для Telegram, Slack, Mattermost или другого выбранного канала. Сам
монитор не хранит и не выводит токены.

Для дополнительной проверки HTML карточки задайте
`MONITOR_PRODUCT_PATH=/product/<актуальный-slug>`.

HTML-отчёт открывается прямо из консоли (выводится ссылка `file://...`).

Если импорт запускается внутри Docker app-контейнера, compose задаёт
`CATALOG_PRODUCTS_FILE=/app/data/catalog-current/products.json` и
`PUBLIC_ARTIFACTS_DIR=/app/data/catalog-current/public`. `catalog-current` —
символическая ссылка на подготовленный выпуск. Одним переключением API и nginx
получают продукты и публичные файлы одной версии. Выпуск включает
`products.json`, `productRegistry.json`, `price.xls`,
`redirects.*`, `sitemap*.xml`, `robots.txt` и runtime HTML карточек
`product/<slug>.html`, а Nginx отдаёт эти файлы поверх версий, собранных в
web-образ.

Build-time prerender карточек ограничен переменной `PRODUCT_PRERENDER_LIMIT`
(по умолчанию `720`), чтобы web-образ не тащил все 6 700+ HTML-файлов. Полный
product sitemap при этом сохраняется, а весь long tail обязан появиться в
runtime volume после импорта прайса.

Production-контракт такой:

1. `app` и `web` читают продукты и публичные файлы из одного пути
   `/app/data/catalog-current` внутри общего bind-mount.
2. Импортёр пишет свежие `sitemap*.xml`, затем генерирует
   `product/<slug>.html` для всех product URL из sitemap.
3. В конце импортёр запускает аудит runtime-prerender. Если хотя бы один URL из
   sitemap не имеет HTML с canonical/meta/JSON-LD, или случайная карточка за
   `PRODUCT_PRERENDER_LIMIT` выглядит как голый `index.html`, импорт падает с
   ненулевым кодом.
4. При наличии активного каталога Nginx отдаёт `/product/<slug>` только из
   `./data/catalog-current/public/product/<slug>.html`; отсутствующая карточка
   получает настоящий 404. Build-time fallback используется только при запуске
   без активного каталога. Pending-карточки сохраняют предусмотренный 200 без
   коммерческих значений. Проверка `npm run check:product-prerender` входит
   в smoke после подготовки выпуска.

Для ручного pinning важных позиций используйте `PRODUCT_PRERENDER_INCLUDE` со
списком SKU/slug; `PRODUCT_PRERENDER_LIMIT=all` возвращает прежний полный
build-time prerender.

### Автоматическая проверка прайса каждые 30 минут

`npm run import:price:scheduled` выполняет **одну** проверку: сначала обслуживание
служебных файлов, затем `node scripts/importPrice.js --if-changed`.
Встроенного таймера, ежедневного окна 04:30 и лимита «один импорт в день» нет.
Расписание задаёт отдельно установленный launchd/systemd. Обычный `npm ci`,
`npm run server` или запуск compose не устанавливает этот price timer.
В чистом checkout сгенерированного каталога может не быть; `npm ci` его не создаёт
и не удаляет существующие runtime-данные.

Источник выбирается: явный путь/URL → `PRICE_URL` → `PRICE_PAGE_URL` →
`data/price.xls`. Импортёр читает корневой `.env`, не заменяя уже заданные
переменные процесса. После получения файла сравниваются SHA-256 и исходный
`requestedUrl` с последним успешно опубликованным состоянием в
`data/.price-source-state.json`.

- Совпадение при `--if-changed`: статус `unchanged`, без нового каталога,
  регенерации HTML и нового письма/архивного отчёта. Файл всё равно скачивается
  и хешируется; это не проверка только HTTP Last-Modified/ETag. Старые письма
  из outbox могут повторно отправляться **до** проверки совпадения.
- Отсутствующее/повреждённое состояние не означает «уже обновлено»: источник
  обрабатывается заново; повреждение JSON диагностируется. Ошибка доступа
  к состоянию завершает попытку ошибкой. После неудачи новый SHA не сохраняется
  как успешный, следующий tick снова пробует источник.
- Сетевая загрузка XLS по умолчанию имеет 3 попытки, тайм-аут 60 секунд на
  HTTP-операцию, паузы 30/60 секунд для повторяемых ошибок (сеть, timeout,
  HTTP 429/5xx). Извлечение XLS-ссылки из HTML-страницы выполняется до этого
  цикла повторов. Ошибки структуры и неповторяемые ошибки загрузки не лечатся
  повторным разбором в той же попытке.
- Watchdog ограничивает весь запуск 15 минутами; `PRICE_IMPORT_TIMEOUT_MS`
  задаёт другое положительное значение. Ошибка/тайм-аут даёт ненулевой код,
  статус/отчёт `failed` при возможности их сохранить. Удерживаемая другим
  процессом блокировка также даёт отказ, без публикации и перезаписи его отчёта.
- Неудачная подготовка не переключает active. Ошибка отправки отчёта не
  откатывает уже установленный каталог: письмо остаётся в persistent outbox,
  за один проход повторяются не более 5 писем. Успех импорта не доказывает
  доставку письма адресату. Ошибка служебной очистки логируется и не отменяет
  саму проверку источника.

Для проверки без публикации (локальный файл или источник из окружения):

```bash
npm run check:import
npm run import:price -- /path/to/fixture.xls --dry-run
```

`--if-changed` не сокращает `--dry-run`: он заново проверяет строки. Чтобы
переобработать те же байты после изменения правил импорта, нужен обычный ручной
запуск **без** `--if-changed`; scheduled сам изменение кода не обнаруживает.
Такой запуск устанавливает данные и не обходит защитные проверки.

#### Локальный macOS LaunchAgent

На проверенном Mac 30.10.2026 загружен пользовательский
`~/Library/LaunchAgents/ru.yuzhural.price-import.plist`: `StartCalendarInterval`
с `Minute=0/30`, `RunAtLoad=false`, cwd `/Users/Shared/yuzhural-site`, запуск
`scripts/runScheduledPriceImport.js` абсолютным путём к Node. Это существующая
локальная установка, не переносимый installer из репозитория.

Нужны доступная рабочая копия, зависимости, поддерживаемый Node 24 и настройки
источника/доставки. LaunchAgent использует заданный абсолютный Node, а не
автоматически `.nvmrc` интерактивного shell. Локальное восстановление применено
30.10.2026 ([§58 отчёта](docs/reports/full-review-2026-10-26.md#58-локальное-восстановление-применено-проверены-published-и-unchanged-30102026)):
Node24.22.1 и полный client+SSR-шаблон находятся в
`/Users/Shared/yuzhural-local-runtime`, вне `/tmp` и Docker-контекста.
Job указывает на постоянный Node и `PRERENDER_TEMPLATE_DIR`; источник и
расписание сохранены. Зависимости шаблона ссылаются на существующие
`node_modules` проекта, поэтому обновление кода/lock требует согласованной
новой подготовки шаблона. Проверены успешный штатный tick и последующий
`unchanged`; JSON/HTML/API/скачиваемый прайс согласованы локально.

SMTP сейчас не настроен полностью: отчёты остаются в `data/import-mail-outbox`,
реальная доставка не подтверждена и требует отдельного согласованного включения.
[План восстановления§57](docs/reports/full-review-2026-10-26-assets/local-import-57/apply-plan.md)
сохранён как история; последний результат находится в§58. Наличие этой локальной
установки не подтверждает серверный timer.

Пользовательский агент зависит от доступности пользовательской launchd-сессии
и работающего Mac; сон/выключение не позволяют обещать круглосуточную проверку
каждые 30 минут. Логи — `~/Library/Logs/yuzhural-price-import.log` и
`yuzhural-price-import.error.log`. Для read-only проверки job:

```bash
launchctl print gui/$(id -u)/ru.yuzhural.price-import
```

Полный вывод может содержать окружение: перед передачей диагностик удаляйте
секреты. Локальный агент не подтверждает наличие серверного timer.

#### Отдельная серверная установка systemd + Docker

В репозитории реализованы шаблоны и installer; их наличие **не** означает,
что timer установлен на сервере. Нужны Linux/systemd, Docker Compose, запущенный
`app`, env-файл, persistent `data` и подготовленные HTML/assets текущего
веб-выпуска (`/app/data/web-template-current` в compose). На сервере должны
сохраниться active, source state, архив отчётов и outbox между перезапусками.
Следующие команды — инструкция установки для оператора, не выполненная проверка:

```bash
./deploy/install-price-import-timer.sh /opt/yuzhural-site /etc/yuzhural-site/production.env
systemctl list-timers --all yuzhural-price-import.timer
systemctl status yuzhural-price-import.timer yuzhural-price-import.service --no-pager
journalctl -u yuzhural-price-import.service --since today --no-pager
```

Installer через sudo устанавливает оба unit и включает timer. Он вызывает
wrapper в `:00` и `:30` каждого часа по часам systemd-хоста. `Persistent=true`
догоняет пропущенное календарное событие после активации timer, но не обеспечивает
проверки на выключенном сервере и не воспроизводит все пропущенные ticks.
`TZ=Europe/Moscow` в service задаёт окружение процесса, а не ежедневное окно
и не часовой пояс календаря timer. Прежний текст `daily` в поле Description
шаблона service не задаёт частоту; её определяет timer.

Wrapper принимает `--project-root`, `--env-file`, `--mode scheduled|force`
(также `--scheduled`/`--force`); по умолчанию scheduled. Env выбирается:
`--env-file` → `APP_ENV_FILE` → существующий `/etc/yuzhural-site/production.env`
→ `<project>/.env`. Wrapper проверяет работающий сервис `app` и выполняет
`docker compose exec -T app npm run import:price:scheduled`.
`PRICE_URL`, `PRICE_PAGE_URL`, `PRICE_DOWNLOAD_MAX_BYTES`, `SITE_URL`,
`VITE_SITE_URL`, `PRODUCT_PRERENDER_LIMIT`, `PRODUCT_PRERENDER_INCLUDE` и `TZ`
передаются wrapper явно; остальные настройки должны уже быть в окружении
контейнера. Изменение env-файла на хосте само по себе не обновляет окружение
уже работающего контейнера.

Ручная переобработка на сервере (с установкой данных):

```bash
./deploy/run-price-import.sh --project-root /opt/yuzhural-site \
  --env-file /etc/yuzhural-site/production.env --force
```

`--force` — параметр wrapper, а не `importPrice.js`; выбирает обычный npm-импорт
без `--if-changed`, не `--override-publish-guard`. При PRICE_URL/PRICE_PAGE_URL
выбирается `import:price:remote`, иначе `import:price`.

Серверная приёмка остаётся **T19**: нужны redacted effective units, состояние
и следующий запуск timer, journal нескольких ticks (изменение/unchanged/сбой и
восстановление), сохранность volume после restart и безопасное свидетельство
доставки отчёта. На этом этапе сервер, timer и реальная доставка не проверялись.

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

Перед деплоем проверьте, что в `./data/` есть прежние
`products.json` и `productRegistry.json` либо активный `catalog-current`.
Старые файлы используются до первого успешного импорта после обновления кода.
Импорт создаёт `./data/catalog-current` как symlink на полный выпуск; API и nginx
переключаются на него вместе. Nginx сначала отдаёт runtime HTML карточек из
`./data/catalog-current/public/product`, затем использует build-time fallback.

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
