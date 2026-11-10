// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import AnimatedDetails from './AnimatedDetails';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AnimatedDetails', () => {
  it('keeps the answer open during closing and supports reversing a transition', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const animations = [];
    const view = render(
      <AnimatedDetails title="Вопрос">Ответ</AnimatedDetails>
    );
    const details = view.container.querySelector('details');
    details.animate = vi.fn(() => {
      const animation = { cancel: vi.fn(), onfinish: null };
      animations.push(animation);
      return animation;
    });
    const summary = screen.getByText('Вопрос');
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    animations[0].onfinish();
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.click(summary);
    expect(animations[1].cancel).toHaveBeenCalledOnce();
    animations[2].onfinish();
    expect(details.open).toBe(true);
    fireEvent.click(summary);
    animations[3].onfinish();
    expect(details.open).toBe(false);
  });

  it('uses native toggling with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const view = render(
      <AnimatedDetails title="Вопрос">Ответ</AnimatedDetails>
    );
    const details = view.container.querySelector('details');
    details.animate = vi.fn();
    fireEvent.click(screen.getByText('Вопрос'));
    expect(details.open).toBe(true);
    expect(details.animate).not.toHaveBeenCalled();
  });
});
