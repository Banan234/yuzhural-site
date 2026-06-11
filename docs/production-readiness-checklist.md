<!-- Быстрый operational runbook перед production release, сразу после deploy и для решения об откате. -->

# Production readiness checklist

Короткий runbook перед релизом и сразу после него. Подробности: [production env checklist](./production-env-checklist.md), [rollback runbook](../deploy/ROLLBACK.md).

## 1. Перед релизом

- Подготовьте приватный env на основе безопасного шаблона, не копируя в Git
  реальные секреты:
  ```bash
  sudo install -m 600 .env.production.example /etc/yuzhural-site/production.env
  sudoedit /etc/yuzhural-site/production.env
  ```
- Проверьте env и SMTP:
  ```bash
  npm run check:env -- --production --env-file /etc/yuzhural-site/production.env
  npm run check:env -- --production --env-file /etc/yuzhural-site/production.env --smtp-verify
  ```
- Убедитесь, что `SITE_URL` и `VITE_SITE_URL` совпадают с production public
  URL `https://yu-uek.ru` или актуальным доменом. `localhost`, private IP и
  tunnel URL для production не подходят.
- Если формы должны работать, проверьте `FORMS_ENABLED=true`,
  `FORMS_DELIVERY_MODE=smtp` и заполненные `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`, `QUOTE_TO_EMAIL`. Если формы временно отключены,
  явно задайте `FORMS_ENABLED=false`. `FORMS_DELIVERY_MODE=local_file`
  допустим только для dev/staging.
- Убедитесь, что `VK_CALLBACK_URL` указывает на стабильный публичный
  `https://<domain>/api/vk/callback`, без localhost и tunnel-доменов.
- Если VK bridge на этой production-среде намеренно отключён, задайте
  `VK_SMOKE_ALLOW_DISABLED=true`. Иначе post-deploy smoke будет требовать
  готовый `/api/vk/health?refresh=1`.
- Проверьте, что `INTERNAL_METRICS_TOKEN` задан: после deploy он обязателен
  для smoke-проверок `/api/runtime` и `/api/vk/health`.
- Убедитесь, что свежий импорт каталога собрал `sitemap.xml` и `robots.txt`, а runtime product prerender не сломан:
  ```bash
  npm run check:product-prerender
  ```

## 2. Сразу после деплоя

- Прогоните smoke:
  ```bash
  ./deploy/post-deploy-smoke.sh --env-file /etc/yuzhural-site/production.env
  ```
- Проверьте формы: `/api/forms/health` должен вернуть `ready`, либо `unavailable`, если формы на этой среде намеренно выключены.
- Проверьте runtime health: `/api/runtime` должен вернуть `ok: true`.
- Проверьте VK callback: smoke сам вызывает `/api/vk/health?refresh=1`. Для
  включённого bridge ответ должен быть `ok: true`, `status: "ready"` и
  production callback URL без tunnel-домена. Отключённый bridge допустим только
  при `VK_SMOKE_ALLOW_DISABLED=true` и явном статусе `unavailable`.
- Проверьте публичный URL руками: открываются главная, `sitemap.xml`, `robots.txt` и хотя бы одна product-страница с корректным prerender/meta.

## 3. Rollback conditions

- Откатывайте релиз, если public URL или `/api/health` не проходят smoke.
- Откатывайте релиз, если формы должны работать, но `/api/forms/health` не `ready` или тестовая заявка не доходит.
- Откатывайте релиз, если `/api/runtime` не `ok`, `/api/vk/health` не `ready`, VK callback URL неверный или callback перестал отвечать.
- Откатывайте релиз, если отсутствуют `sitemap.xml` или `robots.txt`, либо product prerender ломает карточки из sitemap.
- Команда отката:
  ```bash
  ./deploy/rollback.sh --env-file /etc/yuzhural-site/production.env
  ```
