import { describe, expect, it, vi } from 'vitest';
import { createLeadDeduplication } from './leadDeduplication.js';

describe('lead deduplication', () => {
  it('shares an in-flight send and remembers success', async () => {
    const once = createLeadDeduplication();
    let finish;
    const send = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = once('callback-request-0001', { phone: '1' }, [], send);
    const second = once('callback-request-0001', { phone: '1' }, [], send);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    finish('sent');
    expect(await Promise.all([first, second])).toEqual(['sent', 'sent']);
    expect(await once('callback-request-0001', { phone: '1' }, [], send)).toBe(
      'sent'
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('allows retry after failure and rejects different attachments for the same id', async () => {
    const once = createLeadDeduplication();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue('sent');
    const file = { filename: 'list.pdf', content: Buffer.from('one') };
    await expect(
      once('callback-request-0002', {}, [file], send)
    ).rejects.toThrow('failed');
    await expect(once('callback-request-0002', {}, [file], send)).resolves.toBe(
      'sent'
    );
    await expect(
      once(
        'callback-request-0002',
        {},
        [{ ...file, content: Buffer.from('two') }],
        send
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('expires completed entries and refuses overflow without dropping active sends', async () => {
    const once = createLeadDeduplication({ ttlMs: 100, maxEntries: 1 });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const send = vi.fn().mockResolvedValue('sent');
      await once('callback-request-0003', {}, [], send);
      await expect(
        once('callback-request-0004', {}, [], send)
      ).rejects.toMatchObject({ status: 503 });
      now.mockReturnValue(1100);
      await once('callback-request-0004', {}, [], send);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });
});
