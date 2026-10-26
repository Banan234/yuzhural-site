import { useEffect, useRef } from 'react';

// Keeps keyboard focus in an open overlay and restores its trigger on close.
export function useDialogFocus(isOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!isOpen || !ref.current) return undefined;
    const dialog = ref.current;
    const previous = document.activeElement;
    const selector =
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
    const controls = () =>
      [...dialog.querySelectorAll(selector)].filter(
        (node) => !node.closest('[hidden], [inert]')
      );
    const hidden = [];
    for (
      let node = dialog;
      node?.parentElement && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && !sibling.inert) {
          sibling.inert = true;
          hidden.push(sibling);
        }
      }
    }
    (controls()[0] || dialog).focus();
    function trap(event) {
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0] || dialog;
      const last = items.at(-1) || dialog;
      if (
        !dialog.contains(document.activeElement) ||
        (event.shiftKey
          ? document.activeElement === first
          : document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      hidden.forEach((node) => {
        node.inert = false;
      });
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  return ref;
}
