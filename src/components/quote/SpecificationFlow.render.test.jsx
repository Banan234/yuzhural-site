// @vitest-environment jsdom
import '../../test/renderTestSetup';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import QuoteForm from './QuoteForm';
describe('specification form', () => {
  it('отправляет файлы и параметры одной multipart-заявкой и показывает её состав', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: 'Заявка принята' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<QuoteForm itemsOverride={[]} defaultComment="Требуется 200 м" />);
    const file = new File(['%PDF-1.4'], 'спецификация.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText('Прикрепить спецификацию'), file);
    await user.type(screen.getByLabelText(/Имя/), 'Иван');
    await user.type(screen.getByLabelText(/Телефон/), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(
      screen.getByRole('button', { name: 'Отправить запрос КП' })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1];
    expect(request.headers).toBeUndefined();
    expect(request.body.getAll('specifications')[0].name).toBe(file.name);
    expect(JSON.parse(request.body.get('payload'))).toMatchObject({
      items: [],
      customer: { comment: 'Требуется 200 м' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Заявка принята'
    );
    expect(screen.getByText('спецификация.pdf')).toBeInTheDocument();
  });
  it('сохраняет файл и введённые поля после серверной ошибки', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, message: 'Отправка недоступна' }),
      })
    );
    render(<QuoteForm itemsOverride={[]} />);
    await user.upload(
      screen.getByLabelText('Прикрепить спецификацию'),
      new File(['%PDF-1.4'], 'список.pdf', { type: 'application/pdf' })
    );
    await user.type(screen.getByLabelText(/Имя/), 'Иван');
    await user.type(screen.getByLabelText(/Телефон/), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(
      screen.getByRole('button', { name: 'Отправить запрос КП' })
    );
    expect(await screen.findByText('Отправка недоступна')).toBeInTheDocument();
    expect(screen.getByLabelText(/Имя/)).toHaveValue('Иван');
    expect(
      screen.getByRole('button', { name: 'Убрать файл список.pdf' })
    ).toBeInTheDocument();
  });
});
