// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SiteSelect from './SiteSelect';
it('opens an inline list, selects by keyboard and dismisses outside', () => {
  const change = vi.fn();
  render(
    <label>
      Материал
      <SiteSelect value="cu" onChange={change}>
        <option value="cu">Медь</option>
        <option disabled value="x">
          Недоступно
        </option>
        <option value="al">Алюминий</option>
      </SiteSelect>
    </label>
  );
  const control = screen.getByRole('combobox');
  fireEvent.click(control);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(change.mock.calls[0][0].target.value).toBe('al');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.click(control);
  fireEvent.pointerDown(document.body);
  expect(control).toHaveAttribute('aria-expanded', 'false');
});

it('filters service options while typing and only commits a listed value', () => {
  const change = vi.fn();
  render(
    <label>
      Конструкция кабеля
      <SiteSelect searchable defaultValue="1x1.5" onChange={change}>
        <option value="1x1.5">1х1,5</option>
        <option value="3x2.5">3х2,5</option>
        <option value="3x4">3х4</option>
      </SiteSelect>
    </label>
  );
  const control = screen.getByRole('combobox', { name: 'Конструкция кабеля' });
  fireEvent.click(control);
  expect(screen.getAllByRole('option')).toHaveLength(3);

  fireEvent.change(control, { target: { value: '3x' } });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.change(control, { target: { value: '3×2.' } });
  expect(screen.getByRole('option')).toHaveTextContent('3х2,5');
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  expect(control).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option').id
  );
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(change.mock.calls[0][0].target.value).toBe('3x2.5');
  expect(control).toHaveValue('3х2,5');

  fireEvent.change(control, { target: { value: 'нет такого' } });
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
  fireEvent.keyDown(control, { key: 'Enter' });
  expect(change).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(control).toHaveValue('3х2,5');
  expect(control).toHaveAttribute('aria-expanded', 'false');
});
