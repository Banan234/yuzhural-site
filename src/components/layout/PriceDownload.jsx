import { useEffect, useRef, useState } from 'react';

export default function PriceDownload() {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      ref={root}
      className="price-download"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="topbar-download"
        aria-expanded={open}
        aria-controls="price-download-options"
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Скачать прайс-лист
      </button>
      <div
        id="price-download-options"
        className="price-download__options"
        hidden={!open}
      >
        <a
          href="/price-buyer.xlsx"
          download="price-buyer.xlsx"
          onClick={() => setOpen(false)}
        >
          <span>Прайс для покупателей</span>
          <small>XLSX · Таблица с фильтрами</small>
        </a>
        <a href="/price.xls" download onClick={() => setOpen(false)}>
          <span>Исходный прайс</span>
          <small>XLS · Оригинальный файл</small>
        </a>
      </div>
    </div>
  );
}
