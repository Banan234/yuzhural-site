// Файл хранит диалоги сайта в памяти или JSON-файле и умеет связывать их с внешними manager-уведомлениями.

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { messages } from '../shared/messages.js';

const DEFAULT_CHAT_RETENTION_DAYS = 90;
const DEFAULT_MAX_CONVERSATIONS = 1_000;
const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 200;

function nowIso() {
  return new Date().toISOString();
}

function createMessage(role, text, meta = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    createdAt: nowIso(),
    ...meta,
  };
}

function createGreetingMessage() {
  return {
    id: 'greeting',
    role: 'manager',
    text: messages.text.chatGreeting,
    createdAt: null,
  };
}

function createConversationRecord({
  customerPhone = '',
  customerName = '',
  source = '',
  initialMessage,
}) {
  const createdAt = nowIso();

  return {
    id: crypto.randomUUID(),
    customerToken: crypto.randomBytes(16).toString('hex'),
    customerPhone,
    customerName: customerName || '',
    source: source || '',
    createdAt,
    updatedAt: createdAt,
    managerNotifications: [],
    messages: [
      createGreetingMessage(),
      createMessage('customer', initialMessage, {
        managerDelivery: {
          status: 'pending',
          notifiedAt: null,
        },
      }),
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialState() {
  return {
    conversations: [],
    manager: {
      processedEventIds: [],
    },
  };
}

function parseInteger(value, fallback, { min = 1, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseStoreOptions(options = {}) {
  return {
    retentionDays: parseInteger(
      options.retentionDays,
      DEFAULT_CHAT_RETENTION_DAYS,
      { min: 1, max: 3650 }
    ),
    maxConversations: parseInteger(
      options.maxConversations,
      DEFAULT_MAX_CONVERSATIONS,
      { min: 1, max: 100_000 }
    ),
    maxMessagesPerConversation: parseInteger(
      options.maxMessagesPerConversation,
      DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
      { min: 2, max: 10_000 }
    ),
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  const conversations = Array.isArray(state.conversations)
    ? state.conversations
    : [];
  const processedEventIds = Array.isArray(state.manager?.processedEventIds)
    ? state.manager.processedEventIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(-500)
    : Array.isArray(state.telegram?.processedUpdateIds)
      ? state.telegram.processedUpdateIds
          .map((value) => String(Number(value) || '').trim())
          .filter(Boolean)
          .slice(-500)
      : [];

  return {
    conversations: conversations
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id || ''),
        customerToken: String(entry.customerToken || ''),
        customerPhone: String(entry.customerPhone || ''),
        customerName: String(entry.customerName || ''),
        source: String(entry.source || ''),
        createdAt: String(entry.createdAt || nowIso()),
        updatedAt: String(entry.updatedAt || entry.createdAt || nowIso()),
        managerNotifications: (Array.isArray(entry.managerNotifications)
          ? entry.managerNotifications
          : Array.isArray(entry.telegramNotifications)
            ? entry.telegramNotifications.map((item) => ({
                channel: 'telegram',
                peerId: String(item?.chatId || ''),
                messageId: Number(item?.messageId) || 0,
                conversationMessageId: 0,
                createdAt: String(item?.createdAt || nowIso()),
              }))
            : []
        )
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            channel: String(item.channel || 'generic').trim() || 'generic',
            peerId: String(item.peerId || item.chatId || ''),
            messageId: Number(item.messageId) || 0,
            conversationMessageId: Number(item.conversationMessageId) || 0,
            createdAt: String(item.createdAt || nowIso()),
          }))
          .filter(
            (item) =>
              item.peerId &&
              (item.messageId > 0 || item.conversationMessageId > 0)
          ),
        messages: Array.isArray(entry.messages)
          ? entry.messages
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({
                id: String(item.id || crypto.randomUUID()),
                role: item.role === 'manager' ? 'manager' : 'customer',
                text: String(item.text || ''),
                createdAt:
                  item.createdAt == null ? null : String(item.createdAt || ''),
                managerDelivery:
                  item.role === 'customer'
                    ? item.managerDelivery &&
                      typeof item.managerDelivery === 'object'
                      ? {
                          status:
                            String(item.managerDelivery.status || '').trim() ===
                            'pending'
                              ? 'pending'
                              : 'sent',
                          notifiedAt: item.managerDelivery.notifiedAt
                            ? String(item.managerDelivery.notifiedAt)
                            : null,
                        }
                      : {
                          status: 'sent',
                          notifiedAt: null,
                        }
                    : undefined,
                managerMeta:
                  item.managerMeta && typeof item.managerMeta === 'object'
                    ? {
                        channel:
                          String(
                            item.managerMeta.channel || 'generic'
                          ).trim() || 'generic',
                        eventId: String(item.managerMeta.eventId || '').trim(),
                        peerId: String(
                          item.managerMeta.peerId ||
                            item.managerMeta.chatId ||
                            ''
                        ),
                        messageId: Number(item.managerMeta.messageId) || 0,
                        conversationMessageId:
                          Number(item.managerMeta.conversationMessageId) || 0,
                        fromId: String(item.managerMeta.fromId || ''),
                        username: String(item.managerMeta.username || ''),
                        name: String(item.managerMeta.name || ''),
                      }
                    : item.telegram && typeof item.telegram === 'object'
                      ? {
                          channel: 'telegram',
                          eventId: '',
                          peerId: String(item.telegram.chatId || ''),
                          messageId: Number(item.telegram.messageId) || 0,
                          conversationMessageId: 0,
                          fromId: String(item.telegram.fromId || ''),
                          username: String(item.telegram.username || ''),
                          name: String(item.telegram.name || ''),
                        }
                      : undefined,
              }))
          : [createGreetingMessage()],
      }))
      .filter(
        (entry) =>
          entry.id &&
          entry.customerToken &&
          Array.isArray(entry.messages) &&
          entry.messages.length > 0
      ),
    manager: {
      processedEventIds,
    },
  };
}

