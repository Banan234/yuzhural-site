import { useEffect, useState } from 'react';

const STORAGE_KEY = 'yuzhural-cable-calculation-v1';
function validItem(item) {
  return (
    item &&
    ['id', 'mark', 'configuration', 'drumDescription'].every(
      (key) => typeof item[key] === 'string'
    ) &&
    ['length', 'minKg', 'maxKg', 'cableMinKg', 'cableMaxKg', 'drumsKg'].every(
      (key) => Number.isFinite(item[key]) && item[key] >= 0
    ) &&
    item.length > 0 &&
    item.minKg > 0 &&
    item.maxKg >= item.minKg &&
    (item.voltageKv === null || Number.isFinite(item.voltageKv)) &&
    Array.isArray(item.sources) &&
    item.sources.every((source) => typeof source === 'string') &&
    (!item.diameter ||
      (Number.isFinite(item.diameter.minMm) &&
        Number.isFinite(item.diameter.maxMm)))
  );
}
export function useCableCalculationItems() {
  // Начальное состояние совпадает с SSR. Восстановление выполняется после гидратации.
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.sessionStorage.getItem(STORAGE_KEY) || '[]'
      );
      if (Array.isArray(saved)) setItems(saved.filter(validItem).slice(0, 30));
    } catch {
      setStorageError(true);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [items, loaded]);
  return { items, setItems, storageError };
}
