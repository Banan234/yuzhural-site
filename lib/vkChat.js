// Файл отправляет уведомления менеджеру во VK и принимает ответы обратно в диалоги сайта.

import crypto from 'crypto';
import { logger } from './logger.js';

const MAX_MANAGER_REPLY_LENGTH = 2_000;
const DEFAULT_CALLBACK_SERVER_TITLE = 'yuzhural-site';
const REQUIRED_CALLBACK_EVENTS = Object.freeze({
  message_new: 1,
  message_reply: 1,
});

function parseBooleanEnv(value, defaultValue = false) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function readVkConfig(env = process.env) {
  return {
    accessToken: String(env.VK_COMMUNITY_ACCESS_TOKEN || '').trim(),
    managerPeerId: String(env.VK_MANAGER_PEER_ID || '').trim(),
    callbackSecret: String(env.VK_CALLBACK_SECRET || '').trim(),
    allowInsecureCallback: parseBooleanEnv(
      env.VK_CALLBACK_ALLOW_INSECURE,
      false
    ),
    confirmationToken: String(env.VK_CALLBACK_CONFIRMATION_TOKEN || '').trim(),
    callbackAutoConfigure: parseBooleanEnv(
      env.VK_CALLBACK_AUTO_CONFIGURE,
      false
    ),
    callbackUrl: resolveCallbackUrl(env),
    callbackServerId: Number(env.VK_CALLBACK_SERVER_ID) || 0,
    callbackServerTitle:
      String(env.VK_CALLBACK_SERVER_TITLE || '').trim() ||
      DEFAULT_CALLBACK_SERVER_TITLE,
    groupId: String(env.VK_GROUP_ID || '').trim(),
    apiVersion: String(env.VK_API_VERSION || '5.131').trim() || '5.131',
    managerUserIds: String(env.VK_MANAGER_USER_IDS || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  };
}

function resolveCallbackUrl(env = process.env) {
  const explicit = String(env.VK_CALLBACK_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  const siteUrl = String(env.SITE_URL || env.VITE_SITE_URL || '').trim();
  if (!siteUrl) {
    return '';
  }

  try {
    return new URL('/api/vk/callback', siteUrl).toString();
  } catch {
    return '';
  }
}

function createNoopResult() {
  return { ok: true, handled: false };
}

function buildConversationLabel(conversationId) {
  return `#chat_${conversationId}`;
}

function escapeVkText(value) {
  return String(value || '').trim();
}

function buildNotificationText({ title, conversation, message }) {
  const customerContact =
    escapeVkText(conversation.customerPhone) || 'не указан';
  const lines = [
    title,
    buildConversationLabel(conversation.id),
    `Контакт: ${customerContact}`,
    `Источник: ${escapeVkText(conversation.source) || '—'}`,
  ];

  if (conversation.customerName) {
    lines.push(`Имя: ${escapeVkText(conversation.customerName)}`);
  }

  lines.push('');
  lines.push(escapeVkText(message.text));
  lines.push('');
  lines.push(
    `Ответьте реплаем на это сообщение или командой /reply ${conversation.id} <текст>`
  );

  return lines.join('\n');
}

function parseReplyCommand(text) {
  const match = /^\/reply\s+([a-z0-9-]+)\s+([\s\S]+)$/i.exec(
    String(text || '').trim()
  );
  if (!match) return null;

  return {
    conversationId: match[1],
    message: match[2].trim(),
  };
}

function parseConversationIdFromText(text) {
  const match = /#chat_([a-z0-9-]+)/i.exec(String(text || ''));
  return match?.[1] || '';
}

function getManagerActorId(message) {
  const adminAuthorId = String(message?.admin_author_id || '').trim();
  if (adminAuthorId) {
    return adminAuthorId;
  }

  return String(message?.from_id || '').trim();
}

function getManagerDisplayName(message) {
  const adminAuthorId = String(message?.admin_author_id || '').trim();
  if (adminAuthorId) {
    return `VK admin ${adminAuthorId}`;
  }

  const fromId = String(message?.from_id || '').trim();
  return fromId ? `VK user ${fromId}` : 'Менеджер VK';
}

function getRandomId() {
  return crypto.randomInt(1, 2_147_483_647);
}

function extractVkMessage(object) {
  if (object?.message && typeof object.message === 'object') {
    return object.message;
  }

  return object && typeof object === 'object' ? object : null;
}

function normalizePeerId(value) {
  return String(value || '').trim();
}

function normalizeCallbackUrlKey(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function normalizeConfirmationCode(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const code =
      typeof value.code === 'string'
        ? value.code
        : typeof value.confirmation_code === 'string'
          ? value.confirmation_code
          : '';
    return code.trim();
  }

  return '';
}

function serializeStatusError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error || 'Unknown error'),
  };
}

