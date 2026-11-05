import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { PERSONAL_DATA_CONSENT_VERSION } from '../shared/personalDataConsent.js';
import { createFileChatStore, createInMemoryChatStore } from './chatStore.js';
const messagePayload = { initialMessage: 'Synthetic initial' };
async function serve(options, run) {
  const server = createApp({
    env: { FORMS_ENABLED: 'false' },
    rateLimitOptions: { limit: 1000 },
    ...options,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const post = (url, token, message, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...headers,
    },
    body: JSON.stringify({ message }),
  });
const bridge = () => ({
  isConfigured: () => true,
  notifyConversationCreated: vi.fn(async () => ({
    channel: 'vk',
    peerId: 'synthetic',
    messageId: 1,
  })),
  notifyCustomerMessage: vi.fn(async () => ({
    channel: 'vk',
    peerId: 'synthetic',
    messageId: 2,
  })),
});

describe('chat write safety API', () => {
  it('counts every header variant, rejects excess writes before persistence/notification, and retains authorization', async () => {
    const chatStore = createInMemoryChatStore(),
      vkBridge = bridge();
    const created = await chatStore.createConversation(messagePayload);
    await chatStore.markCustomerMessageNotified(
      created.conversation.id,
      created.conversation.messages.at(-1).id
    );
    await serve(
      { chatStore, vkBridge, chatRateLimitOptions: { limit: 2 } },
      async (base) => {
        const url =
          base +
          '/api/chat/conversations/' +
          created.conversation.id +
          '/messages';
        for (let i = 0; i < 2; i++)
          expect(
            (
              await post(url, created.customerToken, 'allowed-' + i, {
                'Accept-Language': 'ru',
                'User-Agent': 'synthetic',
              })
            ).status
          ).toBe(200);
        expect(vkBridge.notifyCustomerMessage).toHaveBeenCalledTimes(2);
        for (const headers of [
          { 'Accept-Language': '' },
          { 'Accept-Language': '', 'User-Agent': '' },
          { 'Accept-Language': 'en' },
          { 'User-Agent': 'bot' },
        ]) {
          const response = await post(
            url,
            created.customerToken,
            'must not persist',
            headers
          );
          expect(response.status).toBe(429);
          expect((await response.json()).ok).toBe(false);
        }
        expect(vkBridge.notifyCustomerMessage).toHaveBeenCalledTimes(2);
        expect(
          (await chatStore.getConversation(created.conversation.id)).messages
            .filter((m) => m.role === 'customer')
            .map((m) => m.text)
        ).toEqual(['Synthetic initial', 'allowed-0', 'allowed-1']);
        expect(
          (
            await fetch(
              base + '/api/chat/conversations/' + created.conversation.id,
              { headers: { Authorization: 'Bearer wrong' } }
            )
          ).status
        ).toBe(404);
      }
    );
    // Fresh limiter instance confirms wrong-token writes still fail independently of rate limiting.
    await serve({ chatStore, vkBridge }, async (base) => {
      const res = await post(
        base +
          '/api/chat/conversations/' +
          created.conversation.id +
          '/messages',
        'wrong',
        'unauthorized'
      );
      expect(res.status).toBe(404);
      expect(vkBridge.notifyCustomerMessage).toHaveBeenCalledTimes(2);
      const own = await fetch(
        base + '/api/chat/conversations/' + created.conversation.id,
        { headers: { Authorization: 'Bearer ' + created.customerToken } }
      );
      expect(own.status).toBe(200);
      const data = await own.json();
      expect(data.conversation.customerToken).toBeUndefined();
    });
  });
  it('does not notify the same pending message twice during concurrent authorized reads', async () => {
    const chatStore = createInMemoryChatStore();
    const created = await chatStore.createConversation(messagePayload);
    const vkBridge = bridge();
    vkBridge.notifyConversationCreated.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { channel: 'vk', peerId: 'synthetic', messageId: 1 };
    });
    await serve({ chatStore, vkBridge }, async (base) => {
      const url = base + '/api/chat/conversations/' + created.conversation.id;
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          fetch(url, {
            headers: { Authorization: 'Bearer ' + created.customerToken },
          })
        )
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(vkBridge.notifyConversationCreated).toHaveBeenCalledTimes(1);
      expect(
        await chatStore.getPendingCustomerMessages(created.conversation.id)
      ).toEqual([]);
    });
  });
  it('returns safe machine diagnostics without overwriting corrupted storage or notifying', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-api-corrupt-'));
    const filePath = path.join(root, 'store.json');
    const chatStore = createFileChatStore({ filePath });
    const created = await chatStore.createConversation(messagePayload);
    const corrupt =
      (await fs.readFile(filePath, 'utf8')) + '!SYNTHETIC_PRIVATE_MARKER';
    await fs.writeFile(filePath, corrupt);
    const vkBridge = bridge();
    try {
      await serve({ chatStore, vkBridge }, async (base) => {
        const get = await fetch(
          base + '/api/chat/conversations/' + created.conversation.id,
          { headers: { Authorization: 'Bearer ' + created.customerToken } }
        );
        expect(get.status).toBe(503);
        expect(await get.json()).toMatchObject({
          ok: false,
          code: 'CHAT_STORE_CORRUPT',
        });
        const newConversation = await fetch(base + '/api/chat/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Language': 'ru',
            'User-Agent': 'synthetic-browser',
          },
          body: JSON.stringify({
            message: 'must not create',
            consent: true,
            consentVersion: PERSONAL_DATA_CONSENT_VERSION,
          }),
        });
        expect(newConversation.status).toBe(503);
        expect(await newConversation.json()).toMatchObject({
          code: 'CHAT_STORE_CORRUPT',
        });
        const res = await post(
          base +
            '/api/chat/conversations/' +
            created.conversation.id +
            '/messages',
          created.customerToken,
          'must not persist'
        );
        expect(res.status).toBe(503);
        const text = await res.text();
        expect(text).toContain('CHAT_STORE_CORRUPT');
        expect(text).not.toContain('SYNTHETIC_PRIVATE_MARKER');
        expect(text).not.toContain(filePath);
        expect(await fs.readFile(filePath, 'utf8')).toBe(corrupt);
        expect(vkBridge.notifyCustomerMessage).not.toHaveBeenCalled();
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
