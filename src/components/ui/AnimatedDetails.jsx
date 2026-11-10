import { useEffect, useRef } from 'react';

export default function AnimatedDetails({
  title,
  children,
  defaultOpen = false,
}) {
  const detailsRef = useRef(null);
  const animationRef = useRef(null);
  const expandedRef = useRef(defaultOpen);

  useEffect(() => () => animationRef.current?.cancel(), []);

  function toggle(event) {
    const details = detailsRef.current;
    if (
      !details?.animate ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      animationRef.current?.cancel();
      animationRef.current = null;
      details.style.overflow = '';
      expandedRef.current = !details.open;
      return;
    }
    event.preventDefault();
    const startHeight = details.getBoundingClientRect().height;
    animationRef.current?.cancel();
    const expanded = !expandedRef.current;
    expandedRef.current = expanded;
    details.open = expanded;
    const endHeight = details.getBoundingClientRect().height;
    details.open = true;
    details.style.overflow = 'hidden';
    const animation = details.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      { duration: 280, easing: 'ease-in-out' }
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      details.open = expanded;
      details.style.overflow = '';
      animationRef.current = null;
    };
  }

  return (
    <details ref={detailsRef} open={defaultOpen}>
      <summary onClick={toggle}>{title}</summary>
      {children}
    </details>
  );
}