function toCustomerConversation(conversation) {
  return {
    id: conversation.id,
    customerName: conversation.customerName,
    source: conversation.source,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
    })),
  };
}

function findConversation(state, conversationId) {
  return (
    state.conversations.find((entry) => entry.id === conversationId) || null
  );
}

function normalizeManagerEventId(value) {
  return String(value || '')
    .trim()
    .slice(0, 200);
}

function isDuplicateManagerMessage(existingMessage, incomingMeta = {}) {
  if (
    !existingMessage ||
    existingMessage.role !== 'manager' ||
    !existingMessage.managerMeta ||
    typeof existingMessage.managerMeta !== 'object'
  ) {
    return false;
  }

  const existingEventId = normalizeManagerEventId(
    existingMessage.managerMeta.eventId
  );
  const incomingEventId = normalizeManagerEventId(incomingMeta.eventId);
  if (
    existingEventId &&
    incomingEventId &&
    existingEventId === incomingEventId
  ) {
    return true;
  }

  const existingChannel =
    String(existingMessage.managerMeta.channel || 'generic').trim() ||
    'generic';
  const incomingChannel =
    String(incomingMeta.channel || 'generic').trim() || 'generic';
  const existingPeerId = String(existingMessage.managerMeta.peerId || '');
  const incomingPeerId = String(incomingMeta.peerId || '');
  const existingMessageId = Number(existingMessage.managerMeta.messageId) || 0;
  const incomingMessageId = Number(incomingMeta.messageId) || 0;
  const existingConversationMessageId =
    Number(existingMessage.managerMeta.conversationMessageId) || 0;
  const incomingConversationMessageId =
    Number(incomingMeta.conversationMessageId) || 0;

  if (
    existingChannel !== incomingChannel ||
    !existingPeerId ||
    existingPeerId !== incomingPeerId
  ) {
    return false;
  }

  return Boolean(
    (incomingConversationMessageId > 0 &&
      existingConversationMessageId === incomingConversationMessageId) ||
    (incomingMessageId > 0 && existingMessageId === incomingMessageId)
  );
}

function pruneState(state, options) {
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000;
  const cutoffTs = Date.now() - retentionMs;

  state.conversations = state.conversations
    .filter((conversation) => {
      const updatedTs = Date.parse(
        conversation.updatedAt || conversation.createdAt
      );
      return Number.isFinite(updatedTs) && updatedTs >= cutoffTs;
    })
    .sort((a, b) => {
      const aTs = Date.parse(a.updatedAt || a.createdAt || 0);
      const bTs = Date.parse(b.updatedAt || b.createdAt || 0);
      return aTs - bTs;
    })
    .slice(-options.maxConversations)
    .map((conversation) => {
      conversation.messages = conversation.messages.slice(
        -options.maxMessagesPerConversation
      );
      conversation.managerNotifications =
        conversation.managerNotifications.slice(-50);
      return conversation;
    });

  return state;
}

