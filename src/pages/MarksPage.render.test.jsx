// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PrerenderDataProvider } from '../lib/prerenderData';
import { buildMarkIndex } from '../../shared/markIndex';
import MarksPage from './MarksPage';

describe('MarksPage', () => {
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
    expect(screen.getByText('1 марка')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'В' }).parentElement
    ).toHaveAttribute('id', 'letter-412');
    expect(screen.getByRole('link', { name: 'ВВГ' })).toHaveAttribute(
      'href',
      '/catalog/?search=%D0%92%D0%92%D0%93&mark=%D0%92%D0%92%D0%93'
    );
    expect(screen.getByRole('link', { name: 'ВВГ' })).toHaveAttribute(
      'title',
      'В каталоге: 2 позиции'
    );
  });
});
