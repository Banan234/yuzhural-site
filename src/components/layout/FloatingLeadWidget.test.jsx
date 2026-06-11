// @vitest-environment jsdom
// Файл проверяет базовое состояние виджета и создание живого диалога.

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FloatingLeadWidget from './FloatingLeadWidget.jsx';

function createJsonResponse(payload, ok = true) {
  return {
    ok,
    text: async () => JSON.stringify(payload),
  };
}

describe('FloatingLeadWidget', () => {
  it('по умолчанию остаётся закрытым', () => {
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    expect(
      screen.getByRole('button', { name: 'Чат с менеджером' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Чат с менеджером' })
    ).not.toBeInTheDocument();
  });

  it('может автоматически раскрыться на десктопе при включённом autoOpen', async () => {
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget autoOpen />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Чат с менеджером' })
      ).toBeInTheDocument();
    });
  });

  it('не отправляет первое сообщение без согласия', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    await user.click(screen.getByRole('button', { name: 'Чат с менеджером' }));
    await screen.findByRole('heading', { name: 'Чат с менеджером' });
    await user.type(
      screen.getByLabelText('Введите сообщение'),
      'Нужен ВВГ 3x2.5'
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' })
    );

    const consentError = await screen.findByText(
      'Нужно согласие на обработку данных'
    );
    const consentInput = screen.getByLabelText(/Даю согласие/);

    expect(consentError).toBeInTheDocument();
    expect(consentInput).toHaveAttribute('aria-invalid', 'true');
    expect(consentInput).toHaveAttribute('aria-describedby', consentError.id);
    expect(consentInput).toHaveAccessibleDescription(consentError.textContent);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('yuzhural-chat-session')).toBeNull();
  });

  it('создаёт сессию при первом сообщении с согласием', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/chat/conversations') {
        expect(init).toMatchObject({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(JSON.parse(init.body)).toMatchObject({
          message: 'Нужен ВВГ 3x2.5',
          source: 'Чат: Главная страница',
        });
        expect(JSON.parse(init.body)).not.toHaveProperty('phone');
        return createJsonResponse({
          ok: true,
          message: 'Диалог начат. Менеджер ответит здесь в рабочее время.',
          conversationId: 'chat-1',
          customerToken: 'customer-token',
          conversation: {
            id: 'chat-1',
            messages: [
              {
                id: 'm1',
                role: 'manager',
                text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
                createdAt: '2026-05-15T10:00:00.000Z',
              },
              {
                id: 'm2',
                role: 'customer',
                text: 'Нужен ВВГ 3x2.5',
                createdAt: '2026-05-15T10:00:01.000Z',
              },
            ],
          },
        });
      }

      if (url === '/api/chat/conversations/chat-1') {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer customer-token',
          },
        });
        return createJsonResponse({
          ok: true,
          conversation: {
            id: 'chat-1',
            messages: [
              {
                id: 'm1',
                role: 'manager',
                text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
                createdAt: '2026-05-15T10:00:00.000Z',
              },
              {
                id: 'm2',
                role: 'customer',
                text: 'Нужен ВВГ 3x2.5',
                createdAt: '2026-05-15T10:00:01.000Z',
              },
            ],
          },
        });
      }

      return createJsonResponse(
        {
          ok: false,
          message: 'unexpected',
        },
        false
      );
    });

    vi.stubGlobal('fetch', fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    await user.click(screen.getByRole('button', { name: 'Чат с менеджером' }));

    await screen.findByRole('heading', { name: 'Чат с менеджером' });
    expect(screen.queryByLabelText('Телефон')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /обработку персональных/ })
    ).toHaveAttribute('href', '/privacy');
    await user.click(screen.getByLabelText(/Даю согласие/));
    expect(screen.getByLabelText(/Даю согласие/)).toBeChecked();
    await user.type(
      screen.getByLabelText('Введите сообщение'),
      'Нужен ВВГ 3x2.5'
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/conversations',
        expect.any(Object)
      );
    });

    expect(await screen.findByText('Нужен ВВГ 3x2.5')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('yuzhural-chat-session'))
    ).toMatchObject({
      conversationId: 'chat-1',
      customerToken: 'customer-token',
    });
  });

  it('после закрытия показывает широкий launcher с текстом сообщения', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget autoOpen />);

    await user.click(await screen.findByLabelText('Свернуть виджет'));

    expect(
      screen.getByRole('button', { name: 'Чат с менеджером' })
    ).toBeInTheDocument();
  });

  it('не создаёт новый диалог, пока восстанавливает сохранённую сессию', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (url) =>
        new Promise((resolve) => {
          if (url === '/api/chat/conversations/chat-1') {
            return;
          }

          resolve(
            createJsonResponse(
              {
                ok: false,
                message: 'unexpected',
              },
              false
            )
          );
        })
    );

    localStorage.setItem(
      'yuzhural-chat-session',
      JSON.stringify({
        conversationId: 'chat-1',
        customerToken: 'customer-token',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    await user.click(screen.getByRole('button', { name: 'Чат с менеджером' }));
    await screen.findByRole('heading', { name: 'Чат с менеджером' });

    const textarea = screen.getByLabelText('Введите сообщение');
    await user.type(textarea, 'Есть вопрос');

    const submitButton = screen.getByRole('button', {
      name: 'Отправляем сообщение',
    });
    expect(submitButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/conversations/chat-1',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer customer-token',
        },
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/chat/conversations',
      expect.anything()
    );
  });

  it('отправляет сообщение в существующую сессию без повторного согласия', async () => {
    const user = userEvent.setup();
    const restoredConversation = {
      id: 'chat-1',
      messages: [
        {
          id: 'm1',
          role: 'manager',
          text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
          createdAt: '2026-05-15T10:00:00.000Z',
        },
      ],
    };
    const updatedConversation = {
      ...restoredConversation,
      messages: [
        ...restoredConversation.messages,
        {
          id: 'm2',
          role: 'customer',
          text: 'Есть вопрос по заказу',
          createdAt: '2026-05-15T10:01:00.000Z',
        },
      ],
    };
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/chat/conversations/chat-1') {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer customer-token',
          },
        });
        return createJsonResponse({
          ok: true,
          conversation: restoredConversation,
        });
      }

      if (url === '/api/chat/conversations/chat-1/messages') {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer customer-token',
            'Content-Type': 'application/json',
          },
        });
        expect(JSON.parse(init.body)).toMatchObject({
          message: 'Есть вопрос по заказу',
        });
        return createJsonResponse({
          ok: true,
          conversation: updatedConversation,
        });
      }

      return createJsonResponse(
        {
          ok: false,
          message: 'unexpected',
        },
        false
      );
    });

    localStorage.setItem(
      'yuzhural-chat-session',
      JSON.stringify({
        conversationId: 'chat-1',
        customerToken: 'customer-token',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<FloatingLeadWidget />);

    await user.click(screen.getByRole('button', { name: 'Чат с менеджером' }));
    await screen.findByRole('heading', { name: 'Чат с менеджером' });
    await screen.findByText(/Здравствуйте\.\s*У вас возникли вопросы/);

    expect(screen.queryByLabelText(/Даю согласие/)).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Введите сообщение'),
      'Есть вопрос по заказу'
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить сообщение' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/conversations/chat-1/messages',
        expect.any(Object)
      );
    });
    expect(
      fetchMock.mock.calls.some(([url]) => url === '/api/chat/conversations')
    ).toBe(false);
    expect(
      await screen.findByText('Есть вопрос по заказу')
    ).toBeInTheDocument();
  });
});
