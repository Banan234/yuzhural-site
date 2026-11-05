import { useEffect, useId, useRef, useState } from 'react';

const options = [
  ['popular', 'По популярности'],
  ['price-asc', 'Сначала дешевле'],
  ['price-desc', 'Сначала дороже'],
  ['title-asc', 'По названию А–Я'],
];

export default function CatalogSort({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef(null);
  const container = useRef(null);
  useEffect(() => {
    if (!open) return;
    function closeOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  return (
    <div
      ref={container}
      className="catalog-sort"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span>Сортировка:</span>
      <button
        ref={trigger}
        type="button"
        className="catalog-sort__trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {options.find(([key]) => key === value)?.[1] || options[0][1]}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          className="catalog-sort__dropdown"
          role="group"
          aria-label="Сортировка товаров"
        >
          {options.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === value}
              onClick={() => {
                onChange(key);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {label}
              <svg
                className="catalog-sort__check"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                {key === value && (
                  <path
                    d="m3 8 3 3 7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                )}
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