function createStore({ readState, writeState, storeOptions }) {
  const options = parseStoreOptions(storeOptions);
  let queue = Promise.resolve();

  function runExclusive(task) {
    const next = queue.then(task, task);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function mutate(mutator) {
    return runExclusive(async () => {
      const state = pruneState(normalizeState(await readState()), options);
      const result = await mutator(state);
      pruneState(state, options);
      await writeState(state);
      return result;
    });
  }

  async function read() {
    return pruneState(normalizeState(await readState()), options);
  }

  return {
    async createConversation(payload) {
      return mutate(async (state) => {
        const conversation = createConversationRecord(payload);
        state.conversations.push(conversation);
        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
          customerToken: conversation.customerToken,
        };
      });
    },

    async getConversation(conversationId) {
      const state = await read();
      const conversation = findConversation(state, conversationId);
      return conversation ? clone(conversation) : null;
    },

    async getConversationForCustomer(conversationId, token) {
      const state = await read();
      const conversation = findConversation(state, conversationId);
      if (!conversation || conversation.customerToken !== token) {
        return null;
      }
      return toCustomerConversation(conversation);
    },

    async appendCustomerMessage(conversationId, token, text) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation || conversation.customerToken !== token) {
          return null;
        }

        conversation.messages.push(
          createMessage('customer', text, {
            managerDelivery: {
              status: 'pending',
              notifiedAt: null,
            },
          })
        );
        conversation.updatedAt = nowIso();

        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
        };
      });
    },

    async appendManagerMessage(conversationId, text, managerMeta = null) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation) {
          return null;
        }

        const normalizedManagerMeta = managerMeta
          ? {
              ...managerMeta,
              channel:
                String(managerMeta.channel || 'generic').trim() || 'generic',
              eventId: normalizeManagerEventId(managerMeta.eventId),
              peerId: String(managerMeta.peerId || ''),
              messageId: Number(managerMeta.messageId) || 0,
              conversationMessageId:
                Number(managerMeta.conversationMessageId) || 0,
            }
          : null;

        if (
          normalizedManagerMeta &&
          conversation.messages.some((message) =>
            isDuplicateManagerMessage(message, normalizedManagerMeta)
          )
        ) {
          return {
            conversation: clone(conversation),
            customerConversation: toCustomerConversation(conversation),
          };
        }

        conversation.messages.push(
          createMessage(
            'manager',
            text,
            normalizedManagerMeta
              ? {
                  managerMeta: normalizedManagerMeta,
                }
              : {}
          )
        );
        conversation.updatedAt = nowIso();

        return {
          conversation: clone(conversation),
          customerConversation: toCustomerConversation(conversation),
        };
      });
    },

    async registerManagerNotification(conversationId, notification) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation) return null;

        const entry = {
          channel:
            String(notification.channel || 'generic').trim() || 'generic',
          peerId: String(notification.peerId || notification.chatId || ''),
          messageId: Number(notification.messageId) || 0,
          conversationMessageId:
            Number(notification.conversationMessageId) || 0,
          createdAt: nowIso(),
        };

        const alreadyRegistered = conversation.managerNotifications.some(
          (item) =>
            item.channel === entry.channel &&
            item.peerId === entry.peerId &&
            item.messageId === entry.messageId &&
            item.conversationMessageId === entry.conversationMessageId
        );

        if (!alreadyRegistered) {
          conversation.managerNotifications.push(entry);
        }
        conversation.managerNotifications =
          conversation.managerNotifications.slice(-50);
        conversation.updatedAt = nowIso();

        return clone(conversation);
      });
    },

    async findConversationByManagerNotification({
      channel = 'generic',
      peerId,
      messageId,
      conversationMessageId,
    }) {
      const state = await read();
      const normalizedChannel =
        String(channel || 'generic').trim() || 'generic';
      const normalizedPeerId = String(peerId || '');
      const normalizedMessageId = Number(messageId) || 0;
      const normalizedConversationMessageId =
        Number(conversationMessageId) || 0;
      const conversation =
        state.conversations.find((entry) =>
          entry.managerNotifications.some(
            (item) =>
              item.channel === normalizedChannel &&
              item.peerId === normalizedPeerId &&
              ((normalizedConversationMessageId > 0 &&
                item.conversationMessageId ===
                  normalizedConversationMessageId) ||
                (normalizedMessageId > 0 &&
                  item.messageId === normalizedMessageId))
          )
        ) || null;

      return conversation ? clone(conversation) : null;
    },

    async getPendingCustomerMessages(conversationId = null, limit = 20) {
      const state = await read();
      const maxItems = parseInteger(limit, 20, { min: 1, max: 500 });
      const conversations = conversationId
        ? state.conversations.filter((entry) => entry.id === conversationId)
        : state.conversations;

      const pending = [];
      for (const conversation of conversations) {
        for (const message of conversation.messages) {
          if (
            message.role === 'customer' &&
            message.managerDelivery?.status === 'pending'
          ) {
            pending.push({
              conversation: clone(conversation),
              message: clone(message),
            });
          }

          if (pending.length >= maxItems) {
            return pending;
          }
        }
      }

      return pending;
    },

    async markCustomerMessageNotified(
      conversationId,
      customerMessageId,
      notification = null
    ) {
      return mutate(async (state) => {
        const conversation = findConversation(state, conversationId);
        if (!conversation) return null;

        const message = conversation.messages.find(
          (entry) => entry.id === customerMessageId && entry.role === 'customer'
        );
        if (!message) return null;

        if (message.managerDelivery?.status === 'sent') {
          return clone(conversation);
        }

        message.managerDelivery = {
          status: 'sent',
          notifiedAt: nowIso(),
        };

        if (notification) {
          const entry = {
            channel:
              String(notification.channel || 'generic').trim() || 'generic',
            peerId: String(notification.peerId || notification.chatId || ''),
            messageId: Number(notification.messageId) || 0,
            conversationMessageId:
              Number(notification.conversationMessageId) || 0,
            createdAt: nowIso(),
          };
          const alreadyRegistered = conversation.managerNotifications.some(
            (item) =>
              item.channel === entry.channel &&
              item.peerId === entry.peerId &&
              item.messageId === entry.messageId &&
              item.conversationMessageId === entry.conversationMessageId
          );

          if (!alreadyRegistered) {
            conversation.managerNotifications.push(entry);
          }
          conversation.managerNotifications =
            conversation.managerNotifications.slice(-50);
        }

        conversation.updatedAt = nowIso();
        return clone(conversation);
      });
    },

    async markManagerEventProcessed(eventId) {
      return mutate(async (state) => {
        const normalized = normalizeManagerEventId(eventId);
        if (!normalized) {
          return false;
        }

        if (state.manager.processedEventIds.includes(normalized)) {
          return false;
        }

        state.manager.processedEventIds.push(normalized);
        state.manager.processedEventIds =
          state.manager.processedEventIds.slice(-500);
        return true;
      });
    },

    async hasManagerEventProcessed(eventId) {
      const normalized = normalizeManagerEventId(eventId);
      if (!normalized) return false;

      const state = await read();
      return state.manager.processedEventIds.includes(normalized);
    },

    async registerTelegramNotification(conversationId, notification) {
      return this.registerManagerNotification(conversationId, {
        channel: 'telegram',
        peerId: notification?.chatId,
        messageId: notification?.messageId,
      });
    },

    async findConversationByTelegramNotification(chatId, messageId) {
      return this.findConversationByManagerNotification({
        channel: 'telegram',
        peerId: chatId,
        messageId,
      });
    },

    async markTelegramUpdateProcessed(updateId) {
      return this.markManagerEventProcessed(`telegram:${updateId}`);
    },
  };
}

