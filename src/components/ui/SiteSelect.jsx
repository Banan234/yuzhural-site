import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { normalizeCatalogSearchText } from '../../../shared/catalogSearch.js';
import '../../styles/components/site-select.css';

function textOf(node) {
  return Children.toArray(node)
    .map((child) =>
      isValidElement(child) ? textOf(child.props.children) : String(child)
    )
    .join('');
}
function optionsOf(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup')
      return optionsOf(child.props.children);
    if (child.type !== 'option') return [];
    const label = textOf(child.props.children);
    return [
      {
        label,
        value: String(child.props.value ?? label),
        disabled: child.props.disabled,
      },
    ];
  });
}
function normalizeOptionSearch(value) {
  return normalizeCatalogSearchText(value)
    .replace(/(\d)\s*[xх×*]\s*/gi, '$1х')
    .replace(/(\d),$/g, '$1.');
}

export function SearchableSiteSelect(props) {
  return <SiteSelect {...props} searchable />;
}

export default function SiteSelect({
  children,
  value,
  defaultValue,
  onChange,
  className = '',
  disabled,
  name,
  searchable = false,
  ...props
}) {
  const options = optionsOf(children);
  const [localValue, setLocalValue] = useState(defaultValue);
  const selected = String(value ?? localValue ?? options[0]?.value ?? '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({});
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  const expanded = open && !disabled;
  const selectedLabel =
    options.find((option) => option.value === selected)?.label ||
    'Выберите значение';
  const terms = normalizeOptionSearch(query).split(' ').filter(Boolean);
  const visibleOptions = terms.length
    ? options.filter((option) => {
        const label = normalizeOptionSearch(option.label);
        return terms.every((term) => label.includes(term));
      })
    : options;
  const activeOption = visibleOptions[active];
  const activeId =
    expanded && activeOption && !activeOption.disabled
      ? `${id}-${active}`
      : undefined;

  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const choose = (option) => {
    if (!option || option.disabled) return;
    setLocalValue(option.value);
    onChange?.({
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    });
    close();
    trigger.current?.focus();
  };
  const placeList = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = searchable ? window.visualViewport : null;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom =
      viewportTop + (viewport?.height ?? window.innerHeight);
    const spaceBelow = viewportBottom - rect.bottom - 12;
    const spaceAbove = rect.top - viewportTop - 12;
    const above = searchable && spaceBelow < 180 && spaceAbove > spaceBelow;

    setPosition({
      ...(above
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - rect.width - 8)
      ),
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight: Math.max(
        searchable ? 44 : 100,
        Math.min(280, above ? spaceAbove : spaceBelow)
      ),
    });
  };
  const show = () => {
    placeList();
    setActive(
      options.findIndex(
        (option) => !option.disabled && option.value === selected
      )
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!expanded) return;
    const outside = (event) => {
      if (
        !trigger.current?.contains(event.target) &&
        !list.current?.contains(event.target)
      ) {
        close();
      }
    };
    const updatePosition = (event) => {
      if (event.target instanceof Node && list.current?.contains(event.target))
        return;
      if (searchable) placeList();
      else close();
    };
    const viewport = searchable ? window.visualViewport : null;
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    viewport?.addEventListener('resize', placeList);
    viewport?.addEventListener('scroll', placeList);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      viewport?.removeEventListener('resize', placeList);
      viewport?.removeEventListener('scroll', placeList);
    };
  }, [expanded, searchable]);

  useEffect(() => {
    if (!activeId || !list.current) return;
    const option = document.getElementById(activeId);
    if (!option) return;
    const box = list.current;
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      box.scrollTop + box.clientHeight
    ) {
      box.scrollTop = option.offsetTop + option.offsetHeight - box.clientHeight;
    }
  }, [activeId, position]);

  const onKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    if (key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (key === 'Tab') {
      close();
    } else if (
      key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      (!searchable && (key === 'Home' || key === 'End'))
    ) {
      event.preventDefault();
      if (!expanded) {
        show();
        if (searchable) event.currentTarget.select();
        return;
      }
      const enabled = visibleOptions.flatMap((option, index) =>
        option.disabled ? [] : [index]
      );
      if (!enabled.length) return;
      const current = enabled.indexOf(active);
      const first = enabled[0];
      const last = enabled.at(-1);
      if (key === 'Home') setActive(first);
      else if (key === 'End') setActive(last);
      else if (key === 'ArrowDown') setActive(enabled[current + 1] ?? first);
      else setActive(enabled[current - 1] ?? last);
    } else if (expanded && (key === 'Enter' || (!searchable && key === ' '))) {
      event.preventDefault();
      choose(
        activeId
          ? activeOption
          : visibleOptions.find((option) => !option.disabled)
      );
    } else if (
      !searchable &&
      key.length === 1 &&
      key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const found = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label.toLowerCase().startsWith(key.toLowerCase())
      );
      if (found >= 0) {
        if (!expanded) show();
        setActive(found);
      }
    }
  };
  const controlProps = {
    ...props,
    ref: trigger,
    disabled,
    className: `site-select ${className}`,
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': expanded,
    'aria-controls': expanded ? id : undefined,
    'aria-activedescendant': activeId,
    onKeyDown,
  };
  const arrow = (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="m4 6 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
  return (
    <>
      {name && (
        <input type="hidden" name={name} value={selected} disabled={disabled} />
      )}
      {searchable ? (
        <span className="site-select__field">
          <input
            {...controlProps}
            type="text"
            value={
              expanded && query !== null ? query : selected ? selectedLabel : ''
            }
            placeholder={
              expanded && query !== null ? 'Введите для поиска' : selectedLabel
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-autocomplete="list"
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => {
              if (expanded) return;
              show();
              event.currentTarget.select();
            }}
            onChange={(event) => {
              if (!expanded) show();
              setQuery(event.target.value);
              setActive(-1);
              if (list.current) list.current.scrollTop = 0;
            }}
          />
          {arrow}
        </span>
      ) : (
        <button
          {...controlProps}
          type="button"
          value={selected}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            expanded ? close() : show();
          }}
        >
          <span>{selectedLabel}</span>
          {arrow}
        </button>
      )}
      {expanded &&
        createPortal(
          <div ref={list} className="site-select__list" style={position}>
            <div
              id={id}
              role="listbox"
              aria-label={props['aria-label'] || 'Варианты'}
            >
              {visibleOptions.map((option, index) => (
                <div
                  key={`${option.value}-${index}`}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={selected === option.value}
                  aria-disabled={!!option.disabled}
                  className={
                    index === active
                      ? 'site-select__option site-select__option--active'
                      : 'site-select__option'
                  }
                  onPointerMove={(event) => {
                    if (event.pointerType === 'mouse' && !option.disabled) {
                      setActive(index);
                    }
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(option);
                  }}
                >
                  <span>{option.label}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    {selected === option.value && (
                      <path
                        d="m3 8 3 3 7-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    )}
                  </svg>
                </div>
              ))}
            </div>
            {searchable && (
              <div
                role="status"
                className={
                  visibleOptions.length
                    ? 'visually-hidden'
                    : 'site-select__empty'
                }
              >
                {!visibleOptions.length && 'Ничего не найдено'}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
