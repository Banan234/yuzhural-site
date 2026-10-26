// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HomeHeroCarousel from './HomeHeroCarousel';

function setup() {
  return render(
    <MemoryRouter>
      <HomeHeroCarousel />
    </MemoryRouter>
  );
}

describe('HomeHeroCarousel', () => {
  it('автоматически переключается через шесть секунд и приостанавливается при наведении', () => {
    vi.useFakeTimers();
    const view = setup();
    try {
      const hero = document.querySelector('.home-concept__hero');
      const counter = () =>
        document.querySelector('.home-concept__hero-counter').textContent;
      act(() => vi.advanceTimersByTime(5999));
      expect(counter()).toContain('01 / 03');
      act(() => vi.advanceTimersByTime(1));
      expect(counter()).toContain('02 / 03');
      fireEvent.mouseEnter(hero);
      act(() => vi.advanceTimersByTime(12000));
      expect(counter()).toContain('02 / 03');
      fireEvent.mouseLeave(hero);
      act(() => vi.advanceTimersByTime(6000));
      expect(counter()).toContain('03 / 03');
      act(() => vi.advanceTimersByTime(6000));
      expect(counter()).toContain('01 / 03');
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('начинает с основного предложения и циклически листает стрелками', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'id',
      'home-hero-title'
    );
    expect(
      screen.getByRole('link', { name: /Отправить спецификацию/ })
    ).toHaveAttribute('href', '/specification/');
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий слайд' }));
    expect(
      screen.getByRole('link', { name: /Получение заказа/ })
    ).toHaveAttribute('href', '/delivery/');
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });
  it('переключается по индикатору и оставляет только текущий слайд доступным', () => {
    setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Показать слайд 2: Подбор кабеля' })
    );
    expect(
      screen.getByRole('link', { name: /Подобрать кабель/ })
    ).toHaveAttribute('href', '/services/application/');
    expect(
      screen.getByRole('link', { name: 'Рассчитать сечение' })
    ).toHaveAttribute('href', '/calculator/section/');
    expect(
      screen.queryByRole('link', { name: /Отправить спецификацию/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать слайд 2: Подбор кабеля' })
    ).toHaveAttribute('aria-current', 'true');
    expect(
      document.querySelectorAll('.home-concept__hero-slide[inert]')
    ).toHaveLength(2);
  });
  it('поддерживает клавиатуру без перехвата сочетаний с модификаторами', () => {
    setup();
    const next = screen.getByRole('button', { name: 'Следующий слайд' });
    fireEvent.keyDown(next, { key: 'ArrowRight', ctrlKey: true });
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(
      screen.getByRole('link', { name: 'Рассчитать сечение' })
    ).toBeVisible();
    fireEvent.keyDown(next, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
