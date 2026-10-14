// Источники: Schneider Electric, Electrical Installation Guide, проверены 14.10.2026.
// PVC 70°C; G20/B.52.4 — три нагруженные жилы; G21/C.52.1, G23 — две.
export const SECTION_SOURCES = {
  ampacity:
    'https://www.electrical-installation.org/enwiki/General_method_for_cable_sizing',
  twoLoaded:
    'https://www.electrical-installation.org/enwiki/Recommended_simplified_approach_for_cable_sizing',
  drop: 'https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions',
};
export const SECTION_METHODS = {
  B2: 'Многожильный кабель в трубе на стене (B2)',
  C: 'Кабель на стене или неперфорированном лотке (C)',
  D1: 'Один многожильный кабель в трубе в земле (D1)',
};
export const AIR_TEMPERATURE_FACTORS = {
  10: 1.22,
  15: 1.17,
  20: 1.12,
  25: 1.06,
  30: 1,
  35: 0.94,
  40: 0.87,
  45: 0.79,
  50: 0.71,
  55: 0.61,
  60: 0.5,
};
export const GROUND_TEMPERATURE_FACTORS = {
  10: 1.1,
  15: 1.05,
  20: 1,
  25: 0.95,
  30: 0.89,
  35: 0.84,
  40: 0.77,
  45: 0.71,
  50: 0.63,
  55: 0.55,
  60: 0.45,
};
export const SOIL_FACTORS = {
  0.5: 1.28,
  0.7: 1.2,
  1: 1.18,
  1.5: 1.1,
  2: 1.05,
  2.5: 1,
  3: 0.96,
};
const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
const CU3 = {
  B2: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206],
  C: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259],
  D1: [18, 24, 30, 38, 50, 64, 82, 98, 116, 143, 169, 192],
};
const CU2 = {
  B2: [15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239],
  C: [19.5, 27, 36, 46, 63, 85, 110, 137, 167, 213, 258, 299],
  D1: [22, 29, 38, 47, 63, 81, 104, 125, 148, 183, 216, 246],
};
// Для алюминия поддерживаются сечения 16–120 мм².
const AL3 = {
  B2: [48, 62, 77, 92, 116, 139, 160],
  C: [59, 73, 90, 110, 140, 170, 197],
  D1: [50, 64, 77, 91, 112, 132, 150],
};
const AL2 = {
  B2: [53, 70, 86, 104, 133, 161, 186],
  C: [66, 83, 103, 125, 160, 195, 226],
  D1: [62, 80, 96, 113, 140, 166, 189],
};
const BUNDLED = [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5];
const SINGLE_LAYER = [1, 0.85, 0.79, 0.75, 0.73, 0.72, 0.72, 0.71, 0.7];
export function sectionNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  return Number(String(value).replace(',', '.'));
}
export function calculateCableSection(input) {
  const errors = {};
  const phases = Number(input.phases);
  const material = input.material;
  const method = input.method;
  const loadMode = input.loadMode;
  const load = sectionNumber(input.load);
  const voltage = sectionNumber(input.voltage);
  const cosPhi = sectionNumber(input.cosPhi);
  const length = sectionNumber(input.length);
  const maxDropPercent = sectionNumber(input.maxDropPercent);
  const upstreamDropPercent = sectionNumber(input.upstreamDropPercent);
  const temperature = sectionNumber(input.temperature);
  const circuits = sectionNumber(input.circuits);
  const soilResistivity = sectionNumber(input.soilResistivity);
  const breaker = input.breaker === '' ? null : sectionNumber(input.breaker);
  const ground = method === 'D1';
  if (![1, 3].includes(phases))
    errors.phases = 'Выберите однофазную или трёхфазную сеть.';
  if (!['copper', 'aluminium'].includes(material))
    errors.material = 'Выберите медь или алюминий.';
  if (!SECTION_METHODS[method])
    errors.method = 'Выберите поддерживаемый способ прокладки.';
  if (
    !['power', 'current'].includes(loadMode) ||
    !(load > 0 && load <= (loadMode === 'power' ? 500 : 1000))
  )
    errors.load = 'Укажите положительную нагрузку: до 500 кВт или 1000 А.';
  if (
    !(
      voltage >= (phases === 1 ? 100 : 200) &&
      voltage <= (phases === 1 ? 500 : 1000)
    )
  )
    errors.voltage = 'Проверьте напряжение сети.';
  if (!(cosPhi >= 0.1 && cosPhi <= 1))
    errors.cosPhi = 'cos φ должен быть от 0,1 до 1.';
  if (!(length > 0 && length <= 10000))
    errors.length = 'Длина линии: больше 0 и до 10 000 м.';
  if (!(maxDropPercent > 0 && maxDropPercent <= 10))
    errors.maxDropPercent = 'Допустимое падение: больше 0 и до 10%.';
  if (!(upstreamDropPercent >= 0 && upstreamDropPercent < maxDropPercent))
    errors.upstreamDropPercent =
      'Падение до начала линии должно быть меньше общего допуска.';
  const temperatureFactor = (
    ground ? GROUND_TEMPERATURE_FACTORS : AIR_TEMPERATURE_FACTORS
  )[temperature];
  if (!temperatureFactor)
    errors.temperature = 'Выберите температуру из таблицы.';
  if (
    !Number.isInteger(circuits) ||
    circuits < 1 ||
    circuits > 9 ||
    (ground && circuits !== 1)
  )
    errors.circuits = ground
      ? 'Для D1 поддерживается одна цепь в отдельной трубе.'
      : 'Укажите от 1 до 9 цепей.';
  if (ground && !SOIL_FACTORS[soilResistivity])
    errors.soilResistivity =
      'Выберите тепловое сопротивление грунта из таблицы.';
  if (breaker !== null && !(breaker > 0 && breaker <= 1000))
    errors.breaker =
      'Номинал защиты: больше 0 и до 1000 А либо оставьте поле пустым.';
  if (Object.keys(errors).length) return { errors, rows: [], selected: null };
  const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
  const current =
    loadMode === 'current'
      ? load
      : (load * 1000) / (phaseFactor * voltage * cosPhi);
  if (breaker !== null && breaker < current)
    return {
      errors: {
        breaker:
          'Номинал защиты меньше тока нагрузки. Проверьте нагрузку и защиту.',
      },
      rows: [],
      selected: null,
    };
  const groupingFactor = ground
    ? 1
    : (method === 'C' ? SINGLE_LAYER : BUNDLED)[circuits - 1];
  const soilFactor = ground ? SOIL_FACTORS[soilResistivity] : 1;
  const factor = temperatureFactor * groupingFactor * soilFactor;
  const sizes = material === 'copper' ? SECTIONS : SECTIONS.slice(5);
  const currents = (
    material === 'copper'
      ? phases === 1
        ? CU2
        : CU3
      : phases === 1
        ? AL2
        : AL3
  )[method];
  const rows = sizes.map((section, index) => {
    const baseAmpacity = currents[index];
    const ampacity = baseAmpacity * factor;
    // R по справочнику при 90°C консервативен для PVC 70°C. X=0.08 Ω/км.
    const resistance = (material === 'copper' ? 23.7 : 37.6) / section;
    const dropVolts =
      ((phases === 1 ? 2 : Math.sqrt(3)) *
        current *
        (resistance * cosPhi + 0.08 * Math.sqrt(1 - cosPhi * cosPhi)) *
        length) /
      1000;
    const dropPercent = (dropVolts / voltage) * 100;
    const totalDropPercent = dropPercent + upstreamDropPercent;
    const currentFits = Math.max(current, breaker || 0) <= ampacity;
    const dropFits = totalDropPercent <= maxDropPercent;
    return {
      section,
      baseAmpacity,
      ampacity,
      dropVolts,
      dropPercent,
      totalDropPercent,
      currentFits,
      dropFits,
      fits: currentFits && dropFits,
    };
  });
  return {
    errors: {},
    rows,
    selected: rows.find((row) => row.fits) || null,
    current,
    temperatureFactor,
    groupingFactor,
    soilFactor,
    factor,
  };
}
