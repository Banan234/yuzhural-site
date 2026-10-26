// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import OfferPage from './OfferPage';
it('показывает розничные условия и отдельные документы по данным', () => {
  render(<MemoryRouter><OfferPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'Публичная оферта' })).toBeInTheDocument();
  expect(screen.getByText(/Принятие оферты не считается общим согласием/)).toBeInTheDocument();
  expect(screen.getByText(/Сам факт резки кабеля не объявляется/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Отдельное согласие' })).toHaveAttribute('href', '/personal-data-consent');
});
