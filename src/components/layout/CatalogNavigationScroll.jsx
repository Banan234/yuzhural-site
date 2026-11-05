import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function CatalogNavigationScroll() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (changed && pathname.startsWith('/catalog/') && !hash && navigationType !== 'POP') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash, navigationType]);

  return null;
}
