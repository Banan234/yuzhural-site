// @vitest-environment jsdom

import '../../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeaderCatalogMenu from './HeaderCatalogMenu.jsx';
import { CATALOG_MENU } from './catalogMenuData.js';
import catalogCategoriesData from '../../../shared/catalogCategories.json';
import { fetchProducts } from '../../lib/productsApi.js';

vi.mock('../../lib/productsApi.js', () => ({
  fetchProducts: vi.fn().mockResolvedValue({ meta: { facets: {} } }),
}));

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

    expect(CATALOG_MENU).toHaveLength(14);
    expect(
      [...sidebar.querySelectorAll('a')].map((link) =>
        link.textContent.replace('›', '').trim()
      )
    ).toEqual([
      'Силовой кабель',
      'Провода',
      'Кабель управления и контроля',
      'Гибкий кабель',
      'СИП',
      'Кабели передачи данных',
      'Монтажный кабель',
      'Импортные кабели',
      'Кабели нагревательные',
      'Кабели судовые',
      'Кабели для подвижного состава',
      'Бортовые провода',
      'Специальные кабели',
      'Прочее',
    ]);
    expect(
      within(sidebar).getByRole('link', { name: 'Специальные кабели' })
    ).toHaveAttribute('href', '/catalog/specialnye-kabeli');
    await user.click(
      within(content()).getByRole('button', { name: /Показать все марки/ })
    );
    expect(
      within(content()).getByRole('link', { name: 'ВЭБШВ' })
    ).toBeInTheDocument();

    await user.hover(
      within(sidebar).getByRole('link', {
        name: 'Кабель управления и контроля',
      })
    );
    for (const slug of [
      'signalno-blokirovochnye',
      'kontrolnye-kabeli',
      'kabel-upravleniya',
    ]) {
      expect(
        content().querySelector(`a[href="/catalog/${slug}"]`)
      ).toBeInTheDocument();
    }
    expect(
      sidebar.querySelector('a[href="/catalog/signalno-blokirovochnye"]')
    ).toBeNull();
    expect(
      sidebar.querySelector('a[href="/catalog/kabeli-pozharnoy-signalizacii"]')
    ).toBeNull();

    await user.hover(within(sidebar).getByRole('link', { name: 'СИП' }));
    expect(
      within(content()).getAllByRole('link', { name: 'СИП' })
    ).toHaveLength(1);
    const sipMarks = content().querySelector('.catalog-dropdown__marks');
    expect(
      [...sipMarks.querySelectorAll('a')].map((link) => link.textContent)
    ).toEqual(['СИП-2', 'СИП-3', 'СИП-4']);
    for (const mark of ['СИП-2', 'СИП-3', 'СИП-4']) {
      expect(
        within(sipMarks).getByRole('link', { name: mark })
      ).toHaveAttribute('href', `/catalog/?search=${encodeURIComponent(mark)}`);
    }

    await user.hover(
      within(sidebar).getByRole('link', { name: 'Кабели передачи данных' })
    );
    for (const slug of [
      'universalnye-kabeli',
      'kabeli-svyazi',
      'lan-kabeli',
      'koaksialnye-kabeli',
      'optovolokonnye-kabeli',
    ]) {
      expect(
        content().querySelector(`a[href="/catalog/${slug}"]`)
      ).toBeInTheDocument();
      expect(sidebar.querySelector(`a[href="/catalog/${slug}"]`)).toBeNull();
    }

    await user.hover(
      within(sidebar).getByRole('link', { name: 'Импортные кабели' })
    );
    expect(
      within(content()).getByRole('link', { name: 'Другие импортные кабели' })
    ).toHaveAttribute('href', '/catalog/importnye-drugie-kabeli');

    await user.hover(
      within(sidebar).getByRole('link', { name: 'Кабели нагревательные' })
    );
    expect(
      within(content()).getByRole('link', {
        name: 'Греющие резистивные кабели',
      })
    ).toHaveAttribute('href', '/catalog/greyushchie-rezistivnye-kabeli');
    expect(
      within(content()).getByRole('link', { name: 'Саморегулирующиеся кабели' })
    ).toHaveAttribute('href', '/catalog/samoreguliruyushchiesya-kabeli');

    expect(
      within(sidebar).queryByRole('link', { name: 'Кабели шахтные' })
    ).not.toBeInTheDocument();
    await user.hover(
      within(sidebar).getByRole('link', { name: 'Специальные кабели' })
    );
    const specialCategories = catalogCategoriesData.sections.find(
      (section) => section.slug === 'specialnye-kabeli'
    ).categories;
    for (const category of specialCategories) {
      expect(
        within(content()).getByRole('link', { name: category.name })
      ).toHaveAttribute('href', `/catalog/${category.slug}`);
    }
    expect(specialCategories).toHaveLength(4);
    for (const name of [
      'Сигнально-блокировочные',
      'Кабели судовые',
      'Кабели для подвижного состава',
      'Бортовые провода',
    ]) {
      expect(
        within(content()).queryByRole('link', { name })
      ).not.toBeInTheDocument();
    }
    expect(
      within(content()).queryByRole('link', { name: 'Кабели нагревательные' })
    ).not.toBeInTheDocument();
    expect(
      within(content()).queryByRole('link', { name: 'LAN-кабели' })
    ).not.toBeInTheDocument();
  });

  it('показывает подтверждённые API фасеты как ссылки с фильтрами', async () => {
    fetchProducts.mockResolvedValueOnce({
      meta: {
        facets: {
          materials: ['медь', 'алюминий', 'не определено'],
          cores: ['1', '2', '3'],
          voltages: [1, 6],
        },
      },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HeaderCatalogMenu />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Каталог' }));
    const menu = document.getElementById('catalog-dropdown');
    expect(
      within(menu).getByRole('link', { name: 'Специальные кабели' })
    ).toBeInTheDocument();
    expect(
      await within(menu).findByRole('link', { name: 'Медные' })
    ).toHaveAttribute(
      'href',
      '/catalog/silovoy-kabel?material=%D0%BC%D0%B5%D0%B4%D1%8C'
    );
    expect(within(menu).getByRole('link', { name: '3 жилы' })).toHaveAttribute(
      'href',
      '/catalog/silovoy-kabel?cores=3'
    );
    expect(within(menu).getByRole('link', { name: '6 кВ' })).toHaveAttribute(
      'href',
      '/catalog/silovoy-kabel?voltage=6'
    );
  });
});
