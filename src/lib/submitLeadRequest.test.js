import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitLeadRequest } from './submitLeadRequest';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('submitLeadRequest', () => {
  it('times out even if the transport never settles and aborts the upload', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const promise = submitLeadRequest({}, null, { timeoutMs: 100 });
    const rejected = expect(promise).rejects.toThrow(
      'Не удалось дождаться подтверждения'
    );
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('explains a network failure in Russian', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );
    await expect(submitLeadRequest({}, null)).rejects.toThrow(
      'Проверьте подключение'
    );
  });

  it('also bounds a stalled response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => new Promise(() => {}) })
    );
    const rejected = expect(
      submitLeadRequest({}, null, { timeoutMs: 100 })
    ).rejects.toThrow('данные сохранены');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
  });
});
