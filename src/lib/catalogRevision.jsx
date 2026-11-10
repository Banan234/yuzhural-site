import { useEffect, useState } from 'react';
import { PrerenderDataProvider, usePrerenderData } from './prerenderData';

// Refresh static catalog snapshots when manual product edits exist.
export function CatalogRevisionProvider({ children }) {
  const prerender = usePrerenderData();
  const [hasManualEdits, setHasManualEdits] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog-revision', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setHasManualEdits(data.hasManualEdits);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <PrerenderDataProvider data={hasManualEdits ? {} : prerender}>
      {children}
    </PrerenderDataProvider>
  );
}