function getNowIso() {
  return new Date().toISOString();
}

function classifyCallbackEndpoint(callbackUrl) {
  if (!callbackUrl) {
    return {
      configured: false,
      exposure: 'missing',
      isHttps: false,
      isLikelyTunnel: false,
      tunnelProvider: null,
      isStablePublicEntryPoint: false,
    };
  }

  try {
    const url = new URL(callbackUrl);
    const hostname = String(url.hostname || '')
      .trim()
      .toLowerCase();
    const protocol = String(url.protocol || '')
      .trim()
      .toLowerCase();
    const isHttps = protocol === 'https:';
    const tunnelProvider = hostname.endsWith('.loca.lt')
      ? 'localtunnel'
      : hostname.endsWith('.trycloudflare.com')
        ? 'cloudflared'
        : hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.ngrok.io')
          ? 'ngrok'
          : null;
    const isLikelyTunnel = Boolean(tunnelProvider);
    const isLoopbackHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local');
    const isPrivateIpv4 =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    const exposure = isLikelyTunnel
      ? 'tunnel'
      : isLoopbackHost || isPrivateIpv4
        ? 'private'
        : isHttps
          ? 'public'
          : 'insecure_public';

    return {
      configured: true,
      url: callbackUrl,
      hostname,
      protocol,
      isHttps,
      isLikelyTunnel,
      tunnelProvider,
      exposure,
      isStablePublicEntryPoint: exposure === 'public',
    };
  } catch {
    return {
      configured: false,
      url: callbackUrl,
      exposure: 'invalid',
      isHttps: false,
      isLikelyTunnel: false,
      tunnelProvider: null,
      isStablePublicEntryPoint: false,
    };
  }
}

function isNonEmptyTrimmedStringWithinLength(value, maxLength) {
  const length = String(value ?? '').trim().length;
  return length > 0 && length <= maxLength;
}

function normalizeCallbackServer(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    id: Number(raw.id || raw.server_id) || 0,
    title: String(raw.title || '').trim(),
    url: String(raw.url || '').trim(),
    status: String(raw.status || '').trim(),
  };
}

function extractCallbackServers(response) {
  const items = Array.isArray(response?.items)
    ? response.items
    : Array.isArray(response)
      ? response
      : [];

  return items.map(normalizeCallbackServer).filter(Boolean);
}

function buildCallbackSettingsPayload(existingSettings, config, serverId) {
  const payload = {
    group_id: config.groupId,
    server_id: serverId,
    api_version: config.apiVersion,
  };

  if (existingSettings && typeof existingSettings === 'object') {
    for (const [key, value] of Object.entries(existingSettings)) {
      if (key === 'api_version') continue;
      if (typeof value === 'boolean') {
        payload[key] = value ? 1 : 0;
      } else if (typeof value === 'number' && (value === 0 || value === 1)) {
        payload[key] = value;
      }
    }
  }

  for (const [eventName, enabled] of Object.entries(REQUIRED_CALLBACK_EVENTS)) {
    payload[eventName] = enabled;
  }

  return payload;
}

function normalizeVkSendResult(result, fallbackPeerId) {
  if (Array.isArray(result)) {
    const item = result[0] && typeof result[0] === 'object' ? result[0] : null;
    if (item?.error) {
      throw new Error(String(item.error || 'VK API messages.send failed'));
    }
    return item;
  }

  if (result && typeof result === 'object') {
    if (result.error) {
      throw new Error(String(result.error || 'VK API messages.send failed'));
    }
    return result;
  }

  if (Number.isInteger(result) && result > 0) {
    return {
      peer_id: Number(fallbackPeerId) || fallbackPeerId,
      message_id: result,
      conversation_message_id: 0,
    };
  }

  return null;
}

