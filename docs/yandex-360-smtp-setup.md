<!-- Пошаговая инструкция по подключению боевого SMTP через Яндекс 360 для форм сайта. -->

# Yandex 360 SMTP setup

Этот проект уже умеет работать с обычным SMTP через `nodemailer`. Для
production-форм самый прямой сценарий — корпоративный ящик в `Yandex 360`,
например `sale@yourdomain.ru`, и **пароль приложения**.

Что можно сделать в коде:

- backend уже поддерживает SMTP;
- `check:env` умеет проверять production env;
- `post-deploy-smoke.sh` умеет проверять `/api/forms/health`.

Что нужно сделать руками:

- подключить домен к `Yandex 360`;
- создать корпоративный ящик;
- включить двухфакторную аутентификацию;
- выпустить app password;
- заполнить приватный production env-файл.

## 1. Что подготовить заранее

- боевой домен сайта, например `yu-uek.ru`;
- доступ к DNS-записям домена;
- доступ к админке `Yandex 360`;
- production env-файл вне репозитория, например
  `/etc/yuzhural-site/production.env`.

## 2. Подключить домен к Yandex 360

1. Войдите в админку `Yandex 360`.
2. Добавьте домен компании.
3. Подтвердите владение доменом одним из способов Yandex.
4. Настройте DNS-записи, которые требует Yandex для доменной почты.

Проверьте после этого, что доменная почта реально активна, а не только
добавлена в интерфейсе.

## 3. Создать ящик для заявок

Рекомендуемый вариант:

- `sale@yourdomain.ru` или `orders@yourdomain.ru`

Используйте именно отдельный рабочий ящик для заявок, а не личную почту
сотрудника.

## 4. Включить 2FA и выпустить app password

Для SMTP в Яндексе нужен **пароль приложения**, обычный пароль почтового ящика
для такого сценария использовать не надо.

1. Включите двухфакторную аутентификацию для этого аккаунта.
2. Создайте отдельный пароль приложения для SMTP/почтового клиента.
3. Сохраните его в безопасное место: второй раз целиком он может не
   показываться.

## 5. Заполнить production env

Основа:

```bash
sudo install -m 600 .env.production.example /etc/yuzhural-site/production.env
sudoedit /etc/yuzhural-site/production.env
```

Готовый блок под `Yandex 360`:

```env
FORMS_ENABLED=true
FORMS_DELIVERY_MODE=smtp
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sale@yourdomain.ru
SMTP_PASS=<yandex app password>
SMTP_FROM="ООО ЮжУралЭлектроКабель <sale@yourdomain.ru>"
QUOTE_TO_EMAIL=sale@yourdomain.ru
SMTP_POOL=true
SMTP_POOL_MAX_CONNECTIONS=2
SMTP_POOL_MAX_MESSAGES=100
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=20000
SMTP_SEND_RETRIES=1
SMTP_RETRY_DELAY_MS=750
```

Дополнительно обязательно заполните:

```env
SITE_URL=https://yourdomain.ru
VITE_SITE_URL=https://yourdomain.ru
INTERNAL_METRICS_TOKEN=<long-random-token>
APP_ENV_FILE=/etc/yuzhural-site/production.env
```

Сгенерировать токен можно так:

```bash
openssl rand -hex 32
```

## 6. Что должно совпадать

- `SMTP_USER` и адрес в `SMTP_FROM` должны быть одним и тем же ящиком или его
  корректным алиасом.
- `QUOTE_TO_EMAIL` обычно лучше делать тем же адресом, что и `SMTP_USER`, чтобы
  упростить доставляемость и диагностику.
- `SITE_URL` и `VITE_SITE_URL` должны совпадать.

## 7. Проверить env до деплоя

Проверка структуры env:

```bash
npm run check:env -- --production --env-file /etc/yuzhural-site/production.env
```

Проверка реального SMTP-подключения:

```bash
npm run check:env -- --production --env-file /etc/yuzhural-site/production.env --smtp-verify
```

Ожидаемо оба прогона должны завершиться успешно.

## 8. Деплой и smoke-check

```bash
./deploy/deploy-release.sh \
  --env-file /etc/yuzhural-site/production.env \
  --tag "$(date +%Y%m%d%H%M)-$(git rev-parse --short HEAD)"
```

Отдельный smoke:

```bash
./deploy/post-deploy-smoke.sh --env-file /etc/yuzhural-site/production.env
```

Ручная проверка формы:

```bash
curl -fsS http://127.0.0.1:3001/api/forms/health
```

Ожидаемо:

```json
{"ok":true,"status":"ready"}
```

## 9. Проверить реальную отправку письма

Пример тестовой короткой заявки:

```bash
curl -X POST http://127.0.0.1:3001/api/lead-request \
  -H 'content-type: application/json' \
  -d '{
    "phone":"+79001234567",
    "comment":"Проверка Yandex 360 SMTP",
    "source":"manual smoke",
    "createdAt":"2026-06-11 12:00:00",
    "rendered_at":1710000000000,
    "submit_at":1710000003000,
    "company_website":""
  }'
```

Пример тестового запроса КП:

```bash
curl -X POST http://127.0.0.1:3001/api/quote \
  -H 'content-type: application/json' \
  -d '{
    "customer":{"name":"Test","phone":"+79991112233"},
    "items":[{"title":"ВВГнг 3х2.5","quantity":100,"unit":"м","price":120}]
  }'
```

## 10. Если что-то не работает

- `check:env --smtp-verify` падает:
  - чаще всего неверный app password;
  - либо 2FA не включена;
  - либо `SMTP_USER`/`SMTP_FROM` не совпадают;
  - либо SMTP снаружи недоступен по сети.
- `/api/forms/health` возвращает `503`:
  - проверьте `FORMS_ENABLED=true`;
  - проверьте SMTP-блок;
  - проверьте логи backend.
- письма уходят, но не приходят:
  - проверьте папку spam;
  - проверьте, что `QUOTE_TO_EMAIL` существует;
  - проверьте DNS домена и настройки доменной почты в Yandex 360.

## 11. Что я не могу сделать за тебя

- создать или оплатить аккаунт `Yandex 360`;
- подтвердить владение доменом;
- настроить DNS у регистратора;
- создать app password;
- ввести реальные SMTP-секреты в production env;
- проверить фактическую доставку в твой боевой почтовый ящик без доступа к нему.
