import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createFormDelivery,
  formatMailTime,
  mailPageLink,
} from './formDelivery.js';
const dirs = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }))
  );
});
const input = () => ({
  kind: 'quote',
  submissionId: 'test-submission-00001',
  payload: { name: 'Клиент' },
  managerMail: {
    from: 'sales@example.test',
    to: 'sales@example.test',
    subject: 'КП',
    html: 'Состав',
  },
  customerEmail: 'buyer@example.test',
  customerSummary: '<p>Кабель</p>',
});
const env = { QUOTE_TO_EMAIL: 'sales@example.test' };
describe('persistent form delivery', () => {
  it('sends manager and receipt once, including after reconstruction', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'yuek-delivery-')
    );
    dirs.push(directory);
    const sendMail = vi.fn().mockResolvedValue({});
    const deliver = createFormDelivery({ env, sendMail, directory });
    const [a, b] = await Promise.all([deliver(input()), deliver(input())]);
    expect(a).toEqual(b);
    expect(a.receiptEmailStatus).toBe('sent');
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(
      await createFormDelivery({ env, sendMail, directory })(input())
    ).toEqual(a);
    expect(sendMail).toHaveBeenCalledTimes(2);
    const stored = await fs.readFile(
      path.join(directory, (await fs.readdir(directory))[0]),
      'utf8'
    );
    expect(stored).not.toContain('Клиент');
    expect(sendMail.mock.calls[1][0]).toMatchObject({
      to: 'buyer@example.test',
      replyTo: 'sales@example.test',
    });
  });
  it('rejects changed data and retains accepted manager delivery when receipt is rejected', async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error('rejected'), { responseCode: 550 })
      )
      .mockResolvedValue({});
    const deliver = createFormDelivery({ env, sendMail, directory: null });
    const first = await deliver(input());
    expect(first.receiptEmailStatus).toBe('pending');
    expect((await deliver(input())).receiptEmailStatus).toBe('sent');
    expect(
      sendMail.mock.calls.filter(([m]) => m.to === 'sales@example.test')
    ).toHaveLength(1);
    await expect(
      deliver({ ...input(), payload: { name: 'Другой' } })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not resend after an ambiguous SMTP timeout, including after restart', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'yuek-delivery-')
    );
    dirs.push(directory);
    const sendMail = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
      );
    await expect(
      createFormDelivery({ env, sendMail, directory })(input())
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      createFormDelivery({ env, sendMail, directory })(input())
    ).rejects.toMatchObject({ status: 503 });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('uses local working time and does not build foreign or unsafe page links', () => {
    expect(formatMailTime('2026-11-06T06:00:00Z')).toContain('11:00');
    expect(
      mailPageLink('/catalog/', { SITE_URL: 'http://localhost:5173' })
    ).toContain('http://localhost:5173/catalog/');
    expect(
      mailPageLink('javascript:alert(1)', { SITE_URL: 'https://example.test' })
    ).not.toContain('<a');
  });
});
