// @vitest-environment jsdom
// Файл проверяет лид-форму главной страницы, валидацию и успешную отправку.

import '../../test/renderTestSetup.js';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeroLeadForm from './HeroLeadForm.jsx';
import { expectFieldError } from '../../test/assertFieldError.js';

describe('HeroLeadForm render flow', () => {
  it('отправляет файл с заказом звонка и сохраняет его после ошибки', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Ошибка отправки'));
    vi.stubGlobal('fetch', fetchMock);
    render(<HeroLeadForm mode="callback" submitLabel="Заказать звонок" />);
    const file = new File(['%PDF-1.7'], 'Заявка.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText('Прикрепить файл'), file);
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ошибка отправки'
    );
    expect(
      screen.getByRole('button', { name: 'Удалить файл Заявка.pdf' })
    ).toBeEnabled();
    const request = fetchMock.mock.calls[0][1];
    expect(request.headers).toBeUndefined();
    expect(request.body.get('specifications').name).toBe(file.name);
    expect(JSON.parse(request.body.get('payload'))).toMatchObject({
      requestType: 'callback',
      consent: true,
    });
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1].body.get('specifications').name).toBe(
      file.name
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body.get('payload')).submissionId
    ).toBe(JSON.parse(request.body.get('payload')).submissionId);
    await user.click(
      screen.getByRole('button', { name: 'Удалить файл Заявка.pdf' })
    );
    expect(screen.getByLabelText('Прикрепить файл')).toBeEnabled();
  });

  it('восстанавливает черновик после закрытия и очищает после отправки', async () => {
    const user = userEvent.setup();
    const draftRef = { current: null };
    const props = {
      mode: 'callback',
      submitLabel: 'Заказать звонок',
      draftRef,
    };
    const first = render(<HeroLeadForm {...props} />);
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.type(
      screen.getByLabelText(/О чём хотите узнать/),
      'Нужен кабель'
    );
    const file = new File(['%PDF-1.7'], 'Список.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByLabelText('Прикрепить файл'), file);
    await user.click(screen.getByLabelText(/Даю согласие/));
    first.unmount();
    const second = render(<HeroLeadForm {...props} />);
    expect(screen.getByLabelText('Ваш телефон')).toHaveValue('+7 (900) 123-45-67');
    expect(screen.getByLabelText(/О чём хотите узнать/)).toHaveValue(
      'Нужен кабель'
    );
    expect(screen.getByLabelText(/О чём хотите узнать/)).toHaveAttribute(
      'rows',
      '2'
    );
    expect(screen.getByLabelText(/Даю согласие/)).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Удалить файл Список.pdf' })
    ).toBeEnabled();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    );
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await screen.findByRole('status');
    expect(draftRef.current).toBeNull();
    second.unmount();
    render(<HeroLeadForm {...props} />);
    expect(screen.getByLabelText('Ваш телефон')).toHaveValue('');
    expect(screen.getByLabelText('Прикрепить файл')).toBeEnabled();
  });

  it('позволяет исправить отправленный номер и помечает новую отправку как исправление', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<HeroLeadForm mode="callback" submitLabel="Заказать звонок" />);
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await user.click(
      await screen.findByRole('button', { name: 'Изменить заявку' })
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Ваш телефон')).toHaveFocus()
    );
    expect(screen.getByLabelText(/Даю согласие/)).not.toBeChecked();
    await user.clear(screen.getByLabelText('Ваш телефон'));
    await user.type(screen.getByLabelText('Ваш телефон'), '+79009998877');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await screen.findByRole('status');
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const correction = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(correction).toMatchObject({
      previousPhone: '+7 (900) 123-45-67',
      phone: '+7 (900) 999-88-77',
    });
    expect(correction.submissionId).not.toBe(first.submissionId);
  });

  it('при повторном открытии продолжает ждать тот же запрос и сохраняет антибот-таймер', async () => {
    const user = userEvent.setup();
    const draftRef = { current: null };
    let finish;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const props = {
      mode: 'callback',
      submitLabel: 'Заказать звонок',
      draftRef,
    };
    const first = render(<HeroLeadForm {...props} />);
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    const renderedAt = draftRef.current.renderedAt;
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    first.unmount();
    render(<HeroLeadForm {...props} />);
    expect(screen.getByRole('button', { name: 'Отправка...' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(draftRef.current.renderedAt).toBe(renderedAt);
    await act(async () =>
      finish({ ok: true, json: async () => ({ ok: true }) })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('+7 (900) 123-45-67');
    expect(draftRef.current).toBeNull();
  });

  it('сохраняет идентификатор после закрытия при ошибке и позволяет повторить отправку', async () => {
    const user = userEvent.setup();
    const draftRef = { current: null };
    const fetchMock = vi.fn().mockRejectedValue(new Error('Сеть недоступна'));
    vi.stubGlobal('fetch', fetchMock);
    const props = {
      mode: 'callback',
      submitLabel: 'Заказать звонок',
      draftRef,
    };
    const first = render(<HeroLeadForm {...props} />);
    await user.type(screen.getByLabelText('Ваш телефон'), '+79001234567');
    await user.click(screen.getByLabelText(/Даю согласие/));
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await screen.findByRole('alert');
    const original = JSON.parse(fetchMock.mock.calls[0][1].body);
    first.unmount();
    render(<HeroLeadForm {...props} />);
    await user.click(screen.getByRole('button', { name: 'Заказать звонок' }));
    await screen.findByRole('alert');
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retry.submissionId).toBe(original.submissionId);
    expect(retry.rendered_at).toBe(original.rendered_at);
  });

  it('связывает ошибки телефона и согласия с полями формы', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<HeroLeadForm />);

    expect(
      screen.getByRole('link', { name: /обработку персональных\sданных/i })
    ).toHaveAttribute('href', '/personal-data-consent');
    await user.click(screen.getByRole('button', { name: 'Получить КП' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expectFieldError(screen.getByRole('textbox', { name: /телефон/i }));
    expectFieldError(screen.getByRole('checkbox', { name: /согласи/i }));
  });

  it('обновляет комментарий, если форма открывается с новым defaultComment', async () => {
    const { rerender } = render(
      <HeroLeadForm defaultComment="ВВГ 3x2.5, 500 метров" />
    );

    expect(screen.getByLabelText(/Комментарий/)).toHaveValue(
      'ВВГ 3x2.5, 500 метров'
    );

    rerender(<HeroLeadForm defaultComment="КГ 4x1.5, 300 метров" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Комментарий/)).toHaveValue(
        'КГ 4x1.5, 300 метров'
      );
    });
  });
});
