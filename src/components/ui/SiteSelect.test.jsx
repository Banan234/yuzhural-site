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
