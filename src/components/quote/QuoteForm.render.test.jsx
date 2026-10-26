// @vitest-environment jsdom
// Файл проверяет форму КП, добавленные позиции, валидацию и пользовательские сценарии отправки.

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuoteForm from './QuoteForm.jsx';
import { expectFieldError } from '../../test/assertFieldError.js';

const quoteItem = {
  id: 101,
  sku: 'VVG-001',
  title: 'ВВГнг-LS 3x2.5',
  category: 'Силовой кабель',
  price: 120,
  quantity: 2,
  unit: 'м',
};

async function fillRequiredFields(user) {
  await user.type(screen.getByLabelText(/Имя/), 'Иван Петров');
  await user.type(screen.getByLabelText(/Телефон/), '+7 900 123-45-67');
  await user.click(screen.getByLabelText(/Даю согласие/));
}

describe('QuoteForm render flow', () => {
  it('рендерит checkbox согласия и ссылку на политику', () => {
    render(<QuoteForm itemsOverride={[quoteItem]} />);

    expect(
      screen.getByRole('checkbox', { name: /согласи/i })
    ).not.toBeChecked();
    expect(
      screen.getByRole('link', { name: /обработку персональных\sданных/i })
    ).toHaveAttribute('href', '/personal-data-consent');
  });

  it('не сохраняет контактные данные в localStorage и удаляет старый черновик', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'yuzhural-quote-form',
      JSON.stringify({
        name: 'Старое имя',
        phone: '+7 900 000-00-00',
        email: 'old@example.test',
        comment: 'старый комментарий',
      })
    );

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    expect(screen.getByLabelText(/Имя/)).toHaveValue('');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('');
    expect(localStorage.getItem('yuzhural-quote-form')).toBeNull();

    await fillRequiredFields(user);
    await user.type(
      screen.getByRole('textbox', { name: /Email/ }),
      'buyer@company.ru'
    );
    await user.type(screen.getByLabelText(/Комментарий/), 'Не сохранять');

    expect(localStorage.getItem('yuzhural-quote-form')).toBeNull();
  });

  it('блокирует отправку при пустой корзине и не вызывает API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/корзин.*пуст/i)).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('блокирует отправку без согласия и не вызывает API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await user.type(screen.getByLabelText(/Имя/), 'Иван Петров');
    await user.type(screen.getByLabelText(/Телефон/), '+7 900 123-45-67');
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expectFieldError(screen.getByRole('checkbox', { name: /согласи/i }));
  });

  it('показывает success-сообщение после успешной отправки', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'Заявка принята' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Заявка принята'
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(request.method).toBe('POST');
    expect(payload.customer).toMatchObject({
      name: 'Иван Петров',
      phone: '+7 900 123-45-67',
      preferredChannel: 'phone',
      consent: true,
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.totalCount).toBe(1);
    expect(payload.totalPrice).toBe(240);
  });

  it('требует email, если выбран канал связи Email', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('Email'));
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    const emailInput = screen.getByRole('textbox', { name: /Email/ });
    expectFieldError(emailInput);
  });

  it('показывает ошибку, когда сервер возвращает ok:false', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, message: 'Сервис временно недоступен' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(
      await screen.findByText('Сервис временно недоступен')
    ).toBeInTheDocument();
    // Ошибка ⇒ нет success-сообщения, форма не очистилась
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Имя/)).toHaveValue('Иван Петров');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('+7 900 123-45-67');
  });

  it('показывает понятную ошибку при network failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
    // Кнопка снова активна — пользователь может повторить
    const submitButton = screen.getByRole('button', {
      name: /отправить.*КП/i,
    });
    expect(submitButton).not.toBeDisabled();
  });

  it('блокирует повторную отправку до получения ответа', async () => {
    const user = userEvent.setup();
    let resolveFetch;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    const submitButton = screen.getByRole('button', {
      name: /Отправить.*КП/,
    });
    await user.click(submitButton);
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Резолвим — после успеха кнопка возвращается
    resolveFetch({
      ok: true,
      json: async () => ({ ok: true, message: 'Готово' }),
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Готово');
    expect(submitButton).toBeEnabled();
  });

  it('успешно отправляет с email-каналом, когда email указан', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'Принято' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.type(
      screen.getByRole('textbox', { name: /Email/ }),
      'buyer@company.ru'
    );
    await user.click(screen.getByLabelText('Email'));
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Принято');
    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.customer.preferredChannel).toBe('email');
    expect(payload.customer.email).toBe('buyer@company.ru');
  });

  it('очищает форму и комментарий после успешной отправки', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'OK' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await fillRequiredFields(user);
    await user.type(
      screen.getByLabelText(/Комментарий/),
      'Срочно, до конца недели'
    );
    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('OK');

    expect(screen.getByLabelText(/Имя/)).toHaveValue('');
    expect(screen.getByLabelText(/Телефон/)).toHaveValue('');
    expect(screen.getByLabelText(/Комментарий/)).toHaveValue('');
    // Канал по умолчанию — phone
    expect(screen.getByLabelText('Звонок')).toBeChecked();
  });

  it('связывает обязательные поля с ошибками через aria-describedby', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<QuoteForm itemsOverride={[quoteItem]} />);

    await user.click(screen.getByRole('button', { name: /отправить.*КП/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expectFieldError(screen.getByRole('textbox', { name: /имя/i }));
    expectFieldError(screen.getByRole('textbox', { name: /телефон/i }));
    expectFieldError(screen.getByRole('checkbox', { name: /согласи/i }));
  });
});
