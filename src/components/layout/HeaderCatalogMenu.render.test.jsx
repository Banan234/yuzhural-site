// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import HeaderCatalogMenu from './HeaderCatalogMenu.jsx';
import { CATALOG_MENU } from './catalogMenuData.js';
import catalogCategoriesData from '../../../shared/catalogCategories.json';

describe('HeaderCatalogMenu', () => {
  it('показывает все разделы, категории, импортные подкатегории и марки', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HeaderCatalogMenu />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Каталог' }));
    const menu = document.getElementById('catalog-dropdown');
    const sidebar = menu.querySelector('.catalog-dropdown__sidebar');
    const content = () => menu.querySelector('.catalog-dropdown__content');

    expect(CATALOG_MENU).toHaveLength(
      catalogCategoriesData.sections.reduce(
        (total, section) => total + section.categories.length,
        0
      )
    );
    expect(
      within(sidebar).getByRole('link', { name: 'Специальные кабели' })
    ).toHaveAttribute('href', '/catalog/specialnye-kabeli');
    expect(
      within(content()).getByRole('link', { name: 'ВЭБШВ' })
    ).toBeInTheDocument();

    await user.hover(within(sidebar).getByRole('link', { name: 'СИП' }));
    expect(
      within(content()).getAllByRole('link', { name: 'СИП' })
    ).toHaveLength(1);

    await user.hover(
      within(sidebar).getByRole('link', { name: 'Импортные кабели' })
    );
    expect(
      within(content()).getByRole('link', { name: 'Другие импортные кабели' })
    ).toHaveAttribute('href', '/catalog/importnye-drugie-kabeli');

    await user.hover(
      within(sidebar).getByRole('link', { name: 'Специальные кабели' })
    );
    expect(
      within(sidebar).getByRole('link', { name: 'Кабели шахтные' })
    ).toHaveAttribute('href', '/catalog/kabeli-shakhtnye');
    expect(
      within(content()).getByRole('link', { name: 'КШСГ' })
    ).toBeInTheDocument();
  });
});
