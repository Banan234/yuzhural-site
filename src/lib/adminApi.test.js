import { describe, expect, it } from 'vitest';
import { readAdminResponse } from './adminApi.js';
describe('admin response handling', () => {
  it('replaces HTML and browser JSON parse errors with a readable service error', async () => {
    const response = new Response('<!DOCTYPE html><h1>Not found</h1>', {
      status: 404,
    });
    await expect(readAdminResponse(response)).rejects.toMatchObject({
      status: 404,
      message:
        'Сервис управления временно недоступен. Обновите страницу или повторите позже.',
    });
  });
  it('preserves expected unauthenticated and setup responses', async () => {
    for (const status of [401, 503]) {
      const response = new Response(
        JSON.stringify({ message: 'Сообщение сервера' }),
        { status }
      );
      await expect(readAdminResponse(response)).rejects.toMatchObject({
        status,
        message: 'Сообщение сервера',
      });
    }
  });
  it('returns a successful session response', async () => {
    await expect(
      readAdminResponse(new Response(JSON.stringify({ csrf: 'token' })))
    ).resolves.toEqual({ csrf: 'token' });
  });
});
