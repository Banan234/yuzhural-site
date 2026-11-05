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
export default function SiteSelect({
  children,
  value,
  defaultValue,
  onChange,
  className = '',
  disabled,
  name,
  ...props
}) {
  const options = optionsOf(children);
  const [localValue, setLocalValue] = useState(defaultValue);
  const selected = String(value ?? localValue ?? options[0]?.value ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({});
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  const choose = (option) => {
    if (!option || option.disabled) return;
    setLocalValue(option.value);
    onChange?.({
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    });
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    const rect = trigger.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - rect.width - 8)
      ),
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight: Math.max(
        100,
        Math.min(280, window.innerHeight - rect.bottom - 12)
      ),
    });
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === selected)
      )
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !trigger.current?.contains(event.target) &&
        !list.current?.contains(event.target)
      )
        setOpen(false);
    };
    const close = (event) => {
      if (!list.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !list.current) return;
    const option = document.getElementById(`${id}-${active}`);
    if (!option) return;
    const box = list.current;
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      box.scrollTop + box.clientHeight
    ) {
      box.scrollTop = option.offsetTop + option.offsetHeight - box.clientHeight;
    }
  }, [active, open, id]);
  return (
    <>
      {name && (
        <input type="hidden" name={name} value={selected} disabled={disabled} />
      )}
      <button
        {...props}
        ref={trigger}
        type="button"
        value={selected}
        disabled={disabled}
        className={`site-select ${className}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          open ? setOpen(false) : show();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            setOpen(false);
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              show();
              return;
            }
            const enabled = options
              .map((o, i) => (!o.disabled ? i : -1))
              .filter((i) => i >= 0);
            const current = enabled.indexOf(active);
            setActive(
              event.key === 'Home'
                ? enabled[0]
                : event.key === 'End'
                  ? enabled.at(-1)
                  : enabled[
                      (current +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        enabled.length) %
                        enabled.length
                    ]
            );
          } else if (open && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key.length === 1 && event.key !== ' ') {
            const found = options.findIndex(
              (o) =>
                !o.disabled &&
                o.label
                  .toLocaleLowerCase()
                  .startsWith(event.key.toLocaleLowerCase())
            );
            if (found >= 0) {
              if (!open) show();
              setActive(found);
            }
          }
        }}
      >
        <span>
          {options.find((option) => option.value === selected)?.label ||
            'Выберите значение'}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            className="site-select__list"
            style={position}
            aria-label={props['aria-label'] || 'Варианты'}
          >
            {options.map((option, index) => (
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
                onPointerMove={() => !option.disabled && setActive(index)}
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
          </div>,
          document.body
        )}
    </>
  );
}
