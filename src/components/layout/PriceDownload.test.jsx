import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PriceDownload from './PriceDownload';

describe('PriceDownload', () => {
  it('opens on hover, closes on leave and provides both downloads', () => {
    render(<PriceDownload />);
    const button = screen.getByRole('button', { name: 'Скачать прайс-лист' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const hover = new Event('pointerover', { bubbles: true });
    Object.defineProperty(hover, 'pointerType', { value: 'mouse' });
    fireEvent(button.parentElement, hover);
    expect(
      screen.getByRole('link', { name: /Прайс для покупателей/ })
    ).toHaveAttribute('href', '/price-buyer.xlsx');
    expect(
      screen.getByRole('link', { name: /Исходный прайс/ })
    ).toHaveAttribute('href', '/price.xls');
    fireEvent.pointerLeave(button.parentElement);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
  it('toggles on click and closes with Escape or an outside press', () => {
    render(<PriceDownload />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
