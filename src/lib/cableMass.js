// Справочные значения производителей остаются раздельными: одинаковая марка не означает одинаковую массу.

import reference from '../../data/cableMassReference.json';

export const CABLE_MASS_SOURCES = reference.sources;
export const CABLE_MASS_ENTRIES = reference.entries;

export function normalizeCableConfiguration(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[×x*]/g, 'х')
    .replace(/,(?=\d)/g, '.')
    .replace(/\s+/g, '')
    .replace(/(\.\d*?[1-9])0+(?!\d)|\.0+(?!\d)/g, '$1');
}

export function getCableMassRows({ mark, configuration, voltageKv }) {
  const configurationKey = normalizeCableConfiguration(configuration);
  return CABLE_MASS_ENTRIES.filter(
    (row) =>
      row.mark === mark &&
      normalizeCableConfiguration(row.configuration) === configurationKey &&
      row.voltageKv === voltageKv
  );
}

export function calculateCableMass(rows, lengthMeters) {
  const length = Number(String(lengthMeters).replace(',', '.'));
  if (!Number.isFinite(length) || length <= 0 || !rows.length) return null;
  const values = rows.map((row) => (row.massKgPerKm * length) / 1000);
  if (values.some((value) => !Number.isFinite(value) || value <= 0))
    return null;
  return {
    minKg: Math.min(...values),
    maxKg: Math.max(...values),
  };
}

export function getCableDiameterRange(rows) {
  const values = rows
    .map((row) => Number(row.diameterMm))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length
    ? { minMm: Math.min(...values), maxMm: Math.max(...values) }
    : null;
}

export function getCableManufacturerAverage(rows, lengthMeters) {
  const byManufacturer = new Map();
  const ambiguous = new Set();
  for (const row of rows) {
    const publisher = CABLE_MASS_SOURCES[row.sourceId]?.publisher;
    if (!publisher) continue;
    const previous = byManufacturer.get(publisher);
    if (previous && (
      previous.massKgPerKm !== row.massKgPerKm ||
      previous.diameterMm !== row.diameterMm
    )) ambiguous.add(publisher);
    byManufacturer.set(publisher, row);
  }

  const comparable = [...byManufacturer.entries()]
    .filter(([publisher]) => !ambiguous.has(publisher))
    .map(([, row]) => row);
  const count = comparable.length;
  if (count < 2) return null;

  const mass = calculateCableMass(comparable, lengthMeters);
  const length = Number(String(lengthMeters).replace(',', '.'));
  return {
    count,
    massKg: mass
      ? comparable.reduce((sum, row) => sum + (row.massKgPerKm * length) / 1000 / count, 0)
      : null,
    diameterMm: comparable.reduce((sum, row) => sum + row.diameterMm / count, 0),
  };
}

export function calculateMassWithDrums(cableMass, drumWeightKg, drumCount) {
  const weight = Number(String(drumWeightKg).replace(',', '.'));
  const count = Number(drumCount);
  if (
    !cableMass ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    !Number.isInteger(count) ||
    count <= 0
  )
    return null;

  const drumsKg = weight * count;
  if (
    !Number.isFinite(cableMass.maxKg + drumsKg) ||
    !Number.isFinite(cableMass.minKg + drumsKg)
  )
    return null;
  return {
    drumsKg,
    minKg: cableMass.minKg + drumsKg,
    maxKg: cableMass.maxKg + drumsKg,
  };
}
