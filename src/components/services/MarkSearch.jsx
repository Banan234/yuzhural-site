import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeKnowledgeMark } from '../../../shared/cableKnowledge';

// Размер отделяем от марки, чтобы выбор подсказки не удалял введённые жилы и сечение.
export function splitMarkQuery(value) {
  const text = value.trim();
  const size = text.match(/\s+\d+\s*[xх×*]/i);
  return size
    ? { mark: text.slice(0, size.index), suffix: text.slice(size.index) }
    : { mark: text, suffix: '' };
}

export default function MarkSearch({
  value,
  onChange,
  marks,
  label,
  fullDesignation = false,
}) {
  const id = useId();
  const host = useRef(null);
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { mark: query, suffix } = splitMarkQuery(value);
  const matches = useMemo(() => {
    const key = normalizeKnowledgeMark(query);
    if (!key) return [];
    const rank = (mark) => {
      const candidate = normalizeKnowledgeMark(mark);
      return candidate === key ? 0 : candidate.startsWith(key) ? 1 : 2;
    };
    return marks
      .filter((mark) => normalizeKnowledgeMark(mark).includes(key))
      .sort(
        (a, b) =>
          rank(a) - rank(b) || a.localeCompare(b, 'ru', { numeric: true })
      );
  }, [marks, query]);
  const suggestions = matches.slice(0, 10);
  const expanded = open && Boolean(query);
  const activeId =
    expanded && suggestions[active] ? `${id}-option-${active}` : undefined;

  useEffect(() => {
    setActive(-1);
    setOpen(false);
  }, [label]);

  useEffect(() => {
    const option = activeId && document.getElementById(activeId);
    if (!option) return;
    const list = option.parentElement;
    const row = option.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (row.top < bounds.top) list.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom)
      list.scrollTop += row.bottom - bounds.bottom;
  }, [activeId]);

  function select(mark) {
    onChange(mark + suffix);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  }

  function handleKey(event) {
    if (event.nativeEvent.isComposing || event.isComposing) return;
    if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!query || !suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => {
        if (!expanded || index < 0)
          return event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
        return (
          (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
          suggestions.length
        );
      });
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault();
      select(suggestions[active]);
    }
  }

  return (
    <div
      className="mark-search"
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label className="mark-search__label" htmlFor={id}>
        {label}
      </label>
      <div className="mark-search__anchor">
        <div className="mark-search__control">
          <svg
            className="mark-search__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            ref={input}
            id={id}
            type="text"
            role="combobox"
            value={value}
            maxLength={250}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={
              fullDesignation
                ? 'Например, ВВГнг(А)-LS 3×2,5'
                : 'Введите марку кабеля'
            }
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? `${id}-list` : undefined}
            aria-activedescendant={activeId}
            aria-describedby={`${id}-hint`}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={handleKey}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
          />
          {value && (
            <button
              type="button"
              className="mark-search__clear"
              aria-label="Очистить обозначение кабеля"
              onClick={() => {
                onChange('');
                setOpen(false);
                setActive(-1);
                input.current?.focus();
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          )}
        </div>
        {expanded && (
          <div className="mark-search__dropdown">
            <div className="mark-search__summary" role="status">
              {matches.length
                ? `Марки из справочника · ${matches.length > 10 ? 'первые 10 из ' : ''}${matches.length}`
                : 'Совпадений в справочнике нет'}
            </div>
            <ul
              id={`${id}-list`}
              className="mark-search__options"
              role="listbox"
              tabIndex={-1}
              aria-label="Подходящие марки кабеля"
            >
              {suggestions.map((mark, index) => (
                <li
                  id={`${id}-option-${index}`}
                  key={mark}
                  role="option"
                  tabIndex={-1}
                  aria-selected={active === index}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse') event.preventDefault();
                  }}
                  onClick={() => select(mark)}
                >
                  <strong>{mark}</strong>
                  {suffix && <span>{suffix.trim()}</span>}
                </li>
              ))}
            </ul>
            {!matches.length && (
              <p className="mark-search__empty">
                Проверьте написание или продолжите ввод полного обозначения.
                Неизвестную марку можно уточнить у менеджера.
              </p>
            )}
            {matches.length > 0 && (
              <div className="mark-search__keyboard" aria-hidden="true">
                ↑ ↓ — выбор · Enter — подставить · Esc — закрыть
              </div>
            )}
          </div>
        )}
      </div>
      <p id={`${id}-hint`} className="mark-search__hint">
        {fullDesignation
          ? 'Введите марку, число жил и сечение.'
          : 'Поиск по справочнику марок.'}
      </p>
    </div>
  );
}
