// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { it, expect, vi } from 'vitest';
import CatalogNavigationScroll from './CatalogNavigationScroll';

it('opens each homepage category at the top', () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const paths = ['silovoy-kabel', 'kontrolnyy-kabel', 'montazhnyy-kabel', 'provoda', 'kabeli-peredachi-dannykh', 'importnye-kabeli'];
  render(<MemoryRouter><CatalogNavigationScroll /><Link to="/">Главная</Link>{paths.map(path => <Link key={path} to={`/catalog/${path}`}>{path}</Link>)}</MemoryRouter>);
  expect(scroll).not.toHaveBeenCalled();
  for (const path of paths) {
    fireEvent.click(screen.getByRole('link', { name: path }));
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
    fireEvent.click(screen.getByRole('link', { name: 'Главная' }));
  }
  expect(scroll).toHaveBeenCalledTimes(6);
  scroll.mockRestore();
});
