// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import HeroLeadForm from './HeroLeadForm.jsx';

describe('compact quote', () => {
  it('отправляет товар и три вложения без имени и email, сохраняет их при ошибке', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Повторите отправку' }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, message: 'Принято' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const onSent = vi.fn();
    render(
      <HeroLeadForm
        mode="callback"
        title="Отправить заявку"
        submitLabel="Отправить заявку"
        quoteItems={[
          { id: 1, title: 'ВВГ 3х2.5', quantity: 10, price: 100, unit: 'м' },
        ]}
        onQuoteSent={onSent}
      />
    );
    expect(screen.queryByLabelText(/Имя/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.type(
      screen.getByLabelText(/О чём хотите узнать/),
      'Нужен кабель'
    );
    await user.upload(
      screen.getByLabelText('Прикрепить файлы'),
      [1, 2, 3].map(
        (i) =>
          new File(['%PDF-1.4'], `spec-${i}.pdf`, { type: 'application/pdf' })
      )
    );
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Повторите отправку'
    );
    expect(
      screen.getByRole('button', { name: 'Удалить файл spec-3.pdf' })
    ).toBeEnabled();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/quote');
    expect(request.body.getAll('specifications')).toHaveLength(3);
    expect(JSON.parse(request.body.get('payload'))).toMatchObject({
      customer: {
        name: '',
        phone: '+7 (900) 123-45-67',
        comment: 'Нужен кабель',
        consent: true,
      },
      items: [{ id: 1, quantity: 10 }],
    });
    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });
});
