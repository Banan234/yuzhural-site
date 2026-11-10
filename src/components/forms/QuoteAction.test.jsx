// @vitest-environment jsdom
import '../../test/renderTestSetup';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import QuoteAction from './QuoteAction';

describe('QuoteAction', () => {
  it('открывает форму на месте и переносит параметры подбора', () => {
    const listener = vi.fn();
    const closeMenu = vi.fn();
    window.addEventListener('open-quote-modal', listener);
    try {
      render(
        <MemoryRouter>
          <QuoteAction
            to="/specification/?request=ВВГ+3х2.5%2C+100+м"
            onClick={closeMenu}
          >
            Отправить заявку
          </QuoteAction>
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].detail.comment).toBe('ВВГ 3х2.5, 100 м');
      expect(closeMenu).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('open-quote-modal', listener);
    }
  });
  it('сохраняет обычную навигацию для других страниц', () => {
    render(
      <MemoryRouter>
        <QuoteAction to="/catalog/">Каталог</QuoteAction>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/catalog/'
    );
  });
});
