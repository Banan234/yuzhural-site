# Rollback Runbook

1. Проверьте последний state:

```bash
cat deploy/state/production-release.env
```

2. Если последний deploy уже сломал smoke или production, откатите на
   `LAST_GOOD_RELEASE_TAG`:

```bash
./deploy/rollback.sh --env-file /etc/yuzhural-site/production.env
```

3. Если нужно откатиться на конкретный release tag, передайте его явно:

```bash
./deploy/rollback.sh \
  --env-file /etc/yuzhural-site/production.env \
  --tag <previous-good-tag>
```

4. После rollback скрипт сам прогонит `deploy/post-deploy-smoke.sh` и обновит
   `deploy/state/production-release.env`. Если smoke не прошёл, откат считается
   неуспешным и state-файл не переключается на невалидный release.
