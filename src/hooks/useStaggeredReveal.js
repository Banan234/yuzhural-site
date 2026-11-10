import { useEffect, useRef } from 'react';

export default function useStaggeredReveal(stagger = 200) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!list || motion?.matches || !window.IntersectionObserver) return;

    const animations = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if (motion?.matches || !entry.target.animate) return;

          const index = Array.from(list.children).indexOf(entry.target);
          const animation = entry.target.animate(
            [
              { opacity: 0, transform: 'translateY(18px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            {
              duration: 500,
              delay: index * stagger,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'backwards',
            }
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        });
      },
      { threshold: 0.15 }
    );
    Array.from(list.children).forEach((step) => observer.observe(step));

    const stopAnimations = () => {
      if (!motion?.matches) return;
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
    motion?.addEventListener('change', stopAnimations);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion?.removeEventListener('change', stopAnimations);
    };
  }, [stagger]);

  return listRef;
}