export function createInMemoryChatStore(
  initialState = createInitialState(),
  options = {}
) {
  let state = normalizeState(initialState);

  return createStore({
    async readState() {
      return clone(state);
    },
    async writeState(nextState) {
      state = normalizeState(clone(nextState));
    },
    storeOptions: options,
  });
}

async function ensureJsonFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      JSON.stringify(createInitialState(), null, 2),
      'utf8'
    );
  }
}

function resolveChatStorePath(env = process.env) {
  const configuredPath = String(env.CHAT_STORE_FILE || '').trim();
  return configuredPath || path.resolve(process.cwd(), 'data/chat-store.json');
}

export function createFileChatStore({
  filePath = resolveChatStorePath(),
  retentionDays = process.env.CHAT_RETENTION_DAYS,
  maxConversations = process.env.CHAT_MAX_CONVERSATIONS,
  maxMessagesPerConversation = process.env.CHAT_MAX_MESSAGES_PER_CONVERSATION,
} = {}) {
  return createStore({
    async readState() {
      await ensureJsonFile(filePath);
      const raw = await fs.readFile(filePath, 'utf8');
      try {
        return normalizeState(JSON.parse(raw));
      } catch {
        return createInitialState();
      }
    },
    async writeState(nextState) {
      await ensureJsonFile(filePath);
      await fs.writeFile(filePath, JSON.stringify(nextState, null, 2), 'utf8');
    },
    storeOptions: {
      retentionDays,
      maxConversations,
      maxMessagesPerConversation,
    },
  });
}
