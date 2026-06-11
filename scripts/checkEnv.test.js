// Файл проверяет CLI-preflight env readiness для SMTP, VK callback и internal metrics.

import { describe, expect, it, vi } from 'vitest';
import {
  evaluateEnvReadiness,
  formatEnvReadinessReport,
  loadCheckEnvDotenv,
  parseCheckEnvArgs,
} from './checkEnv.js';

function findSection(report, key) {
  return report.sections.find((section) => section.key === key);
}

describe('parseCheckEnvArgs', () => {
  it('parses production, env file and smtp verify flags', () => {
    expect(
      parseCheckEnvArgs([
        '--production',
        '--env-file',
        '/etc/yuzhural-site/production.env',
        '--smtp-verify',
      ])
    ).toEqual({
      envFile: '/etc/yuzhural-site/production.env',
      forceProduction: true,
      smtpVerify: true,
      help: false,
    });
  });
});

describe('loadCheckEnvDotenv', () => {
  it('loads the project .env by default with override enabled', () => {
    const config = vi.fn();

    loadCheckEnvDotenv({}, { config });

    expect(config).toHaveBeenCalledWith({
      path: expect.stringMatching(/[\\/]yuzhural-site[\\/]\.env$/),
      override: true,
    });
  });

  it('uses explicit env file with override enabled', () => {
    const config = vi.fn();

    loadCheckEnvDotenv({ envFile: './tmp/production.env' }, { config });

    expect(config).toHaveBeenCalledWith({
      path: expect.stringMatching(/[\\/]tmp[\\/]production\.env$/),
      override: true,
    });
  });
});

describe('evaluateEnvReadiness', () => {
  it('fails production readiness when SMTP and internal metrics are missing', async () => {
    const report = await evaluateEnvReadiness({
      env: {
        FORMS_ENABLED: 'true',
      },
      forceProduction: true,
    });

    expect(report.ok).toBe(false);
    expect(findSection(report, 'smtp_forms')).toMatchObject({
      status: 'fail',
    });
    expect(findSection(report, 'internal_metrics')).toMatchObject({
      status: 'fail',
    });
  });

  it('passes with verified SMTP, stable VK callback and internal metrics token', async () => {
    const mailTransporter = {
      verify: vi.fn().mockResolvedValue(true),
    };

    const report = await evaluateEnvReadiness({
      env: {
        NODE_ENV: 'production',
        FORMS_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: 'mailer@example.test',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'ЮУЭК <mailer@example.test>',
        QUOTE_TO_EMAIL: 'sales@example.test',
        INTERNAL_METRICS_TOKEN: 'runtime-secret',
        SITE_URL: 'https://yu-uek.ru',
        VITE_SITE_URL: 'https://yu-uek.ru',
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirm',
        VK_CALLBACK_URL: 'https://yu-uek.ru/api/vk/callback',
      },
      smtpVerify: true,
      mailTransporter,
    });

    expect(report.ok).toBe(true);
    expect(mailTransporter.verify).toHaveBeenCalledTimes(1);
    expect(findSection(report, 'smtp_forms')).toMatchObject({
      status: 'pass',
    });
    expect(findSection(report, 'site_url')).toMatchObject({
      status: 'pass',
    });
    expect(findSection(report, 'vk_callback')).toMatchObject({
      status: 'pass',
    });
    expect(findSection(report, 'internal_metrics')).toMatchObject({
      status: 'pass',
    });
  });

  it('passes in development with local_file delivery mode and runtime token', async () => {
    const report = await evaluateEnvReadiness({
      env: {
        NODE_ENV: 'development',
        FORMS_ENABLED: 'true',
        FORMS_DELIVERY_MODE: 'local_file',
        INTERNAL_METRICS_TOKEN: 'runtime-secret',
      },
      smtpVerify: true,
    });

    expect(report.ok).toBe(true);
    expect(findSection(report, 'smtp_forms')).toMatchObject({
      status: 'pass',
    });
  });

  it('fails VK readiness for tunnel callback URLs', async () => {
    const report = await evaluateEnvReadiness({
      env: {
        NODE_ENV: 'production',
        FORMS_ENABLED: 'false',
        INTERNAL_METRICS_TOKEN: 'runtime-secret',
        SITE_URL: 'https://yu-uek.ru',
        VITE_SITE_URL: 'https://yu-uek.ru',
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirm',
        VK_CALLBACK_URL: 'https://demo.trycloudflare.com/api/vk/callback',
      },
    });

    expect(report.ok).toBe(false);
    expect(findSection(report, 'vk_callback')).toMatchObject({
      status: 'fail',
    });
  });

  it('fails production readiness for localhost site URLs even when VK is disabled', async () => {
    const report = await evaluateEnvReadiness({
      env: {
        NODE_ENV: 'production',
        FORMS_ENABLED: 'false',
        INTERNAL_METRICS_TOKEN: 'runtime-secret',
        SITE_URL: 'http://localhost:5173',
        VITE_SITE_URL: 'http://localhost:5173',
      },
    });

    expect(report.ok).toBe(false);
    expect(findSection(report, 'site_url')).toMatchObject({
      status: 'fail',
    });
  });
});

describe('formatEnvReadinessReport', () => {
  it('renders a readable report header', async () => {
    const report = await evaluateEnvReadiness({
      env: {
        NODE_ENV: 'production',
        FORMS_ENABLED: 'false',
        INTERNAL_METRICS_TOKEN: 'runtime-secret',
        SITE_URL: 'https://yu-uek.ru',
        VITE_SITE_URL: 'https://yu-uek.ru',
      },
    });

    expect(formatEnvReadinessReport(report)).toContain(
      'Env readiness: PASS (NODE_ENV=production)'
    );
  });
});
