// @vitest-environment jsdom
// Файл проверяет лид-форму главной страницы, валидацию и успешную отправку.

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeroLeadForm from './HeroLeadForm.jsx';

describe('HeroLeadForm render flow', () => {
  it('связывает ошибки телефона и согласия с полями формы', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<HeroLeadForm />);

    await user.click(screen.getByRole('button', { name: 'Получить КП' }));

    const phoneInput = screen.getByLabelText('Ваш телефон');
    const consentInput = screen.getByLabelText(
      'Даю согласие на обработку персональных данных'
    );
    const phoneError = screen.getByText('Укажите корректный телефон');
    const consentError = screen.getByText('Нужно согласие на обработку данных');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-describedby', phoneError.id);
    expect(phoneInput).toHaveAccessibleDescription(phoneError.textContent);
    expect(consentInput).toHaveAttribute('aria-invalid', 'true');
    expect(consentInput).toHaveAttribute('aria-describedby', consentError.id);
    expect(consentInput).toHaveAccessibleDescription(consentError.textContent);
  });

  it('показывает ссылку на политику конфиденциальности рядом с согласием', () => {
    render(<HeroLeadForm />);

    expect(
      screen.getByRole('link', { name: /обработку персональных\sданных/i })
    ).toHaveAttribute('href', '/privacy');
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
