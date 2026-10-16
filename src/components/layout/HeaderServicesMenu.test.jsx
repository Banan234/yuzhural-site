// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CABLE_SERVICES, SERVICES_PATH } from '../../lib/cableServices';
import HeaderServicesMenu from './HeaderServicesMenu.jsx';

describe('HeaderServicesMenu', () => {
  it('раскрывает список при наведении и закрывает при уходе указателя', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <HeaderServicesMenu />
      </MemoryRouter>
    );
    const trigger = screen.getByRole('link', { name: 'Сервисы' });

    expect(trigger).toHaveAttribute('href', SERVICES_PATH);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Все сервисы' })).toHaveAttribute(
      'href',
      SERVICES_PATH
    );
    for (const service of CABLE_SERVICES) {
      expect(screen.getByRole('link', { name: service.title })).toHaveAttribute(
        'href',
        service.path
      );
    }

    await user.unhover(container.querySelector('.header-services'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Все сервисы' })).toBeNull();
  });

  it('открывается с клавиатуры и закрывается по Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HeaderServicesMenu />
      </MemoryRouter>
    );

    await user.tab();
    const trigger = screen.getByRole('link', { name: 'Сервисы' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
