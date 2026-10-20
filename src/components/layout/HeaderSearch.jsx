// Файл реализует поисковую строку шапки, подсказки товаров и переходы к результатам каталога.

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trackEvent } from '../../lib/analytics';
import { captureException } from '../../lib/errorTracking';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';
import { fetchProductSuggestions } from '../../lib/productsApi';

const SEARCH_SUGGESTIONS_LIMIT = 7;
const SEARCH_SUGGESTIONS_DEBOUNCE_MS = 300;
const HEADER_SEARCH_INPUT_ID = 'header-search';
const HEADER_SEARCH_LISTBOX_ID = 'header-search-suggestions';
const HEADER_SEARCH_STATUS_ID = 'site-header-search-status';
// Реальные позиции из текущего каталога; порядок задаёт цикл подсказок.
const SEARCH_PLACEHOLDERS = [
  'ВВГнг(А)-LS 3х1.5',
  'ВВГнг(А)-FRLS 3х2.5',
  'ВВГнг(А)-LS 5х2.5',
  'КГ 4х16',
  'СИП-4 4х16',
  'ПВС 3х1.5',
  'АВБбШв 4х120',
  'АВВГ 4х16',
  'ШВВП 2х0.75',
  'ПУГВ 1х6 белый',
  'КВВГ 4х1.5',
  'ВБШВнг(А)-LS 4х10',
  'NYM 2х1.5',
];

function getHeaderSearchSuggestionId(index) {
  return `${HEADER_SEARCH_LISTBOX_ID}-option-${index}`;
}

function normalizeSearchSuggestionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/g, '');
}

function formatPositionCount(count) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} позиций`;
  }

  if (last === 1) {
    return `${count} позиция`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} позиции`;
  }

  return `${count} позиций`;
}

