// Файл настраивает Vite, React-плагин, dev-редиректы товаров, порядок stylesheet и proxy для API.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { CONTROL_CATEGORY_ALIASES } from './shared/controlCableClassification.js';

// Dev-зеркало для public/redirects.nginx.conf: читает redirects.json и
// 301-редиректит /product/<oldSlug> → /product/<newSlug> в vite-сервере.
// Прод-инстанс это делает через nginx include — эта обёртка нужна, чтобы
// в локальной разработке поведение совпадало.
function productRedirects() {
  const redirectsFile = path.resolve(process.cwd(), 'public/redirects.json');
  let cache = { mtime: 0, map: {} };
  function load() {
    try {
      const stat = fs.statSync(redirectsFile);
      if (stat.mtimeMs === cache.mtime) return cache.map;
      const raw = fs.readFileSync(redirectsFile, 'utf-8');
      cache = { mtime: stat.mtimeMs, map: JSON.parse(raw) || {} };
    } catch {
      cache = { mtime: 0, map: {} };
    }
    return cache.map;
  }
  return {
    name: 'product-redirects',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const categoryMatch = /^\/catalog\/([^/?#]+)\/?(\?.*)?$/.exec(url);
        const categoryTarget =
          categoryMatch && CONTROL_CATEGORY_ALIASES[categoryMatch[1]];
        if (categoryTarget) {
          res.statusCode = 301;
          res.setHeader(
            'Location',
            `/catalog/${categoryTarget}${categoryMatch[2] || ''}`
          );
          res.end();
          return;
        }
        const match = /^\/product\/([^/?#]+)/.exec(url);
        if (!match) return next();
        const target = load()[match[1]];
        if (!target) return next();
        const rest = url.slice(match[0].length);
        res.statusCode = 301;
        res.setHeader('Location', `/product/${target}${rest}`);
        res.end();
      });
    },
  };
}

export function runtimePriceMiddleware(root) {
  return async (req, res, next) => {
    if (
      (req.url || '').split('?')[0] !== '/price.xls' ||
      !['GET', 'HEAD'].includes(req.method)
    )
      return next();
    try {
      const buffer = await fs.promises.readFile(
        path.join(root, 'data/catalog-current/public/price.xls')
      );
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'no-store');
      res.end(req.method === 'HEAD' ? undefined : buffer);
    } catch (error) {
      if (error.code === 'ENOENT') return next();
      next(error);
    }
  };
}

function runtimePriceDownload() {
  let root;
  return {
    name: 'runtime-price-download',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(runtimePriceMiddleware(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(runtimePriceMiddleware(root));
    },
  };
}

export function moveStylesheetsBeforeModuleScripts(html) {
  return html.replace(/<head\b[^>]*>([\s\S]*?)<\/head>/i, (headMatch) => {
    const stylesheetTags = [];
    const headWithoutStylesheets = headMatch.replace(
      /^[ \t]*<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'][^"']+["'])[^>]*>[ \t]*(?:\r?\n)?/gim,
      (tag) => {
        stylesheetTags.push(tag.trimEnd());
        return '';
      }
    );

    if (stylesheetTags.length === 0) return headMatch;

    const moduleScriptPattern =
      /^[ \t]*<script\b(?=[^>]*\btype=["']module["'])[^>]*><\/script>[ \t]*$/im;
    if (!moduleScriptPattern.test(headWithoutStylesheets)) return headMatch;

    return headWithoutStylesheets
      .replace(/\n{3,}/g, '\n\n')
      .replace(moduleScriptPattern, (scriptTag) => {
        const indent = scriptTag.match(/^[ \t]*/)?.[0] || '';
        const styles = stylesheetTags
          .map((tag) => `${indent}${tag.trim()}`)
          .join('\n');
        return `${styles}\n${scriptTag}`;
      });
  });
}

function prioritizeStylesheets() {
  return {
    name: 'prioritize-stylesheets',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return moveStylesheetsBeforeModuleScripts(html);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimePriceDownload(),
    productRedirects(),
    prioritizeStylesheets(),
  ],
  build: {
    manifest: true,
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
});
