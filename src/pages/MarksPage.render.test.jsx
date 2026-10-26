// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrerenderDataProvider } from '../lib/prerenderData';
import { buildMarkIndex } from '../../shared/markIndex';
import MarksPage from './MarksPage';

describe('MarksPage', () => {
  beforeEach(() => window.history.replaceState(null, ''));

  it('keeps SPA navigation and restores the list without refetching on Back', async () => {
    const groups = buildMarkIndex([{ mark: 'ВВГ' }, { mark: 'ВВГ' }]);
    const fetchMarks = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, groups }),
    }));
    vi.stubGlobal('fetch', fetchMarks);
    function Catalog() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Назад</button>;
    }
    render(
      <MemoryRouter initialEntries={['/marks/']}>
        <PrerenderDataProvider data={{}}>
          <Routes>
            <Route path="/marks/" element={<MarksPage />} />
            <Route path="/catalog/" element={<Catalog />} />
          </Routes>
        </PrerenderDataProvider>
      </MemoryRouter>
    );
    await screen.findByRole('link', { name: 'ВВГ' });
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1800);
    window.history.replaceState(
      { key: 'entry', idx: 2, usr: { test: true } },
      ''
    );
    fireEvent.click(screen.getByRole('link', { name: 'ВВГ' }));
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(window.history.state).toEqual({
      key: 'entry',
      idx: 2,
      usr: { test: true },
      marksReturn: { groups, top: 1800 },
    });
    const requestsBeforeBack = fetchMarks.mock.calls.length;
    scrollY.mockReturnValue(0);
    window.scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('link', { name: 'ВВГ' })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 1800,
      left: 0,
      behavior: 'instant',
    });
    await act(async () => {});
    expect(fetchMarks).toHaveBeenCalledTimes(requestsBeforeBack);
  });

  it('renders mark groups and links each mark to its exact catalog results', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    render(
      <MemoryRouter initialEntries={['/marks/']}>
        <PrerenderDataProvider
          data={{ marks: buildMarkIndex([{ mark: 'ВВГ' }, { mark: 'ВВГ' }]) }}
        >
          <MarksPage />
        </PrerenderDataProvider>
      </MemoryRouter>
    );

    expect(
      screen.queryByRole('navigation', { name: 'Выбор буквы' })
    ).toBeNull();
    expect(screen.getAllByRole('link', { name: 'ВВГ' })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'В' }).parentElement
    ).toHaveAttribute('id', 'letter-412');
    expect(screen.getByRole('link', { name: 'ВВГ' })).toHaveAttribute(
      'href',
      '/catalog/?search=%D0%92%D0%92%D0%93&mark=%D0%92%D0%92%D0%93'
    );
    expect(screen.getByRole('link', { name: 'ВВГ' })).toHaveAttribute(
      'title',
      expect.stringMatching(/\b2\b/)
    );
  });
});
