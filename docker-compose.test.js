// Файл проверяет docker-compose конфигурации на корректные сервисы, переменные и связи контейнеров.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function extractTopLevelBlock(source, key) {
  const lines = source.split('\n');
  const startIndex = lines.findIndex((line) => line === `  ${key}:`);

  if (startIndex === -1) {
    return '';
  }

  const blockLines = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (/^  \S/.test(line)) {
      break;
    }

    blockLines.push(line);
  }

  return blockLines.join('\n');
}

function expectOptionalEnvFile(serviceBlock, envFilePathExpression) {
  expect(serviceBlock).toContain('env_file:');
  expect(serviceBlock).toContain(`path: ${envFilePathExpression}`);
  expect(serviceBlock).toContain('required: false');
}

describe('docker-compose.yml', () => {
  it('tags production images with DEPLOY_TAG for rollback', () => {
    const source = readFileSync('docker-compose.yml', 'utf8');
    const appBlock = extractTopLevelBlock(source, 'app');
    const webBlock = extractTopLevelBlock(source, 'web');

    expect(appBlock).toContain(
      'image: ${APP_IMAGE:-yuzhural-site-app}:${DEPLOY_TAG:-latest}'
    );
    expect(webBlock).toContain(
      'image: ${WEB_IMAGE:-yuzhural-site-web}:${DEPLOY_TAG:-latest}'
    );
    expect(webBlock).toContain(
      'VITE_SENTRY_RELEASE: ${VITE_SENTRY_RELEASE:-${DEPLOY_TAG:-latest}}'
    );
  });

  it('persists runtime catalog data on the host', () => {
    const source = readFileSync('docker-compose.yml', 'utf8');
    const appBlock = extractTopLevelBlock(source, 'app');
    const webBlock = extractTopLevelBlock(source, 'web');

    expectOptionalEnvFile(appBlock, '${APP_ENV_FILE:-.env}');
    expect(appBlock).toContain('volumes:');
    expect(appBlock).toContain('- ./data:/app/data');
    expect(appBlock).toContain('PUBLIC_ARTIFACTS_DIR: /app/data/public');
    expect(webBlock).toContain('volumes:');
    expect(webBlock).toContain('- ./data:/usr/share/nginx/runtime-data:ro');
  });

  it('copies shared modules and the build template into the runtime image', () => {
    const source = readFileSync('Dockerfile', 'utf8');

    expect(source).toContain('COPY shared ./shared');
    expect(source).toContain(
      'COPY --from=build /home/node/app/dist/index.html ./dist/index.html'
    );
  });

  it('uses curl for web healthcheck', () => {
    const source = readFileSync('docker-compose.yml', 'utf8');
    const webBlock = extractTopLevelBlock(source, 'web');

    expect(webBlock).toContain(
      "test: ['CMD', 'curl', '-fsS', 'http://127.0.0.1/healthz']"
    );
    expect(webBlock).not.toContain('wget');
  });
});

describe('docker-compose.staging.yml', () => {
  it('defines an isolated staging stack', () => {
    const source = readFileSync('docker-compose.staging.yml', 'utf8');
    const appBlock = extractTopLevelBlock(source, 'app');
    const webBlock = extractTopLevelBlock(source, 'web');

    expect(appBlock).toContain('container_name: yuzhural-staging-app');
    expectOptionalEnvFile(appBlock, '${STAGING_ENV_FILE:-.env.staging}');
    expect(appBlock).toContain('- ./data-staging:/app/data');
    expect(appBlock).toContain('PUBLIC_ARTIFACTS_DIR: /app/data/public');
    expect(appBlock).toContain(
      'TRUSTED_PROXY_IPS: ${TRUSTED_PROXY_IPS:-172.31.0.10}'
    );
    expect(appBlock).toContain(
      'image: ${APP_IMAGE:-yuzhural-site-app}:${STAGING_DEPLOY_TAG:-staging}'
    );

    expect(webBlock).toContain('container_name: yuzhural-staging-web');
    expect(webBlock).toContain(
      "- '${STAGING_HTTP_BIND:-127.0.0.1}:${STAGING_HTTP_PORT:-8080}:80'"
    );
    expect(webBlock).toContain(
      '- ./data-staging:/usr/share/nginx/runtime-data:ro'
    );
    expect(webBlock).toContain(
      'VITE_SITE_URL: ${STAGING_SITE_URL:-http://localhost:8080}'
    );
    expect(webBlock).toContain('VITE_SENTRY_ENVIRONMENT: staging');
    expect(webBlock).toContain(
      'image: ${WEB_IMAGE:-yuzhural-site-web}:${STAGING_DEPLOY_TAG:-staging}'
    );
  });
});
