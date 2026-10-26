// @vitest-environment jsdom
// Файл проверяет лид-форму главной страницы, валидацию и успешную отправку.

import '../../test/renderTestSetup.js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeroLeadForm from './HeroLeadForm.jsx';
import { expectFieldError } from '../../test/assertFieldError.js';

describe('HeroLeadForm render flow', () => {
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
