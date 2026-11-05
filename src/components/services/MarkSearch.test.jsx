// @vitest-environment jsdom
import '../../test/renderTestSetup';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkSearch from './MarkSearch';
const marks = ['ГЕРДА-КВ', 'РПШк', 'РПШЭк', 'ВВГнг(А)-LS', 'ВВГ'];
function Field({ initial = '' }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkSearch
      value={value}
      onChange={setValue}
      marks={marks}
      label="Обозначение"
      fullDesignation
    />
  );
}
describe('mark input interactions', () => {
  it('returns identical Cyrillic matches regardless of case and ranks prefixes first', () => {
    render(<Field />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'р' } });
    const lower = screen.getAllByRole('option').map((e) => e.textContent);
    expect(lower[0]).toBe('РПШк');
    fireEvent.change(input, { target: { value: 'Р' } });
    expect(screen.getAllByRole('option').map((e) => e.textContent)).toEqual(
      lower
    );
  });
  it('keeps dimensions when selecting a mark using keyboard', () => {
    render(<Field initial="ввг 3х2,5" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('ВВГ 3х2,5');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
  it('closes on Escape without replacing the entered designation', () => {
    render(<Field initial="р" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('р');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('clears and restores focus without marking empty input as invalid', () => {
    render(<Field initial="РПШк" />);
    fireEvent.click(screen.getByRole('button', { name: /Очистить/ }));
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('explains no matches and preserves arbitrary full designations', () => {
    render(<Field />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'НЕИЗВЕСТНО 3х2,5' },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Совпадений в справочнике нет'
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.getByRole('combobox')).toHaveValue('НЕИЗВЕСТНО 3х2,5');
  });
  it('does not select a suggestion when Enter finishes an IME composition', () => {
    render(<Field initial="р" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(input).toHaveValue('р');
  });
});
