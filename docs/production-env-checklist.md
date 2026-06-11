<!-- Краткий production checklist по env, preflight и post-deploy smoke-check для SMTP, VK callback и internal metrics. -->

# Production env checklist

Короткий preflight перед деплоем:

```bash
sudo install -m 600 .env.production.example /etc/yuzhural-site/production.env
sudoedit /etc/yuzhural-site/production.env
npm run check:env -- --production --env-file /etc/yuzhural-site/production.env
npm run check:env -- --production --env-file /etc/yuzhural-site/production.env --smtp-verify
```

`.env.production.example` безопасен для Git и содержит пустые секреты. Он
должен падать на preflight, пока в приватном production env не заполнены
обязательные значения.

## Site URL

- `SITE_URL` и `VITE_SITE_URL` должны быть заданы оба, совпадать и указывать на
  публичный `https://yu-uek.ru` или актуальный production-домен без слэша на
  конце.
- `http://localhost:*`, private IP, `.local` и tunnel-домены не подходят для
  production. `npm run check:env -- --production` проверяет это отдельно от VK.
- Эти значения попадают в sitemap/robots, canonical, Open Graph, JSON-LD и
  используются как fallback для `VK_CALLBACK_URL`.

Post-deploy smoke-check в compose-стеке:

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
docker compose exec app npm run check:env -- --smtp-verify
docker compose exec app curl -fsS http://127.0.0.1:3001/api/forms/health
docker compose exec app sh -lc 'curl -fsS -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" http://127.0.0.1:3001/api/runtime'
docker compose exec app sh -lc 'curl -fsS -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" "http://127.0.0.1:3001/api/vk/health?refresh=1"'
```

Автоматический `./deploy/post-deploy-smoke.sh` выполняет те же runtime/VK
проверки, если в env задан `INTERNAL_METRICS_TOKEN`.

Если после деплоя выполнялся runtime-импорт прайса, добавьте ещё:

```bash
npm run check:product-prerender
```

## SMTP forms

- `FORMS_DELIVERY_MODE=local_file` разрешён только для dev/staging. В
  production он запрещён, потому что заявки останутся в локальном outbox.
- Если формы нужны, держите `FORMS_ENABLED=true`,
  `FORMS_DELIVERY_MODE=smtp` и обязательно заполните `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`, `QUOTE_TO_EMAIL`.
- Для production preflight прогоняйте `--smtp-verify`: он делает тот же `transporter.verify()`, что и startup сервера.
- Если формы на среде не нужны, зафиксируйте `FORMS_ENABLED=false`. Это валидный режим, но `/api/quote` и `/api/lead-request` в нём намеренно возвращают `503`.
- Smoke-check после деплоя:

```bash
docker compose exec app curl -fsS http://127.0.0.1:3001/api/forms/health
```

- Ожидаемый ответ при включённых формах:

```json
{ "ok": true, "status": "ready" }
```

- Ожидаемый ответ при намеренно отключённых формах:

```json
{ "ok": false, "status": "unavailable" }
```

## VK callback

- Для рабочего VK bridge должны быть заданы `VK_COMMUNITY_ACCESS_TOKEN`, `VK_MANAGER_PEER_ID`, `VK_CALLBACK_SECRET`.
- Если VK bridge на этой production-среде намеренно отключён, зафиксируйте
  это явно: оставьте `VK_COMMUNITY_ACCESS_TOKEN`/`VK_MANAGER_PEER_ID` пустыми и
  задайте `VK_SMOKE_ALLOW_DISABLED=true`. Без этого флага post-deploy smoke
  будет требовать готовый VK bridge.
- `VK_CALLBACK_URL` должен вести на стабильный публичный
  `https://<domain>/api/vk/callback`. Tunnel URL (`ngrok`, `trycloudflare`,
  `loca.lt`), localhost и private IP для production не подходят.
- Если `VK_CALLBACK_URL` не задаётся явно, проверьте, что `SITE_URL` и
  `VITE_SITE_URL` совпадают, публичные, используют `https` и из них корректно
  собирается callback URL.
- Для ручной схемы должен быть задан `VK_CALLBACK_CONFIRMATION_TOKEN`. Для auto-config допустимо вместо этого включить `VK_CALLBACK_AUTO_CONFIGURE=true` и задать `VK_GROUP_ID`.
- Scope community token невозможно проверить offline. После деплоя подтверждайте его через `/api/vk/health?refresh=1`: если scope недостаточен для Callback API, автосинхронизация не выполнится.
- Smoke-check после деплоя:

```bash
docker compose exec app sh -lc 'curl -fsS -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" "http://127.0.0.1:3001/api/vk/health?refresh=1"'
```

- Ожидаемый ответ для включённого VK bridge: `"ok": true`,
  `"status": "ready"`, `vk.callback.url` совпадает с production callback URL,
  `vk.callback.publicEndpoint.operationalRisk` равен `low`.
- Если VK bridge намеренно отключён, `./deploy/post-deploy-smoke.sh` допускает
  только `"ok": false`, `"status": "unavailable"` и только при
  `VK_SMOKE_ALLOW_DISABLED=true`.

## Internal metrics

- Задайте `INTERNAL_METRICS_TOKEN` вне репозитория. Без него недоступны `/api/runtime`, `/api/vk/health` и браузерная страница `/internal/runtime`.
- `INTERNAL_METRICS_TOKEN` обязателен для production post-deploy smoke: через
  него проверяются runtime health и VK diagnostics без раскрытия секретов наружу.
- Smoke-check после деплоя:

```bash
docker compose exec app sh -lc 'curl -fsS -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" http://127.0.0.1:3001/api/runtime'
```

- Дополнительная проверка, что endpoint не открыт без токена:

```bash
docker compose exec app sh -lc 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/runtime'
```

- Ожидаемо без токена должен вернуться `404`, а с токеном JSON со статусом `ok: true`.
