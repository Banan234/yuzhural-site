import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const AUTO_DELAY_MS = 4000;
const INITIAL_AUTO_DELAY_MS = 2000;
const SECOND_AUTO_DELAY_MS = 3000;
const SLIDE_DURATION_MS = 420;
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function useProductCarousel(products, enabled) {
  const carouselRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const orderRef = useRef(products);
  const busyRef = useRef(false);
  const nextAutoDelayRef = useRef(INITIAL_AUTO_DELAY_MS);
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [order, setOrder] = useState(products);
  const [motion, setMotion] = useState(null);
  const [geometry, setGeometry] = useState({
    canScroll: false,
    visibleCount: 4,
  });
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reading, setReading] = useState(false);
  const [touching, setTouching] = useState(false);
  const [interaction, setInteraction] = useState(0);
  const items = motion?.direction < 0 ? motion.next : order;

  useBrowserLayoutEffect(() => {
    orderRef.current = products;
    setOrder(products);
    setMotion(null);
    busyRef.current = false;
  }, [products]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      setReducedMotion(media?.matches ?? false);
    };
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media?.addEventListener?.('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media?.removeEventListener?.('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !carouselRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      const update = () => {
        const bounds = carouselRef.current?.getBoundingClientRect();
        setInView(
          Boolean(
            bounds && bounds.bottom > 0 && bounds.top < window.innerHeight
          )
        );
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      return () => window.removeEventListener('scroll', update);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.1);
      },
      { threshold: [0, 0.1] }
    );
    observer.observe(carouselRef.current);
    return () => observer.disconnect();
  }, [enabled]);

  useBrowserLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!enabled || !viewport || !track) return;
    const measure = () => {
      const slide = track.firstElementChild;
      if (!slide) return;
      const width = slide.getBoundingClientRect().width;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const step = width + gap;
      setGeometry({
        canScroll: step * products.length - gap > viewport.clientWidth + 1,
        visibleCount:
          step > 0
            ? Math.max(1, Math.floor((viewport.clientWidth + gap + 1) / step))
            : 1,
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [enabled, products]);

  const move = useCallback(
    (direction, automatic = false) => {
      if (!enabled || !geometry.canScroll || busyRef.current) return false;
      const current = orderRef.current;
      if (current.length < 2) return false;
      busyRef.current = true;
      nextAutoDelayRef.current =
        automatic && nextAutoDelayRef.current === INITIAL_AUTO_DELAY_MS
          ? SECOND_AUTO_DELAY_MS
          : AUTO_DELAY_MS;
      const next =
        direction > 0
          ? [...current.slice(1), current[0]]
          : [current[current.length - 1], ...current.slice(0, -1)];
      setInteraction((value) => value + 1);
      setMotion({ direction, next });
      return true;
    },
    [enabled, geometry.canScroll]
  );

  useBrowserLayoutEffect(() => {
    if (!motion) {
      busyRef.current = false;
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      orderRef.current = motion.next;
      setOrder(motion.next);
      setMotion(null);
    };
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = track.firstElementChild.getBoundingClientRect().width + gap;
    if (reducedMotion || !track.animate) {
      finish();
      return;
    }
    const animation = track.animate(
      [
        {
          transform: `translate3d(${motion.direction > 0 ? 0 : -step}px, 0, 0)`,
        },
        {
          transform: `translate3d(${motion.direction > 0 ? -step : 0}px, 0, 0)`,
        },
      ],
      {
        duration: SLIDE_DURATION_MS,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        fill: 'forwards',
      }
    );
    // Переставляем карточки после фактического завершения движения.
    animation.finished.then(finish, () => {});
    const initialWidth = viewportRef.current.clientWidth;
    const finishOnResize = () => {
      if (viewportRef.current?.clientWidth !== initialWidth) finish();
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(finishOnResize);
    observer?.observe(viewportRef.current);
    window.addEventListener('resize', finishOnResize);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', finishOnResize);
      animation.cancel();
    };
  }, [motion, reducedMotion]);

  useEffect(() => {
    if (!pageVisible || reading || touching) {
      nextAutoDelayRef.current = AUTO_DELAY_MS;
    } else if (hovered) {
      nextAutoDelayRef.current = SECOND_AUTO_DELAY_MS;
    }
    if (
      !enabled ||
      reducedMotion ||
      !geometry.canScroll ||
      !inView ||
      !pageVisible ||
      hovered ||
      reading ||
      touching ||
      motion
    )
      return;
    // При первом появлении: 2, 3, затем 4 секунды. После ухода курсора — 3.
    const timer = setTimeout(
      () => move(1, true),
      nextAutoDelayRef.current
    );
    return () => clearTimeout(timer);
  }, [
    enabled,
    reducedMotion,
    geometry.canScroll,
    inView,
    pageVisible,
    hovered,
    reading,
    touching,
    motion,
    interaction,
    move,
  ]);

  const carouselEvents = {
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch') setHovered(true);
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== 'touch') setHovered(false);
    },
    onFocusCapture: (event) => {
      setReading(
        viewportRef.current?.contains(event.target) ||
          event.target === carouselRef.current
      );
    },
    onBlurCapture: (event) => {
      setReading(
        viewportRef.current?.contains(event.relatedTarget) ||
          event.relatedTarget === carouselRef.current
      );
    },
    onKeyDown: (event) => {
      if (viewportRef.current?.contains(event.target)) return;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]'
        )
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }
    },
  };

  const viewportEvents = {
    onPointerDown: (event) => {
      suppressClickRef.current = false;
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      gestureRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      setTouching(true);
    },
    onPointerUp: (event) => {
      const start = gestureRef.current;
      if (!start || start.id !== event.pointerId) return;
      gestureRef.current = null;
      setTouching(false);
      setInteraction((value) => value + 1);
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        suppressClickRef.current = true;
        move(dx < 0 ? 1 : -1);
      }
    },
    onPointerCancel: () => {
      gestureRef.current = null;
      setTouching(false);
    },
    onClickCapture: (event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return {
    carouselRef,
    viewportRef,
    trackRef,
    items,
    trailingProduct:
      motion && order.length <= geometry.visibleCount + 1
        ? motion.direction < 0
          ? order[order.length - 1]
          : order[0]
        : null,
    move,
    carouselEvents,
    viewportEvents,
    canScroll: geometry.canScroll,
    visibleCount: geometry.visibleCount,
    isAnimating: Boolean(motion),
    toggleAutoplay: () => setAutoplayRequested(reducedMotion),
  };
}
