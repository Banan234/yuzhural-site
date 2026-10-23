// Файл проверяет Dockerfile на ожидаемые стадии сборки, команды, права пользователя и production-настройки.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const NON_ROOT_NODE_STAGES = new Set(['deps', 'build', 'prod-deps']);

function parseDockerfileStages(source) {
  const stages = [];
  let currentStage = null;
  let currentUser = 'root';

  source.split('\n').forEach((line, index) => {
    const trimmedLine = line.trim();
    const fromMatch = trimmedLine.match(/^FROM\s+\S+\s+AS\s+(\S+)/i);

    if (fromMatch) {
      currentStage = {
        name: fromMatch[1],
        instructions: [],
      };
      stages.push(currentStage);
      currentUser = 'root';
      return;
    }

    if (!currentStage) return;

    const userMatch = trimmedLine.match(/^USER\s+(\S+)/i);
    if (userMatch) {
      currentUser = userMatch[1];
    }

    currentStage.instructions.push({
      line: index + 1,
      text: trimmedLine,
      user: currentUser,
    });
  });

  return stages;
}

describe('Dockerfile', () => {
  it('runs dependency and build stage instructions as node user', () => {
    const source = readFileSync('Dockerfile', 'utf8');
    const failures = [];

    for (const stage of parseDockerfileStages(source)) {
      if (!NON_ROOT_NODE_STAGES.has(stage.name)) continue;

      for (const instruction of stage.instructions) {
        if (/^(RUN|COPY)\b/.test(instruction.text)) {
          if (instruction.user !== 'node') {
            failures.push(
              `${stage.name}:${instruction.line} ${instruction.text} runs as ${instruction.user}`
            );
          }
        }

        if (/^COPY\b/.test(instruction.text)) {
          if (!instruction.text.includes('--chown=node:node')) {
            failures.push(
              `${stage.name}:${instruction.line} ${instruction.text} must use --chown=node:node`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('uses an installed HTTP client for web healthcheck', () => {
    const source = readFileSync('Dockerfile', 'utf8');
    const webStage = source.slice(
      source.indexOf('FROM nginx:1.27-alpine AS web')
    );

    expect(webStage).toContain('RUN apk add --no-cache curl');
    expect(webStage).toContain(
      'CMD curl -fsS http://127.0.0.1/healthz || exit 1'
    );
    expect(webStage).not.toMatch(/\bwget\b/);
  });

  it('builds and loads nginx hardening and brotli dynamic modules', () => {
    const source = readFileSync('Dockerfile', 'utf8');

    expect(source).toContain('FROM nginx:1.27-alpine AS brotli-builder');
    expect(source).toContain(
      'curl -fsSL -o nginx.tar.gz "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz"'
    );
    expect(source).toContain(
      'git clone --recursive --depth=1 https://github.com/google/ngx_brotli.git'
    );
    expect(source).toContain(
      'git clone --depth=1 https://github.com/openresty/headers-more-nginx-module.git'
    );
    expect(source).toContain(
      'cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF ..;'
    );
    expect(source).toContain(
      'cmake --build . --config Release --target brotlienc;'
    );
    expect(source).toContain(
      './configure --with-compat --add-dynamic-module=/tmp/ngx_brotli --add-dynamic-module=/tmp/headers-more-nginx-module'
    );
    expect(source).toContain('make modules');
    expect(source).toContain(
      'COPY --from=brotli-builder /tmp/nginx-modules/ /etc/nginx/modules/'
    );
    expect(source).toContain(
      "echo 'load_module modules/ngx_http_brotli_filter_module.so;'"
    );
    expect(source).toContain(
      "echo 'load_module modules/ngx_http_brotli_static_module.so;'"
    );
    expect(source).toContain(
      "echo 'load_module modules/ngx_http_headers_more_filter_module.so;'"
    );
    expect(source).not.toContain('nginx-mod-http-brotli');
  });

  it('accepts build-time frontend environment for release-specific images', () => {
    const source = readFileSync('Dockerfile', 'utf8');
    const buildStage = source.slice(
      source.indexOf('FROM node:20-slim AS build')
    );

    for (const argName of [
      'SITE_URL',
      'VITE_SITE_URL',
      'VITE_YANDEX_METRIKA_ID',
      'VITE_SENTRY_DSN',
      'VITE_SENTRY_ENVIRONMENT',
      'VITE_SENTRY_RELEASE',
      'VITE_SENTRY_TRACES_SAMPLE_RATE',
    ]) {
      expect(buildStage).toContain(`ARG ${argName}`);
      expect(buildStage).toContain(`${argName}=$${argName}`);
    }
  });

  it('ships src/lib helpers in the runtime image for price import prerender', () => {
    const source = readFileSync('Dockerfile', 'utf8');
    const runtimeStage = source.slice(
      source.indexOf('FROM node:20-slim AS runtime'),
      source.indexOf('FROM nginx:1.27-alpine AS brotli-builder')
    );

    expect(runtimeStage).toContain('COPY src/lib ./src/lib');
    expect(runtimeStage).toContain('COPY scripts ./scripts');
    expect(runtimeStage).toContain('COPY shared ./shared');
    expect(runtimeStage).toContain(
      'COPY --from=build /home/node/app/dist/index.html ./dist/index.html'
    );
  });
});