export default function HeaderSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [headerSearch, setHeaderSearch] = useState('');
  const [searchPlaceholder, setSearchPlaceholder] = useState(
    SEARCH_PLACEHOLDERS[0]
  );
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearchCatalogLoading, setIsSearchCatalogLoading] = useState(false);
  const [isSearchSuggestionsOpen, setIsSearchSuggestionsOpen] = useState(false);
  const [activeSearchSuggestionIndex, setActiveSearchSuggestionIndex] =
    useState(-1);
  const searchLoadControllerRef = useRef(null);
  const searchSuggestionsDebounceTimerRef = useRef(null);
  const normalizedHeaderSearch = normalizeSearchSuggestionKey(headerSearch);
  const shouldShowSearchSuggestions = Boolean(
    isSearchSuggestionsOpen &&
    normalizedHeaderSearch &&
    (isSearchCatalogLoading || searchSuggestions.length > 0)
  );
  const shouldShowSearchLoadingStatus =
    shouldShowSearchSuggestions &&
    isSearchCatalogLoading &&
    searchSuggestions.length === 0;
  const activeSearchSuggestion =
    activeSearchSuggestionIndex >= 0
      ? searchSuggestions[activeSearchSuggestionIndex]
      : null;
  const activeSearchSuggestionId = activeSearchSuggestion
    ? getHeaderSearchSuggestionId(activeSearchSuggestionIndex)
    : undefined;

  useEffect(() => {
    if (
      headerSearch ||
      isSearchFocused ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setSearchPlaceholder(SEARCH_PLACEHOLDERS[0]);
      return;
    }

    let index = 0;
    let length = 0;
    let phase = 'typing';
    let timer;

    function tick() {
      const current = SEARCH_PLACEHOLDERS[index];

      if (phase === 'typing') {
        length += 1;
        setSearchPlaceholder(current.slice(0, length));
        if (length === current.length) phase = 'pause';
        timer = window.setTimeout(tick, phase === 'pause' ? 1800 : 90);
      } else if (phase === 'pause') {
        phase = 'deleting';
        timer = window.setTimeout(tick, 50);
      } else {
        length -= 1;
        setSearchPlaceholder(current.slice(0, length));
        if (length === 0) {
          index = (index + 1) % SEARCH_PLACEHOLDERS.length;
          phase = 'typing';
        }
        timer = window.setTimeout(tick, length === 0 ? 350 : 45);
      }
    }

    setSearchPlaceholder('');
    timer = window.setTimeout(tick, 250);
    return () => window.clearTimeout(timer);
  }, [headerSearch, isSearchFocused]);

  useEffect(() => {
    return () => {
      clearSearchSuggestionsDebounce();
      searchLoadControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setActiveSearchSuggestionIndex((index) =>
      index >= searchSuggestions.length ? -1 : index
    );
  }, [searchSuggestions.length]);

  useEffect(() => {
    const currentSearch =
      new URLSearchParams(location.search).get('search') || '';

    if (
      location.pathname === '/catalog' ||
      location.pathname === CATALOG_CANONICAL_PATH
    ) {
      setHeaderSearch(currentSearch);
    } else {
      setHeaderSearch('');
    }
  }, [location.pathname, location.search]);

  function handleSearchSubmit(event) {
    event.preventDefault();

    const value = headerSearch.trim();
    setIsSearchSuggestionsOpen(false);
    setActiveSearchSuggestionIndex(-1);
    // A header search starts across the whole catalog. Old category, mark,
    // price and pagination constraints must not hide the new results.
    const params = new URLSearchParams();
    const currentParams = new URLSearchParams(location.search);
    for (const key of ['limit', 'sort']) {
      if (currentParams.has(key)) params.set(key, currentParams.get(key));
    }

    if (value) {
      trackEvent('search-submit', { query: value, source: 'header' });
    }

    if (!value) {
      params.delete('search');

      const nextUrl = params.toString()
        ? `${CATALOG_CANONICAL_PATH}?${params.toString()}`
        : CATALOG_CANONICAL_PATH;

      navigate(nextUrl);
      return;
    }

    params.set('search', value);
    navigate(`${CATALOG_CANONICAL_PATH}?${params.toString()}`);
  }

  function loadSearchSuggestions(value) {
    clearSearchSuggestionsDebounce();
    const search = value.trim();

    if (!search) {
      searchLoadControllerRef.current?.abort();
      searchLoadControllerRef.current = null;
      setSearchSuggestions([]);
      setIsSearchCatalogLoading(false);
      setActiveSearchSuggestionIndex(-1);
      return;
    }

    searchLoadControllerRef.current?.abort();
    const controller = new AbortController();
    searchLoadControllerRef.current = controller;
    setIsSearchCatalogLoading(true);

    fetchProductSuggestions(search, SEARCH_SUGGESTIONS_LIMIT, controller.signal)
      .then((items) => {
        if (
          controller.signal.aborted ||
          searchLoadControllerRef.current !== controller
        )
          return;
        setSearchSuggestions(Array.isArray(items) ? items : []);
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          searchLoadControllerRef.current !== controller
        )
          return;
        if (error.name !== 'AbortError') {
          captureException(error, { source: 'HeaderSearch.suggestions' });
          setSearchSuggestions([]);
        }
      })
      .finally(() => {
        if (searchLoadControllerRef.current === controller) {
          searchLoadControllerRef.current = null;
          setIsSearchCatalogLoading(false);
        }
      });
  }

  function clearSearchSuggestionsDebounce() {
    if (!searchSuggestionsDebounceTimerRef.current) {
      return;
    }

    window.clearTimeout(searchSuggestionsDebounceTimerRef.current);
    searchSuggestionsDebounceTimerRef.current = null;
  }

  function scheduleSearchSuggestionsLoad(value) {
    const search = value.trim();

    clearSearchSuggestionsDebounce();
    searchLoadControllerRef.current?.abort();
    searchLoadControllerRef.current = null;
    setSearchSuggestions([]);

    if (!search) {
      setSearchSuggestions([]);
      setIsSearchCatalogLoading(false);
      setActiveSearchSuggestionIndex(-1);
      return;
    }

    setIsSearchCatalogLoading(true);
    searchSuggestionsDebounceTimerRef.current = window.setTimeout(() => {
      searchSuggestionsDebounceTimerRef.current = null;
      loadSearchSuggestions(search);
    }, SEARCH_SUGGESTIONS_DEBOUNCE_MS);
  }

  function handleSearchInputChange(event) {
    const value = event.target.value;
    setHeaderSearch(value);
    setIsSearchSuggestionsOpen(true);
    setActiveSearchSuggestionIndex(-1);
    scheduleSearchSuggestionsLoad(value);
  }

  function handleSearchSuggestionSelect(suggestion) {
    const query = suggestion.query || suggestion.mark;
    setHeaderSearch(query);
    setIsSearchSuggestionsOpen(false);
    setActiveSearchSuggestionIndex(-1);
    trackEvent('search-submit', { query, source: 'header-suggestion' });
    const params = new URLSearchParams({ search: query });
    if (suggestion.filterMark) params.set('mark', suggestion.filterMark);
    navigate(`${CATALOG_CANONICAL_PATH}?${params}`);
  }

  function handleSearchInputKeyDown(event) {
    if (event.key === 'Escape') {
      setIsSearchSuggestionsOpen(false);
      setActiveSearchSuggestionIndex(-1);
      return;
    }

    if (
      event.key === 'Enter' &&
      shouldShowSearchSuggestions &&
      activeSearchSuggestion
    ) {
      event.preventDefault();
      handleSearchSuggestionSelect(activeSearchSuggestion);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    if (searchSuggestions.length === 0) {
      return;
    }

    event.preventDefault();
    setIsSearchSuggestionsOpen(true);
    setActiveSearchSuggestionIndex((index) => {
      if (event.key === 'ArrowDown') {
        return index < searchSuggestions.length - 1 ? index + 1 : 0;
      }

      return index > 0 ? index - 1 : searchSuggestions.length - 1;
    });
  }

  return (
    <form className="site-header__search-inline" onSubmit={handleSearchSubmit}>
      <div className="site-header__search-field">
        <input
          id={HEADER_SEARCH_INPUT_ID}
          type="search"
          className="site-header__search-input"
          placeholder={searchPlaceholder}
          value={headerSearch}
          onChange={handleSearchInputChange}
          onFocus={() => {
            setIsSearchFocused(true);
            setIsSearchSuggestionsOpen(true);
            if (headerSearch.trim()) {
              loadSearchSuggestions(headerSearch);
            }
          }}
          onBlur={() => {
            setIsSearchFocused(false);
            window.setTimeout(() => {
              setIsSearchSuggestionsOpen(false);
              setActiveSearchSuggestionIndex(-1);
            }, 120);
          }}
          onKeyDown={handleSearchInputKeyDown}
          role="combobox"
          aria-label="Поиск по каталогу"
          aria-autocomplete="list"
          aria-controls={HEADER_SEARCH_LISTBOX_ID}
          aria-haspopup="listbox"
          aria-expanded={Boolean(shouldShowSearchSuggestions)}
          aria-activedescendant={activeSearchSuggestionId}
          aria-describedby={
            shouldShowSearchLoadingStatus ? HEADER_SEARCH_STATUS_ID : undefined
          }
        />

        <button
          type="submit"
          className="site-header__search-button"
          aria-label="Найти"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </button>

        <div
          id={HEADER_SEARCH_LISTBOX_ID}
          className="site-header__search-suggestions"
          role="listbox"
          aria-label="Подсказки поиска по каталогу"
          hidden={!shouldShowSearchSuggestions}
        >
          {shouldShowSearchLoadingStatus ? (
            <div
              id={HEADER_SEARCH_STATUS_ID}
              className="site-header__search-suggestion-status"
              role="status"
              aria-live="polite"
            >
              Ищем товары...
            </div>
          ) : (
            searchSuggestions.map((suggestion, index) => {
              const isActive = activeSearchSuggestionIndex === index;

              return (
                <button
                  id={getHeaderSearchSuggestionId(index)}
                  key={suggestion.key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  className={`site-header__search-suggestion${
                    isActive ? ' site-header__search-suggestion--active' : ''
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSearchSuggestionIndex(index)}
                  onClick={() => handleSearchSuggestionSelect(suggestion)}
                >
                  <span className="site-header__search-suggestion-mark">
                    {suggestion.type === 'correction'
                      ? `Возможно: ${suggestion.mark}`
                      : suggestion.mark}
                  </span>
                  <span className="site-header__search-suggestion-count">
                    {formatPositionCount(suggestion.count)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </form>
  );
}
