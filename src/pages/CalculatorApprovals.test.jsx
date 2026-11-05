// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, it, expect } from 'vitest';
import CableSectionPage from './CableSectionPage.jsx';
import CableWeightPage from './CableWeightPage.jsx';
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
const mount = (Page) =>
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  );
it('preserves decimal comma and existing invalid-input messages in section calculator', () => {
  mount(CableSectionPage);
  fireEvent.click(screen.getByLabelText('Нагрузка задана'));
  fireEvent.click(screen.getByRole('option', { name: 'Током, А' }));
  const input = screen.getByLabelText('Ток нагрузки, А');
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveAttribute('inputmode', 'decimal');
  for (const value of ['1,5', '1.5']) {
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveValue(value);
    expect(
      screen.getByText('1,5 А', { selector: 'strong' })
    ).toBeInTheDocument();
  }
  for (const value of ['', '-1', '1001']) {
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  }
});
it('shows positive tiny masses without changing the millimetre diameter and preserves ordinary output', () => {
  mount(CableWeightPage);
  const length = screen.getByLabelText(/^Длина, м/);
  fireEvent.change(length, { target: { value: '0,01' } });
  expect(
    screen.getByRole('region', { name: 'Результаты расчёта' })
  ).toHaveTextContent('< 0,01 кг');
  expect(
    screen.getByRole('region', { name: 'Результаты расчёта' })
  ).toHaveTextContent('5,3–5,5 мм');
  fireEvent.click(
    screen.getByRole('button', { name: 'Добавить позицию в расчёт' })
  );
  expect(screen.getByRole('cell', { name: '< 0,01 кг' })).toBeInTheDocument();
  fireEvent.change(length, { target: { value: '100' } });
  expect(
    screen.getByRole('region', { name: 'Результаты расчёта' })
  ).toHaveTextContent('4,8–5,1 кг');
});
it('refuses only the overflowing new row and preserves existing positions and finite export', () => {
  mount(CableWeightPage);
  fireEvent.click(screen.getByRole('button', { name: '+ Добавить барабан' }));
  fireEvent.click(screen.getByLabelText('Материал барабана'));
  fireEvent.click(
    screen.getByRole('option', { name: 'Другая тара — указать массу' })
  );
  fireEvent.change(screen.getByLabelText('Масса одного барабана, кг'), {
    target: { value: '1e308' },
  });
  const add = screen.getByRole('button', { name: 'Добавить позицию в расчёт' });
  fireEvent.click(add);
  const before = JSON.parse(
    sessionStorage.getItem('yuzhural-cable-calculation-v1')
  );
  fireEvent.click(add);
  expect(
    screen.getByText(
      'Слишком большие значения для расчёта. Уменьшите массу или количество'
    )
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Удалить / })).toHaveLength(1);
  expect(
    JSON.parse(sessionStorage.getItem('yuzhural-cable-calculation-v1'))
  ).toEqual(before);
  expect(document.body.textContent).not.toContain('∞');
  expect(screen.getByRole('button', { name: 'Скачать текст' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Масса одного барабана, кг'), {
    target: { value: '12,5' },
  });
  fireEvent.click(add);
  expect(screen.getAllByRole('button', { name: /^Удалить / })).toHaveLength(2);
});
