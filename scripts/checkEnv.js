// Файл запускает короткий production-ready preflight по env для SMTP, VK callback и internal metrics.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV_FILE = path.resolve(SCRIPT_DIR, '..', '.env');

let moduleCachePromise = null;

async function loadRuntimeModules() {
  if (!moduleCachePromise) {
    moduleCachePromise = Promise.all([
      import('../server.js'),
      import('../lib/vkChat.js'),
    ]).then(([serverModule, vkModule]) => ({
      ...serverModule,
      ...vkModule,
    }));
  }

  return moduleCachePromise;
}

function normalizeNodeEnv(value) {
  return String(value || '').trim() || 'development';
}

function getUsageText() {
  return [
    'Usage: node scripts/checkEnv.js [--production] [--smtp-verify] [--env-file /path/to/file]',
    '',
    'Options:',
    '  --production   force NODE_ENV=production for validation rules',
    '  --smtp-verify  run transporter.verify() when forms are enabled',
    '  --env-file     load this env file instead of the default local .env',
    '  --help         show this message',
  ].join('\n');
}

export function parseCheckEnvArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: null,
    forceProduction: false,
    smtpVerify: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim();
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--production') {
      options.forceProduction = true;
      continue;
    }

    if (arg === '--smtp-verify') {
      options.smtpVerify = true;
      continue;
    }

    if (arg === '--env-file') {
      const value = String(argv[index + 1] || '').trim();
      if (!value) {
        throw new Error('--env-file requires a path');
      }
      options.envFile = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function loadCheckEnvDotenv(
  { envFile = null } = {},
  { config = dotenv.config } = {}
) {
  if (envFile) {
    return config({
      path: path.resolve(envFile),
      override: true,
    });
  }

  return config({
    path: DEFAULT_ENV_FILE,
    override: true,
  });
}

function pushDetail(details, value) {
  if (value) {
    details.push(value);
  }
}

function summarizeSectionStatus(items) {
  if (items.some((item) => item.status === 'fail')) return 'fail';
  if (items.some((item) => item.status === 'warn')) return 'warn';
  return 'pass';
}

function formatSectionStatus(status) {
  if (status === 'pass') return 'PASS';
  if (status === 'warn') return 'WARN';
  return 'FAIL';
}

function createSection({ key, title, status, details }) {
  return {
    key,
    title,
    status,
    details: [...details],
  };
}

function readEnvValue(env, key) {
  return String(env[key] || '').trim();
}

function describePublicUrl(value) {
  if (!value) {
    return {
      configured: false,
      exposure: 'missing',
      isHttps: false,
      isStablePublicEntryPoint: false,
    };
  }

  try {
    const url = new URL(value);
    const hostname = String(url.hostname || '')
      .trim()
      .toLowerCase();
    const isHttps = url.protocol === 'https:';
    const isLoopbackHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local');
    const isPrivateIpv4 =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    const tunnelProvider = hostname.endsWith('.loca.lt')
      ? 'localtunnel'
      : hostname.endsWith('.trycloudflare.com')
        ? 'cloudflared'
        : hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.ngrok.io')
          ? 'ngrok'
          : null;
    const exposure = tunnelProvider
      ? 'tunnel'
      : isLoopbackHost || isPrivateIpv4
        ? 'private'
        : isHttps
          ? 'public'
          : 'insecure_public';

    return {
      configured: true,
      url: value,
      hostname,
      exposure,
      isHttps,
      tunnelProvider,
      isStablePublicEntryPoint: exposure === 'public',
    };
  } catch {
    return {
      configured: false,
      url: value,
      exposure: 'invalid',
      isHttps: false,
      isStablePublicEntryPoint: false,
    };
  }
}

export async function evaluateEnvReadiness({
  env = process.env,
  forceProduction = false,
  smtpVerify = false,
  mailTransporter,
} = {}) {
  const runtimeEnv = {
    ...env,
    NODE_ENV: forceProduction ? 'production' : normalizeNodeEnv(env.NODE_ENV),
  };
  const {
    createVkChatBridge,
    getFormsDiagnostic,
    initializeFormsForStartup,
    validateFormsEnv,
    validateSiteUrlEnv,
    validateVkEnv,
  } = await loadRuntimeModules();

  const sections = [];
  const isProduction = runtimeEnv.NODE_ENV === 'production';

  const siteDetails = [];
  let siteStatus = 'pass';
  const siteUrlRaw = readEnvValue(runtimeEnv, 'SITE_URL');
  const viteSiteUrlRaw = readEnvValue(runtimeEnv, 'VITE_SITE_URL');
  let siteValidation = null;
  let siteValidationError = null;

  pushDetail(siteDetails, `SITE_URL=${siteUrlRaw || '(empty)'}`);
  pushDetail(siteDetails, `VITE_SITE_URL=${viteSiteUrlRaw || '(empty)'}`);

  try {
    siteValidation = validateSiteUrlEnv(runtimeEnv);
  } catch (error) {
    siteStatus = 'fail';
    siteValidationError = error;
    pushDetail(siteDetails, error.message);
  }

  if (!siteValidationError) {
    if (isProduction && (!siteUrlRaw || !viteSiteUrlRaw)) {
      siteStatus = 'fail';
      pushDetail(
        siteDetails,
        'Для production задайте оба значения: SITE_URL и VITE_SITE_URL.'
      );
    }

    if (isProduction) {
      const publicSiteUrl = describePublicUrl(siteValidation?.siteUrl || '');
      if (!publicSiteUrl.configured) {
        siteStatus = 'fail';
        pushDetail(
          siteDetails,
          'Production canonical URL не задан или некорректен.'
        );
      } else if (!publicSiteUrl.isStablePublicEntryPoint) {
        siteStatus = 'fail';
        pushDetail(
          siteDetails,
          `Production canonical URL должен быть стабильным публичным https URL; exposure=${publicSiteUrl.exposure}.`
        );
      } else {
        pushDetail(
          siteDetails,
          `Production canonical URL публичный и стабильный: ${publicSiteUrl.url}.`
        );
      }
    } else {
      pushDetail(
        siteDetails,
        siteValidation?.siteUrl
          ? `Canonical URL: ${siteValidation.siteUrl}.`
          : 'Canonical URL не задан; для production задайте SITE_URL и VITE_SITE_URL.'
      );
    }
  }

  sections.push(
    createSection({
      key: 'site_url',
      title: 'Site URL',
      status: siteStatus,
      details: siteDetails,
    })
  );

  const formsDiagnostic = getFormsDiagnostic(runtimeEnv);
  const formsDetails = [];
  let formsStatus = 'pass';

  pushDetail(
    formsDetails,
    `FORMS_ENABLED=${formsDiagnostic.formsEnabled ? 'true' : 'false'}`
  );
  pushDetail(
    formsDetails,
    `FORMS_DELIVERY_MODE=${formsDiagnostic.deliveryMode}`
  );

  if (!formsDiagnostic.formsEnabled) {
    formsStatus = 'warn';
    pushDetail(
      formsDetails,
      'Формы отключены намеренно; /api/quote и /api/lead-request будут отвечать 503.'
    );
  } else {
    try {
      validateFormsEnv(runtimeEnv);
      pushDetail(
        formsDetails,
        formsDiagnostic.deliveryMode === 'local_file'
          ? `Локальный outbox включён: ${formsDiagnostic.localOutboxDir}.`
          : 'SMTP-конфиг заполнен.'
      );
    } catch (error) {
      formsStatus = 'fail';
      pushDetail(formsDetails, error.message);
    }

    if (
      formsDiagnostic.deliveryMode === 'smtp' &&
      formsDiagnostic.missing.length > 0
    ) {
      formsStatus = 'fail';
      pushDetail(
        formsDetails,
        `Не заполнены: ${formsDiagnostic.missing.join(', ')}.`
      );
    }

    if (formsStatus !== 'fail' && smtpVerify) {
      try {
        const { diagnostic } = await initializeFormsForStartup({
          env: runtimeEnv,
          mailTransporter,
        });
        if (diagnostic.deliveryVerified === true) {
          pushDetail(
            formsDetails,
            formsDiagnostic.deliveryMode === 'local_file'
              ? 'Local outbox ready.'
              : 'SMTP verify прошёл.'
          );
        } else {
          formsStatus = 'fail';
          pushDetail(
            formsDetails,
            formsDiagnostic.deliveryMode === 'local_file'
              ? 'Local outbox не прошёл проверку.'
              : 'SMTP verify не прошёл.'
          );
        }
      } catch (error) {
        formsStatus = 'fail';
        pushDetail(formsDetails, error.message);
      }
    } else if (formsStatus !== 'fail') {
      pushDetail(
        formsDetails,
        formsDiagnostic.deliveryMode === 'local_file'
          ? 'Проверка local outbox пропущена; для preflight файловой записи используйте --smtp-verify.'
          : 'SMTP verify пропущен; для preflight connectivity используйте --smtp-verify.'
      );
    }
  }

  sections.push(
    createSection({
      key: 'smtp_forms',
      title: 'SMTP forms',
      status: formsStatus,
      details: formsDetails,
    })
  );

  const vkBridge = createVkChatBridge({ env: runtimeEnv });
  const vkSnapshot = vkBridge.getStatusSnapshot();
  const publicEndpoint = vkSnapshot.callback?.publicEndpoint || {};
  const vkChecks = [];

  let vkValidationError = null;
  let vkValidation = null;
  try {
    vkValidation = validateVkEnv(runtimeEnv);
  } catch (error) {
    vkValidationError = error;
  }

  vkChecks.push({
    status: vkSnapshot.enabled ? 'pass' : 'warn',
    detail: `VK bridge ${vkSnapshot.enabled ? 'enabled' : 'disabled'}.`,
  });

  if (!vkSnapshot.enabled) {
    vkChecks.push({
      status: 'warn',
      detail:
        'Уведомления менеджеру и callback-ответы из VK отключены, пока не заданы VK_COMMUNITY_ACCESS_TOKEN и VK_MANAGER_PEER_ID.',
    });
  } else {
    if (vkValidationError) {
      vkChecks.push({ status: 'fail', detail: vkValidationError.message });
    }

    if (siteValidationError) {
      vkChecks.push({ status: 'fail', detail: siteValidationError.message });
    }

    if (!vkSnapshot.callback?.url) {
      vkChecks.push({
        status: 'fail',
        detail:
          'Не удалось определить callback URL; задайте VK_CALLBACK_URL или согласованные SITE_URL/VITE_SITE_URL.',
      });
    } else {
      vkChecks.push({
        status:
          publicEndpoint.exposure === 'public' && publicEndpoint.isHttps
            ? 'pass'
            : 'fail',
        detail: `Callback URL: ${vkSnapshot.callback.url}`,
      });
      vkChecks.push({
        status:
          publicEndpoint.exposure === 'public' && publicEndpoint.isHttps
            ? 'pass'
            : 'fail',
        detail: `Public exposure: ${publicEndpoint.exposure || 'unknown'}.`,
      });
    }

    if (!vkSnapshot.callback?.secretRequired) {
      vkChecks.push({
        status: 'fail',
        detail:
          'VK_CALLBACK_ALLOW_INSECURE=true не подходит для production-ready конфигурации.',
      });
    } else {
      vkChecks.push({
        status: 'pass',
        detail: 'VK callback secret required.',
      });
    }

    if (
      !vkSnapshot.callback?.confirmationTokenConfigured &&
      !vkSnapshot.callback?.autoConfigureEnabled
    ) {
      vkChecks.push({
        status: 'fail',
        detail:
          'Нет confirmation token: задайте VK_CALLBACK_CONFIRMATION_TOKEN или включите VK_CALLBACK_AUTO_CONFIGURE.',
      });
    } else if (
      !vkSnapshot.callback?.confirmationTokenConfigured &&
      vkSnapshot.callback?.autoConfigureEnabled
    ) {
      vkChecks.push({
        status: 'pass',
        detail:
          'Confirmation token будет получен на старте через VK callback auto-config.',
      });
    } else {
      vkChecks.push({
        status: 'pass',
        detail: 'Confirmation token настроен.',
      });
    }

    if (vkSnapshot.callback?.autoConfigureEnabled) {
      vkChecks.push({
        status: 'pass',
        detail:
          'Проверьте после деплоя scope community token через /api/vk/health: offline-проверка scope невозможна.',
      });
    }

    if (
      vkValidation?.callbackAutoConfigure &&
      !String(runtimeEnv.VK_GROUP_ID || '').trim()
    ) {
      vkChecks.push({
        status: 'fail',
        detail: 'VK_CALLBACK_AUTO_CONFIGURE=true требует VK_GROUP_ID.',
      });
    }
  }

  sections.push(
    createSection({
      key: 'vk_callback',
      title: 'VK callback',
      status: summarizeSectionStatus(vkChecks),
      details: vkChecks.map((item) => item.detail),
    })
  );

  const internalMetricsToken = String(
    runtimeEnv.INTERNAL_METRICS_TOKEN || ''
  ).trim();
  const metricsStatus = internalMetricsToken ? 'pass' : 'fail';
  const metricsDetails = internalMetricsToken
    ? [
        'INTERNAL_METRICS_TOKEN задан.',
        'Будут доступны /api/runtime, /api/vk/health и внутренняя страница /internal/runtime.',
      ]
    : [
        'INTERNAL_METRICS_TOKEN не задан.',
        'Post-deploy smoke-check для runtime и VK health будет недоступен.',
      ];

  sections.push(
    createSection({
      key: 'internal_metrics',
      title: 'Internal metrics',
      status: metricsStatus,
      details: metricsDetails,
    })
  );

  return {
    ok: sections.every((section) => section.status !== 'fail'),
    nodeEnv: runtimeEnv.NODE_ENV,
    sections,
  };
}

export function formatEnvReadinessReport(report, { envFile = null } = {}) {
  const lines = [];
  lines.push(
    `Env readiness: ${report.ok ? 'PASS' : 'FAIL'} (NODE_ENV=${report.nodeEnv})`
  );

  if (envFile) {
    lines.push(`Env file: ${path.resolve(envFile)}`);
  }

  for (const section of report.sections) {
    lines.push('');
    lines.push(`[${formatSectionStatus(section.status)}] ${section.title}`);
    for (const detail of section.details) {
      lines.push(`- ${detail}`);
    }
  }

  return lines.join('\n');
}

export async function runCheckEnvCli(argv = process.argv.slice(2)) {
  const options = parseCheckEnvArgs(argv);

  if (options.help) {
    console.log(getUsageText());
    return 0;
  }

  loadCheckEnvDotenv(options);

  const report = await evaluateEnvReadiness({
    env: process.env,
    forceProduction: options.forceProduction,
    smtpVerify: options.smtpVerify,
  });

  console.log(formatEnvReadinessReport(report, { envFile: options.envFile }));
  return report.ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const exitCode = await runCheckEnvCli();
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
