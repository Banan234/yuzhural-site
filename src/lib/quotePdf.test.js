import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
const doc = () => ({ addFileToVFS: vi.fn(), addFont: vi.fn() });
const response = () => ({
  ok: true,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
});
it('retries the failed font load without reloading the module and retains the successful cache', async () => {
  vi.resetModules();
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(response());
  vi.stubGlobal('fetch', fetchMock);
  const { registerFonts } = await import('./quotePdf.js');
  await expect(registerFonts(doc())).rejects.toThrow('network');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await registerFonts(doc());
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await registerFonts(doc());
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
it('shares a single in-flight pair of font downloads', async () => {
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetchMock);
  const { registerFonts } = await import('./quotePdf.js');
  const one = doc(),
    two = doc();
  await Promise.all([registerFonts(one), registerFonts(two)]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(one.addFont).toHaveBeenCalledTimes(2);
  expect(two.addFont).toHaveBeenCalledTimes(2);
});

it('does not create a zero-total PDF when every row is pending', async () => {
  vi.resetModules();
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { generateQuotePdf } = await import('./quotePdf.js');
  await expect(
    generateQuotePdf({
      items: [{ id: 58, price: 999, quantity: 100, dataStatus: 'pending' }],
    })
  ).rejects.toThrow('список позиций пуст');
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['шт', 'м', 'кг'])(
  'rejects non-integer %s before font loading',
  async (unit) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { generateQuotePdf } = await import('./quotePdf.js');
    await expect(
      generateQuotePdf({
        items: [{ id: 1, price: 99.99, quantity: 0.5, unit }],
      })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  }
);
