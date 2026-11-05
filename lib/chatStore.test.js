import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFileChatStore } from './chatStore.js';
import { acquirePriceImportLock } from '../scripts/lib/importLock.js';
const exec = promisify(execFile);
const roots = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-safe-'));
  roots.push(root);
  return path.join(root, 'store.json');
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((p) => fs.rm(p, { recursive: true, force: true }))
  );
});
const initialMessage = 'Synthetic original';
const moduleUrl = new URL('./chatStore.js', import.meta.url).href;
const childEnv = () => ({ PATH: process.env.PATH, HOME: os.tmpdir() });

describe('file chat storage safety', () => {
  it('distinguishes first run and reopens the committed history in a new process', async () => {
    const filePath = await fixture();
    const store = createFileChatStore({ filePath });
    expect(await store.getConversation('missing')).toBeNull();
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const created = await store.createConversation({ initialMessage });
    const { stdout } = await exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {createFileChatStore} from ${JSON.stringify(moduleUrl)}; const s=createFileChatStore({filePath:process.argv[1]});console.log(JSON.stringify(await s.getConversationForCustomer(process.argv[2],process.argv[3])));`,
        filePath,
        created.conversation.id,
        created.customerToken,
      ],
      { env: childEnv() }
    );
    const restored = JSON.parse(stdout);
    expect(restored.messages.some((m) => m.text === initialMessage)).toBe(true);
    expect(restored.customerToken).toBeUndefined();
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
  });
  it.each(['syntax', 'empty', 'shape', 'record', 'empty-history'])(
    'preserves the original bytes on %s corruption and never exposes snippets',
    async (kind) => {
      const filePath = await fixture();
      const store = createFileChatStore({ filePath });
      const created = await store.createConversation({ initialMessage });
      const valid = await fs.readFile(filePath, 'utf8');
      const bad =
        kind === 'syntax'
          ? valid + '!SYNTHETIC_PRIVATE_MARKER'
          : kind === 'empty'
            ? ''
            : kind === 'shape'
              ? '{"conversations":"SYNTHETIC_PRIVATE_MARKER"}'
              : kind === 'empty-history'
                ? JSON.stringify({
                    ...JSON.parse(valid),
                    conversations: JSON.parse(valid).conversations.map((c) => ({
                      ...c,
                      messages: [],
                    })),
                  })
                : '{"conversations":[{"id":"SYNTHETIC_PRIVATE_MARKER"}]}';
      await fs.writeFile(filePath, bad);
      await expect(
        store.getConversation(created.conversation.id)
      ).rejects.toMatchObject({ code: 'CHAT_STORE_CORRUPT' });
      await expect(
        store.createConversation({ initialMessage: 'next' })
      ).rejects.toMatchObject({ code: 'CHAT_STORE_CORRUPT' });
      expect(await fs.readFile(filePath, 'utf8')).toBe(bad);
      try {
        await store.createConversation({ initialMessage: 'next' });
      } catch (e) {
        expect(e.message).not.toContain('SYNTHETIC_PRIVATE_MARKER');
      }
      // A repaired file can be read by the same instance; no sticky empty cache.
      await fs.writeFile(filePath, valid);
      expect((await store.getConversation(created.conversation.id)).id).toBe(
        created.conversation.id
      );
    }
  );
  it('reports read permission errors rather than treating them as a missing file', async () => {
    const filePath = await fixture();
    const store = createFileChatStore({ filePath });
    await store.createConversation({ initialMessage });
    const read = fs.readFile.bind(fs),
      before = await read(filePath, 'utf8');
    const spy = vi.spyOn(fs, 'readFile').mockImplementation((p, ...args) =>
      p === filePath
        ? Promise.reject(
            Object.assign(new Error('synthetic access denied'), {
              code: 'EACCES',
            })
          )
        : read(p, ...args)
    );
    await expect(
      store.createConversation({ initialMessage: 'not accepted' })
    ).rejects.toMatchObject({ code: 'CHAT_STORE_IO', ioCode: 'EACCES' });
    spy.mockRestore();
    expect(await read(filePath, 'utf8')).toBe(before);
  });
  it('keeps the committed file on a failed atomic rename and removes temporary files', async () => {
    const filePath = await fixture();
    const store = createFileChatStore({ filePath });
    const created = await store.createConversation({ initialMessage });
    const before = await fs.readFile(filePath, 'utf8');
    const target = await fs.realpath(filePath);
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, 'rename').mockImplementation((from, to) =>
      to === target
        ? Promise.reject(
            Object.assign(new Error('synthetic rename failure'), {
              code: 'EIO',
            })
          )
        : rename(from, to)
    );
    await expect(
      store.appendCustomerMessage(
        created.conversation.id,
        created.customerToken,
        'not committed'
      )
    ).rejects.toMatchObject({ code: 'CHAT_STORE_IO', ioCode: 'EIO' });
    spy.mockRestore();
    expect(await fs.readFile(filePath, 'utf8')).toBe(before);
    expect(await fs.readdir(path.dirname(filePath))).toEqual(['store.json']);
    await store.appendCustomerMessage(
      created.conversation.id,
      created.customerToken,
      'retry'
    );
    expect(
      (await store.getConversation(created.conversation.id)).messages.at(-1)
        .text
    ).toBe('retry');
  });
  it('never initializes a dangling symlink or a directory as an empty store', async () => {
    const filePath = await fixture();
    await fs.symlink('missing.json', filePath);
    const store = createFileChatStore({ filePath });
    await expect(store.getConversation('missing')).rejects.toMatchObject({
      code: 'CHAT_STORE_IO',
    });
    await expect(
      store.createConversation({ initialMessage })
    ).rejects.toMatchObject({ code: 'CHAT_STORE_IO' });
    expect(await fs.readlink(filePath)).toBe('missing.json');
    await fs.unlink(filePath);
    await fs.mkdir(filePath);
    await expect(store.getConversation('missing')).rejects.toMatchObject({
      code: 'CHAT_STORE_IO',
    });
  });
  it('preserves a valid configured symlink on atomic writes', async () => {
    const filePath = await fixture();
    const target = path.join(path.dirname(filePath), 'actual.json');
    const first = await createFileChatStore({
      filePath: target,
    }).createConversation({ initialMessage });
    await fs.symlink('actual.json', filePath);
    await createFileChatStore({ filePath }).appendCustomerMessage(
      first.conversation.id,
      first.customerToken,
      'through alias'
    );
    expect(await fs.readlink(filePath)).toBe('actual.json');
    expect(
      (
        await createFileChatStore({ filePath: target }).getConversation(
          first.conversation.id
        )
      ).messages.at(-1).text
    ).toBe('through alias');
  });
  it('rejects an occupied lock without writing and recovers after release', async () => {
    const filePath = await fixture();
    const store = createFileChatStore({ filePath, lockTimeoutMs: 20 });
    await store.createConversation({ initialMessage });
    const before = await fs.readFile(filePath, 'utf8');
    const unlock = await acquirePriceImportLock(filePath + '.lock');
    try {
      await expect(
        store.createConversation({ initialMessage: 'blocked' })
      ).rejects.toMatchObject({ code: 'CHAT_STORE_BUSY' });
      expect(await fs.readFile(filePath, 'utf8')).toBe(before);
    } finally {
      await unlock();
    }
    expect(
      (
        await store.createConversation({ initialMessage: 'after release' })
      ).conversation.messages.at(-1).text
    ).toBe('after release');
  });
  it('serializes concurrent writers across instances/processes and readers see complete snapshots', async () => {
    const filePath = await fixture();
    const first = await createFileChatStore({ filePath }).createConversation({
      initialMessage,
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createFileChatStore({ filePath }).appendCustomerMessage(
          first.conversation.id,
          first.customerToken,
          'local-' + i
        )
      )
    );
    const code = `import {createFileChatStore} from ${JSON.stringify(moduleUrl)}; const s=createFileChatStore({filePath:process.argv[1]});for(let i=0;i<4;i++)await s.appendCustomerMessage(process.argv[2],process.argv[3],process.argv[4]+'-'+i);`;
    await Promise.all([
      ...Array.from({ length: 3 }, (_, i) =>
        exec(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            code,
            filePath,
            first.conversation.id,
            first.customerToken,
            'child' + i,
          ],
          { env: childEnv() }
        )
      ),
      (async () => {
        for (let i = 0; i < 20; i++) {
          const state = JSON.parse(await fs.readFile(filePath, 'utf8'));
          expect(state.conversations).toHaveLength(1);
          await new Promise((r) => setTimeout(r, 2));
        }
      })(),
    ]);
    const final = await createFileChatStore({ filePath }).getConversation(
      first.conversation.id
    );
    const customer = final.messages.filter((m) => m.role === 'customer');
    expect(customer).toHaveLength(21);
    expect(new Set(customer.map((m) => m.text)).size).toBe(21);
    expect(
      await createFileChatStore({ filePath }).getConversationForCustomer(
        first.conversation.id,
        'wrong'
      )
    ).toBeNull();
  });
});
