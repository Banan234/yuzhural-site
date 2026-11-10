export async function readAdminResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(
      new Error(
        'Сервис управления временно недоступен. Обновите страницу или повторите позже.'
      ),
      { status: response.status }
    );
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(
        typeof result?.message === 'string'
          ? result.message
          : 'Не удалось выполнить действие'
      ),
      { status: response.status }
    );
  }
  return result;
}
