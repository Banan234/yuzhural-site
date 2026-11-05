// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ConsentGatedMap from './ConsentGatedMap';

vi.mock('../../lib/cookieConsent', () => ({
  COOKIE_CONSENT_CHANGE_EVENT: 'consent-change',
  COOKIE_CONSENT_COOKIE: 'consent',
  hasExternalServicesConsent: () => true,
  openCookieSettings: vi.fn(),
}));

it('protects scrolling until activation and restores protection on exit or location change', () => {
  const { rerender } = render(<ConsentGatedMap title="Склад" src="about:blank" />);
  const frame = screen.getByTitle('Склад');
  const guard = frame.parentElement;
  expect(frame).toHaveAttribute('tabindex', '-1');
  expect(guard).toHaveAttribute('data-interactive', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Взаимодействовать с картой' }));
  expect(guard).toHaveAttribute('data-interactive', 'true');
  fireEvent.pointerLeave(guard);
  expect(guard).toHaveAttribute('data-interactive', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Взаимодействовать с картой' }));
  fireEvent.blur(guard, { relatedTarget: document.body });
  expect(guard).toHaveAttribute('data-interactive', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Взаимодействовать с картой' }));
  rerender(<ConsentGatedMap title="Офис" src="about:blank#office" />);
  expect(guard).toHaveAttribute('data-interactive', 'false');
});