export function createVkChatBridge({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = readVkConfig(env);
  const status = {
    webhookConfig: {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastResult: null,
      lastError: null,
    },
    callbackTraffic: {
      lastSuccessfulAt: null,
      lastSuccessfulType: null,
      lastSuccessfulConversationId: null,
      totalSuccessful: 0,
      lastRejectedAt: null,
      lastRejectedReason: null,
      lastRejectedType: null,
      totalRejected: 0,
      lastSecretMismatchAt: null,
      secretMismatchCount: 0,
      lastFailureAt: null,
      lastFailureType: null,
      lastFailureError: null,
    },
    publicEndpointProbe: {
      totalProbes: 0,
      consecutiveFailures: 0,
      lastProbeAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastOk: null,
      lastHttpStatus: null,
      lastBodyMatched: null,
      lastError: null,
    },
  };

  async function callVk(method, params) {
    if (!config.accessToken || typeof fetchImpl !== 'function') {
      throw new Error('VK community bot is not configured');
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...params,
      access_token: config.accessToken,
      v: config.apiVersion,
    })) {
      if (value == null || value === '') continue;
      body.set(key, String(value));
    }

    const response = await fetchImpl(`https://api.vk.ru/method/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      throw new Error(`VK API ${method} returned invalid JSON`);
    }

    if (!response.ok || result.error) {
      const errorCode = Number(result.error?.error_code) || 0;
      const errorMessage = result.error?.error_msg || `VK API ${method} failed`;
      throw new Error(
        errorCode > 0
          ? `VK API ${method} failed (${errorCode}): ${errorMessage}`
          : `VK API ${method} failed: ${errorMessage}`
      );
    }

    return result.response;
  }

  async function sendManagerMessage(payload) {
    if (!config.accessToken || !config.managerPeerId) return null;

    return callVk('messages.send', {
      peer_ids: config.managerPeerId,
      message: payload.text,
      random_id: getRandomId(),
      disable_mentions: 1,
    });
  }

  async function notify({ title, conversation, message }) {
    const sentMessage = normalizeVkSendResult(
      await sendManagerMessage({
        text: buildNotificationText({ title, conversation, message }),
      }),
      config.managerPeerId
    );

    if (!sentMessage || typeof sentMessage !== 'object') {
      return null;
    }

    return {
      channel: 'vk',
      peerId: String(sentMessage.peer_id || config.managerPeerId),
      messageId: Number(sentMessage.message_id) || 0,
      conversationMessageId: Number(sentMessage.conversation_message_id) || 0,
    };
  }

  function getStatusSnapshot() {
    const endpoint = classifyCallbackEndpoint(config.callbackUrl);
    const configured = Boolean(
      config.accessToken &&
      config.managerPeerId &&
      config.callbackSecret &&
      config.groupId &&
      config.confirmationToken &&
      config.callbackUrl
    );
    const publicEndpointHealthy =
      status.publicEndpointProbe.lastOk == null
        ? null
        : status.publicEndpointProbe.lastOk === true &&
          status.publicEndpointProbe.lastBodyMatched === true;

    return {
      enabled: Boolean(config.accessToken && config.managerPeerId),
      configured,
      managerPeerId: config.managerPeerId || null,
      managerUserIds: [...config.managerUserIds],
      callback: {
        groupId: config.groupId || null,
        apiVersion: config.apiVersion,
        url: config.callbackUrl || null,
        confirmationTokenConfigured: Boolean(config.confirmationToken),
        secretRequired: !config.allowInsecureCallback,
        autoConfigureEnabled: config.callbackAutoConfigure,
        autoConfigure: {
          ...status.webhookConfig,
        },
        publicEndpoint: {
          ...endpoint,
          ...status.publicEndpointProbe,
          healthy: publicEndpointHealthy,
        },
      },
      runtime: {
        ...status.callbackTraffic,
      },
    };
  }

  return {
    get callbackSecret() {
      return config.callbackSecret;
    },

    get confirmationToken() {
      return config.confirmationToken;
    },

    get callbackUrl() {
      return config.callbackUrl;
    },

    isAllowedManager(message) {
      const fromId = getManagerActorId(message);
      if (config.managerUserIds.length === 0) {
        return Boolean(fromId);
      }

      return Boolean(fromId && config.managerUserIds.includes(fromId));
    },

    isConfigured() {
      return Boolean(config.accessToken && config.managerPeerId);
    },

    async configureWebhook() {
      status.webhookConfig.lastAttemptAt = getNowIso();
      status.webhookConfig.lastError = null;
      if (!config.callbackAutoConfigure) {
        return false;
      }

      if (!this.isConfigured()) {
        throw new Error(
          'VK callback auto-config requires VK_COMMUNITY_ACCESS_TOKEN and VK_MANAGER_PEER_ID'
        );
      }

      if (!config.groupId) {
        throw new Error('VK callback auto-config requires VK_GROUP_ID');
      }

      if (!config.callbackSecret) {
        throw new Error('VK callback auto-config requires VK_CALLBACK_SECRET');
      }

      if (!config.callbackUrl) {
        throw new Error(
          'VK callback auto-config requires VK_CALLBACK_URL or SITE_URL'
        );
      }

      const confirmationCode = normalizeConfirmationCode(
        await callVk('groups.getCallbackConfirmationCode', {
          group_id: config.groupId,
        })
      );
      if (confirmationCode) {
        config.confirmationToken = confirmationCode;
      }

      const servers = extractCallbackServers(
        await callVk('groups.getCallbackServers', {
          group_id: config.groupId,
        })
      );
      const normalizedTargetUrl = normalizeCallbackUrlKey(config.callbackUrl);
      let server =
        servers.find((item) => item.id === config.callbackServerId) ||
        servers.find(
          (item) => normalizeCallbackUrlKey(item.url) === normalizedTargetUrl
        ) ||
        servers.find((item) => item.title === config.callbackServerTitle) ||
        null;

      let mode = 'unchanged';
      if (server) {
        await callVk('groups.editCallbackServer', {
          group_id: config.groupId,
          server_id: server.id,
          title: config.callbackServerTitle,
          url: config.callbackUrl,
          secret_key: config.callbackSecret,
        });
        server = {
          ...server,
          title: config.callbackServerTitle,
          url: config.callbackUrl,
        };
        mode = 'updated';
      } else {
        const created = await callVk('groups.addCallbackServer', {
          group_id: config.groupId,
          title: config.callbackServerTitle,
          url: config.callbackUrl,
          secret_key: config.callbackSecret,
        });
        server = {
          id: Number(created?.server_id || created?.id || created) || 0,
          title: config.callbackServerTitle,
          url: config.callbackUrl,
          status: '',
        };
        mode = 'created';
      }

      if (!server?.id) {
        throw new Error('VK callback auto-config failed to resolve server_id');
      }

      const existingSettings = await callVk('groups.getCallbackSettings', {
        group_id: config.groupId,
        server_id: server.id,
      });
      await callVk(
        'groups.setCallbackSettings',
        buildCallbackSettingsPayload(existingSettings, config, server.id)
      );

      const result = {
        mode,
        serverId: server.id,
        callbackUrl: config.callbackUrl,
        confirmationToken: config.confirmationToken,
      };
      status.webhookConfig.lastSuccessAt = getNowIso();
      status.webhookConfig.lastResult = result;
      status.webhookConfig.lastError = null;
      return result;
    },

    noteWebhookConfigureFailed(error) {
      status.webhookConfig.lastFailureAt = getNowIso();
      status.webhookConfig.lastError = serializeStatusError(error);
    },

    noteCallbackRejected({ reason = 'unknown', type = '' } = {}) {
      status.callbackTraffic.lastRejectedAt = getNowIso();
      status.callbackTraffic.lastRejectedReason = String(reason || 'unknown');
      status.callbackTraffic.lastRejectedType =
        String(type || '').trim() || null;
      status.callbackTraffic.totalRejected += 1;
      if (reason === 'secret_mismatch') {
        status.callbackTraffic.lastSecretMismatchAt =
          status.callbackTraffic.lastRejectedAt;
        status.callbackTraffic.secretMismatchCount += 1;
      }
    },

    noteCallbackHandled(update, result) {
      const type = String(update?.type || '').trim() || 'unknown';
      status.callbackTraffic.lastSuccessfulAt = getNowIso();
      status.callbackTraffic.lastSuccessfulType = type;
      status.callbackTraffic.lastSuccessfulConversationId =
        String(result?.conversationId || '').trim() || null;
      status.callbackTraffic.totalSuccessful += 1;
    },

    noteCallbackFailed(update, error) {
      status.callbackTraffic.lastFailureAt = getNowIso();
      status.callbackTraffic.lastFailureType =
        String(update?.type || '').trim() || 'unknown';
      status.callbackTraffic.lastFailureError = serializeStatusError(error);
    },

    async probePublicCallbackEndpoint() {
      const probeAt = getNowIso();
      status.publicEndpointProbe.totalProbes += 1;
      status.publicEndpointProbe.lastProbeAt = probeAt;
      status.publicEndpointProbe.lastError = null;

      if (!config.callbackUrl || !config.groupId || !config.confirmationToken) {
        status.publicEndpointProbe.lastOk = false;
        status.publicEndpointProbe.lastBodyMatched = false;
        status.publicEndpointProbe.lastHttpStatus = null;
        status.publicEndpointProbe.lastFailureAt = probeAt;
        status.publicEndpointProbe.consecutiveFailures += 1;
        status.publicEndpointProbe.lastError = {
          message:
            'VK callback probe requires callback URL, group ID and confirmation token',
        };
        return {
          ok: false,
          skipped: true,
          reason: 'callback_not_ready',
        };
      }

      try {
        const response = await fetchImpl(config.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'confirmation',
            group_id: Number(config.groupId) || config.groupId,
          }),
        });
        const body =
          typeof response.text === 'function' ? await response.text() : '';
        const bodyMatched = body.trim() === config.confirmationToken;
        const ok = Boolean(response.ok && bodyMatched);

        status.publicEndpointProbe.lastOk = ok;
        status.publicEndpointProbe.lastHttpStatus =
          Number(response.status) || null;
        status.publicEndpointProbe.lastBodyMatched = bodyMatched;
        if (ok) {
          status.publicEndpointProbe.lastSuccessAt = probeAt;
          status.publicEndpointProbe.consecutiveFailures = 0;
        } else {
          status.publicEndpointProbe.lastFailureAt = probeAt;
          status.publicEndpointProbe.consecutiveFailures += 1;
        }

        return {
          ok,
          statusCode: Number(response.status) || 0,
          bodyMatched,
          callbackUrl: config.callbackUrl,
        };
      } catch (error) {
        status.publicEndpointProbe.lastOk = false;
        status.publicEndpointProbe.lastBodyMatched = false;
        status.publicEndpointProbe.lastHttpStatus = null;
        status.publicEndpointProbe.lastFailureAt = probeAt;
        status.publicEndpointProbe.consecutiveFailures += 1;
        status.publicEndpointProbe.lastError = serializeStatusError(error);
        return {
          ok: false,
          callbackUrl: config.callbackUrl,
          error: serializeStatusError(error),
        };
      }
    },

    getStatusSnapshot() {
      return getStatusSnapshot();
    },

    async notifyConversationCreated(conversation) {
      const customerMessage =
        conversation.messages[conversation.messages.length - 1] || null;
      if (!customerMessage) return null;

      return notify({
        title: 'Новый диалог с сайта',
        conversation,
        message: customerMessage,
      });
    },

    async notifyCustomerMessage(conversation, message) {
      return notify({
        title: 'Клиент написал в чат сайта',
        conversation,
        message,
      });
    },

    requiresCallbackSecret() {
      return this.isConfigured() && !config.allowInsecureCallback;
    },

    async sendManagerAck(peerId, replyConversationMessageId, text) {
      if (!this.isConfigured()) return null;

      const params = {
        peer_id: peerId,
        message: text,
        random_id: getRandomId(),
        disable_mentions: 1,
      };

      if (Number(replyConversationMessageId) > 0) {
        params.conversation_message_ids = Number(replyConversationMessageId);
        params.is_reply = 1;
      }

      return callVk('messages.send', params);
    },

    async handleCallbackUpdate(update, { chatStore }) {
      const type = String(update?.type || '').trim();
      const eventId = String(update?.event_id || '').trim();
      const processedEventId = eventId ? `vk:${eventId}` : '';

      async function markProcessed() {
        if (!processedEventId) return true;
        return chatStore.markManagerEventProcessed(processedEventId);
      }

      async function sendManagerAckSafe(
        peerId,
        replyConversationMessageId,
        text
      ) {
        try {
          await this.sendManagerAck(peerId, replyConversationMessageId, text);
        } catch (error) {
          logger.error('vk.callback.ack_failed', {
            err: error,
            peerId,
            replyConversationMessageId,
          });
        }
      }

      if (type === 'confirmation') {
        return { ok: true, handled: true, confirmation: true };
      }

      if (!this.isConfigured()) return createNoopResult();

      if (processedEventId) {
        const alreadyProcessed =
          await chatStore.hasManagerEventProcessed(processedEventId);
        if (alreadyProcessed) {
          return { ok: true, handled: true, duplicate: true };
        }
      }

      if (
        config.groupId &&
        String(update?.group_id || '').trim() !== config.groupId
      ) {
        return createNoopResult();
      }

      if (type !== 'message_new' && type !== 'message_reply') {
        return createNoopResult();
      }

      const message = extractVkMessage(update?.object);
      if (!message) {
        return createNoopResult();
      }

      if (type === 'message_new' && Number(message.out) === 1) {
        return createNoopResult();
      }

      if (
        type === 'message_reply' &&
        !String(message?.admin_author_id || '').trim()
      ) {
        return createNoopResult();
      }

      const peerId = normalizePeerId(message.peer_id || message.user_id);
      if (peerId !== config.managerPeerId) {
        return createNoopResult();
      }

      if (!this.isAllowedManager(message)) {
        return { ok: true, handled: false, reason: 'manager_not_allowed' };
      }

      const rawText = String(message.text || message.body || '').trim();
      if (!rawText) {
        return createNoopResult();
      }

      let conversationId = '';
      let replyText = rawText;

      const replyMessage =
        message.reply_message && typeof message.reply_message === 'object'
          ? message.reply_message
          : null;

      if (replyMessage) {
        const conversation =
          await chatStore.findConversationByManagerNotification({
            channel: 'vk',
            peerId,
            messageId: replyMessage.id,
            conversationMessageId: replyMessage.conversation_message_id,
          });

        if (conversation) {
          conversationId = conversation.id;
        } else {
          conversationId = parseConversationIdFromText(
            replyMessage.text || replyMessage.body || ''
          );
        }
      }

      if (!conversationId) {
        const command = parseReplyCommand(rawText);
        if (command) {
          conversationId = command.conversationId;
          replyText = command.message;
        }
      }

      if (!conversationId || !replyText) {
        await sendManagerAckSafe.call(
          this,
          peerId,
          Number(message.conversation_message_id) || 0,
          'Не удалось определить диалог. Ответьте реплаем на уведомление бота или используйте /reply <conversationId> <текст>.'
        );
        await markProcessed();
        return {
          ok: true,
          handled: false,
          reason: 'conversation_not_resolved',
        };
      }

      if (
        !isNonEmptyTrimmedStringWithinLength(
          replyText,
          MAX_MANAGER_REPLY_LENGTH
        )
      ) {
        await sendManagerAckSafe.call(
          this,
          peerId,
          Number(message.conversation_message_id) || 0,
          `Сообщение должно содержать от 1 до ${MAX_MANAGER_REPLY_LENGTH} символов.`
        );
        await markProcessed();
        return { ok: true, handled: false, reason: 'invalid_message_length' };
      }

      const appended = await chatStore.appendManagerMessage(
        conversationId,
        replyText,
        {
          channel: 'vk',
          eventId: processedEventId,
          peerId,
          messageId: Number(message.id) || 0,
          conversationMessageId: Number(message.conversation_message_id) || 0,
          fromId: getManagerActorId(message),
          name: getManagerDisplayName(message),
        }
      );

      if (!appended) {
        await sendManagerAckSafe.call(
          this,
          peerId,
          Number(message.conversation_message_id) || 0,
          `Диалог ${buildConversationLabel(conversationId)} не найден.`
        );
        await markProcessed();
        return { ok: true, handled: false, reason: 'conversation_not_found' };
      }

      await markProcessed();
      await sendManagerAckSafe.call(
        this,
        peerId,
        Number(message.conversation_message_id) || 0,
        `Ответ отправлен клиенту (${buildConversationLabel(conversationId)}).`
      );

      return { ok: true, handled: true, conversationId };
    },
  };
}
