// Файл реализует доступное модальное окно с portal, escape-close и блокировкой фонового скролла.

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute('aria-hidden') !== 'true' && element.tabIndex >= 0
  );
}

export default function Modal({
  isOpen,
  onClose,
  children,
  windowClassName = '',
  ariaLabel = 'Диалоговое окно',
  fallbackFocusRef,
}) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(modalRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (
          !modalRef.current?.contains(activeElement) ||
          activeElement === firstElement
        ) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (
        !modalRef.current?.contains(activeElement) ||
        activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    const focusableElements = getFocusableElements(modalRef.current);
    const initialFocusElement = focusableElements[0] || modalRef.current;
    initialFocusElement?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;

      const previousActiveElement = previousActiveElementRef.current;
      if (
        previousActiveElement &&
        previousActiveElement !== document.body &&
        document.contains(previousActiveElement) &&
        typeof previousActiveElement.focus === 'function'
      ) {
        previousActiveElement.focus();
      } else {
        fallbackFocusRef?.current?.focus();
      }
    };
  }, [isOpen, fallbackFocusRef]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal-window${windowClassName ? ` ${windowClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        {children}
      </div>
    </div>
  );
}
