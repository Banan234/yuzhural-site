// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import HeaderSearch from './HeaderSearch.jsx';

afterEach(() => vi.useRealTimers());

it('keeps the current example on focus and resumes with the next one on blur', () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <HeaderSearch />
    </MemoryRouter>
  );
  const input = screen.getByRole('combobox');
  const second = 'ВВГнг(А)-FRLS 3х2.5';
  for (let i = 0; i < 150 && input.placeholder !== second; i++) {
    act(() => vi.advanceTimersByTime(90));
  }
  expect(input.placeholder).toBe(second);
  fireEvent.focus(input);
  act(() => vi.advanceTimersByTime(10000));
  expect(input.placeholder).toBe(second);
  fireEvent.blur(input);
  act(() => vi.advanceTimersByTime(1700));
  expect(input.placeholder).toBe('ВВГнг(А)-LS 5х2.5');
  fireEvent.focus(input);
  expect(input.placeholder).toBe('ВВГнг(А)-LS 5х2.5');
  fireEvent.blur(input);
  act(() => vi.advanceTimersByTime(1200));
  expect(input.placeholder).toBe('КГ 4х16');
});
