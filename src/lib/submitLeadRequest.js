import { expectOkApiJson } from './apiResponse';

// Keep the timeout around reading the response body as well as the upload.
export async function submitLeadRequest(
  payload,
  file,
  { timeoutMs = 60000, endpoint = '/api/lead-request' } = {}
) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'Не удалось дождаться подтверждения. Повторите отправку — данные сохранены.'
        )
      );
      controller.abort();
    }, timeoutMs);
  });
  const request = (async () => {
    const body = new FormData();
    body.append('payload', JSON.stringify(payload));
    const files = Array.isArray(file) ? file : file ? [file] : [];
    for (const attachment of files)
      body.append('specifications', attachment, attachment.name);
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      ...(files.length
        ? { body }
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
    });
    return expectOkApiJson(
      response,
      'Не удалось отправить заявку. Попробуйте ещё раз.'
    );
  })();
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Не удалось связаться с сервером. Проверьте подключение и повторите отправку — данные сохранены.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
