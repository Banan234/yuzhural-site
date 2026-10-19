// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContactRequestForm from './ContactRequestForm';

afterEach(() => vi.unstubAllGlobals());

describe('ContactRequestForm', () => {
  it('возвращает пример после выхода из пустого поля телефона', async () => {
    const user = userEvent.setup();
    render(<ContactRequestForm />);
    const phone = screen.getByLabelText('Ваш телефон');
    await user.click(phone);
    expect(phone).toHaveValue('+7 (');
    await user.tab();
    expect(phone).toHaveValue('');
    expect(phone).toHaveAttribute('placeholder', '+7 (999) 123-45-67');
  });
  it('позволяет вводить 8 первой цифрой внутри скобок', async () => {
    const user = userEvent.setup();
    render(<ContactRequestForm />);
    const phone = screen.getByLabelText('Ваш телефон');
    await user.click(phone);
    expect(phone).toHaveValue('+7 (');
    await user.type(phone, '8123456789');
    expect(phone).toHaveValue('+7 (812) 345-67-89');
  });
  it.each([
    ['Телефон', 'Ваш телефон', '+79001234567', 'phone', 'Заказать звонок'],
    ['Email', 'Ваш email', 'buyer@example.com', 'email', 'Напишите мне'],
  ])(
    'отправляет только выбранный контакт: %s',
    async (channel, label, contact, key, button) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      vi.stubGlobal('fetch', fetchMock);
      render(<ContactRequestForm />);
      await user.click(
        screen.getByRole('radio', { name: channel, exact: true })
      );
      await user.type(screen.getByLabelText('Ваше имя'), 'Иван');
      await user.type(screen.getByLabelText(label), contact);
      await user.click(screen.getByLabelText(/Даю согласие/));
      await user.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload).toMatchObject({
        name: 'Иван',
        contactChannel: key,
        [key]: contact,
        consent: true,
      });
      expect(payload).not.toHaveProperty(key === 'email' ? 'phone' : 'email');
      expect(await screen.findByRole('status')).toHaveTextContent(contact);
    }
  );

  it('сохраняет оба контакта при переключении и не отправляет пустую форму', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ContactRequestForm />);
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ваше имя')).toHaveFocus();
    await user.type(screen.getByLabelText('Ваше имя'), 'Иван');
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByRole('radio', { name: 'Email', exact: true }));
    await user.type(screen.getByLabelText('Ваш email'), 'buyer@example.com');
    await user.click(
      screen.getByRole('radio', { name: 'Телефон', exact: true })
    );
    expect(screen.getByLabelText('Ваш телефон')).toHaveValue(
      '+7 (900) 123-45-67'
    );
    await user.click(screen.getByRole('radio', { name: 'Email', exact: true }));
    expect(screen.getByLabelText('Ваш email')).toHaveValue('buyer@example.com');
    expect(screen.getByLabelText('Ваше имя')).toHaveValue('Иван');
  });

  it('сохраняет контакт и показывает ошибку при недоступной отправке', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          message: 'Формы временно отключены',
        }),
      })
    );
    render(<ContactRequestForm />);
    await user.type(screen.getByLabelText('Ваше имя'), 'Иван');
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Формы временно отключены'
    );
    expect(screen.getByLabelText('Ваш телефон')).toHaveValue(
      '+7 (900) 123-45-67'
    );
  });
});
