export const SECTION_SOURCES = {
  standard:
    'https://protect.gost.ru/gost/details/9ad936e3-1370-4745-a211-ad1c7737bb68',
  drop: 'https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions',
  apparent:
    'https://www.electrical-installation.org/enwiki/Installed_apparent_power_(kVA)',
  motor: 'https://www.electrical-installation.org/enwiki/Induction_motors',
};
export const SECTION_LOAD_MODES = {
  power: {
    option: 'Активной электрической мощностью, кВт',
    label: 'Активная электрическая мощность, кВт',
    unit: 'кВт потребляемой мощности',
    max: 500,
  },
  apparent: {
    option: 'Полной мощностью, кВА',
    label: 'Полная мощность, кВА',
    unit: 'кВА',
    max: 1000,
  },
  motor: {
    option: 'Мощностью двигателя на валу, кВт',
    label: 'Мощность двигателя на валу, кВт',
    unit: 'кВт на валу',
    max: 500,
  },
  current: {
    option: 'Током, А',
    label: 'Ток нагрузки, А',
    unit: 'А',
    max: 1000,
  },
};
export const SECTION_INSULATIONS = {
  pvc: 'ПВХ, 70 °C',
  xlpeEpr: 'СПЭ или ЭПР, 90 °C',
};
export const SECTION_METHODS = {
  A2: 'В трубе в теплоизолированной стене (A2)',
  B2: 'Многожильный кабель в трубе на стене (B2)',
  C: 'Кабель на стене или неперфорированном лотке (C)',
  D1: 'Один многожильный кабель в трубе в земле (D1)',
  D2: 'Бронированный кабель непосредственно в земле (D2)',
};

export function isGroundMethod(method) {
  return method === 'D1' || method === 'D2';
}

// ГОСТ Р 50571.5.52-2011, таблицы В.52.14–В.52.16.
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
  0.5: 1.26,
  0.7: 1.2,
  1: 1.18,
  1.5: 1.1,
  2: 1.05,
  2.5: 1,
  3: 0.96,
};
const AIR_FACTORS_90 = {
  10: 1.15,
  15: 1.12,
  20: 1.08,
  25: 1.04,
  30: 1,
  35: 0.96,
  40: 0.91,
  45: 0.87,
  50: 0.82,
  55: 0.76,
  60: 0.71,
  65: 0.65,
  70: 0.58,
  75: 0.5,
  80: 0.41,
};
const GROUND_FACTORS_90 = {
  10: 1.07,
  15: 1.04,
  20: 1,
  25: 0.96,
  30: 0.93,
  35: 0.89,
  40: 0.85,
  45: 0.8,
  50: 0.76,
  55: 0.71,
  60: 0.65,
  65: 0.6,
  70: 0.53,
  75: 0.46,
  80: 0.38,
};
const DIRECT_SOIL_FACTORS = {
  0.5: 1.88,
  0.7: 1.62,
  1: 1.5,
  1.5: 1.28,
  2: 1.12,
  2.5: 1,
  3: 0.9,
};

export function getSectionTemperatureFactors(method, insulation) {
  if (isGroundMethod(method)) {
    return insulation === 'xlpeEpr'
      ? GROUND_FACTORS_90
      : GROUND_TEMPERATURE_FACTORS;
  }
  return insulation === 'xlpeEpr' ? AIR_FACTORS_90 : AIR_TEMPERATURE_FACTORS;
}

const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
// ГОСТ Р 50571.5.52-2011, таблицы В.52.2–В.52.5.
// Базовые условия: 30 °C в воздухе, 20 °C в земле.
const AMPACITY = {
  pvc: {
    2: {
      copper: {
        A2: [14, 18.5, 25, 32, 43, 57, 75, 92, 110, 139, 167, 192],
        B2: [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232],
        C: [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299],
        D1: [22, 29, 37, 46, 60, 78, 99, 119, 140, 173, 204, 231],
        D2: [22, 28, 38, 48, 64, 83, 110, 132, 156, 192, 230, 261],
      },
      aluminium: {
        A2: [44, 58, 71, 86, 108, 130, 150],
        B2: [54, 71, 86, 104, 131, 157, 181],
        C: [66, 83, 103, 125, 160, 195, 226],
        D1: [61, 77, 93, 109, 135, 159, 180],
        D2: [63, 82, 98, 117, 145, 173, 200],
      },
    },
    3: {
      copper: {
        A2: [13, 17.5, 23, 29, 39, 52, 68, 83, 99, 125, 150, 172],
        B2: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206],
        C: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259],
        D1: [18, 24, 30, 38, 50, 64, 82, 98, 116, 143, 169, 192],
        D2: [19, 24, 33, 41, 54, 70, 92, 110, 130, 162, 193, 220],
      },
      aluminium: {
        A2: [41, 53, 65, 78, 98, 118, 135],
        B2: [48, 62, 77, 92, 116, 139, 160],
        C: [59, 73, 90, 110, 140, 170, 197],
        D1: [50, 64, 77, 91, 112, 132, 150],
        D2: [53, 69, 83, 99, 122, 148, 169],
      },
    },
  },
  xlpeEpr: {
    2: {
      copper: {
        A2: [18.5, 25, 33, 42, 57, 76, 99, 121, 145, 183, 220, 253],
        B2: [22, 30, 40, 51, 69, 91, 119, 146, 175, 221, 265, 305],
        C: [24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382],
        D1: [25, 33, 43, 53, 71, 91, 116, 139, 164, 203, 239, 271],
        D2: [27, 35, 46, 58, 77, 100, 129, 155, 183, 225, 270, 306],
      },
      aluminium: {
        A2: [60, 78, 96, 115, 145, 175, 201],
        B2: [72, 94, 115, 138, 175, 210, 242],
        C: [84, 101, 126, 154, 198, 241, 280],
        D1: [71, 90, 108, 128, 158, 186, 211],
        D2: [76, 98, 117, 139, 170, 204, 233],
      },
    },
    3: {
      copper: {
        A2: [16.5, 22, 30, 38, 51, 68, 89, 109, 130, 164, 197, 227],
        B2: [19.5, 26, 35, 44, 60, 80, 105, 126, 154, 194, 233, 268],
        C: [22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322],
        D1: [21, 28, 36, 44, 58, 75, 96, 115, 135, 167, 197, 223],
        D2: [23, 30, 39, 49, 65, 84, 107, 129, 153, 188, 226, 257],
      },
      aluminium: {
        A2: [55, 71, 87, 104, 131, 157, 180],
        B2: [64, 84, 103, 124, 156, 188, 216],
        C: [76, 90, 112, 136, 174, 211, 245],
        D1: [59, 75, 90, 106, 130, 154, 174],
        D2: [64, 82, 98, 117, 144, 172, 197],
      },
    },
  },
};
const BUNDLED = [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5];
const SINGLE_LAYER = [1, 0.85, 0.79, 0.75, 0.73, 0.72, 0.72, 0.71, 0.7];
// ГОСТ Р 50571.5.52-2011, таблицы В.52.17 и В.52.18.
const LARGE_BUNDLES = { 12: 0.45, 16: 0.41, 20: 0.38 };
export const DIRECT_BURIAL_GAPS = {
  touching: 'Кабели соприкасаются',
  diameter: 'Один наружный диаметр кабеля',
  0.125: '125 мм',
  0.25: '250 мм',
  0.5: '500 мм',
};
// Столбцы в порядке таблицы В.52.18: касание, диаметр, 125, 250 и 500 мм.
const DIRECT_BURIAL_GROUPS = {
  2: [0.75, 0.8, 0.85, 0.9, 0.9],
  3: [0.65, 0.7, 0.75, 0.8, 0.85],
  4: [0.6, 0.6, 0.7, 0.75, 0.8],
  5: [0.55, 0.55, 0.65, 0.7, 0.8],
  6: [0.5, 0.55, 0.6, 0.7, 0.8],
  7: [0.45, 0.51, 0.59, 0.67, 0.76],
  8: [0.43, 0.48, 0.57, 0.65, 0.75],
  9: [0.41, 0.46, 0.55, 0.63, 0.74],
  12: [0.36, 0.42, 0.51, 0.59, 0.71],
  16: [0.32, 0.38, 0.47, 0.56, 0.68],
  20: [0.29, 0.35, 0.44, 0.53, 0.66],
};

const AIR_CIRCUITS = BUNDLED.map((_, index) => index + 1);
export function getSectionCircuitOptions(method) {
  if (method === 'D1') return [1];
  if (method === 'D2')
    return [1, ...Object.keys(DIRECT_BURIAL_GROUPS).map(Number)];
  if (method === 'C') return AIR_CIRCUITS;
  return [...AIR_CIRCUITS, ...Object.keys(LARGE_BUNDLES).map(Number)];
}

export function sectionNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  return Number(String(value).replace(',', '.'));
}
export function calculateCableSection(input) {
  const errors = {};
  const phases = Number(input.phases);
  const material = input.material;
  const method = input.method;
  const insulation = input.insulation ?? 'pvc';
  const loadMode = input.loadMode;
  const loadModeSupported = Object.hasOwn(SECTION_LOAD_MODES, loadMode);
  const load = sectionNumber(input.load);
  const efficiency =
    loadMode === 'motor' ? sectionNumber(input.efficiencyPercent) / 100 : 1;
  const voltage = sectionNumber(input.voltage);
  const cosPhi = sectionNumber(input.cosPhi);
  const length = sectionNumber(input.length);
  const maxDropPercent = sectionNumber(input.maxDropPercent);
  const upstreamDropPercent = sectionNumber(input.upstreamDropPercent);
  const temperature = sectionNumber(input.temperature);
  const circuits = sectionNumber(input.circuits);
  const soilResistivity = sectionNumber(input.soilResistivity);
  const breaker = input.breaker === '' ? null : sectionNumber(input.breaker);
  const ground = isGroundMethod(method);
  const groupedDirectBurial = method === 'D2' && circuits > 1;
  const gapIndex = Object.keys(DIRECT_BURIAL_GAPS).indexOf(
    input.directBurialGap
  );
  const soilFactors = method === 'D2' ? DIRECT_SOIL_FACTORS : SOIL_FACTORS;
  if (![1, 3].includes(phases))
    errors.phases = 'Выберите однофазную или трёхфазную сеть.';
  if (!['copper', 'aluminium'].includes(material))
    errors.material = 'Выберите медь или алюминий.';
  if (!Object.hasOwn(SECTION_INSULATIONS, insulation))
    errors.insulation = 'Выберите поддерживаемый тип изоляции.';
  if (!Object.hasOwn(SECTION_METHODS, method))
    errors.method = 'Выберите поддерживаемый способ прокладки.';
  if (
    !loadModeSupported ||
    !(load > 0 && load <= SECTION_LOAD_MODES[loadMode].max)
  )
    errors.load = loadModeSupported
      ? `Введите нагрузку больше 0 и до ${SECTION_LOAD_MODES[loadMode].max}.`
      : 'Выберите способ задания нагрузки.';
  if (!(efficiency > 0 && efficiency <= 1))
    errors.efficiencyPercent = 'КПД должен быть больше 0 и не выше 100%.';
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
  const temperatureFactor = getSectionTemperatureFactors(method, insulation)[
    temperature
  ];
  if (!temperatureFactor)
    errors.temperature = 'Выберите температуру из таблицы.';
  if (!getSectionCircuitOptions(method).includes(circuits))
    errors.circuits =
      'Выберите число цепей из таблицы для выбранной прокладки.';
  if (groupedDirectBurial && gapIndex < 0)
    errors.directBurialGap = 'Выберите зазор между кабелями.';
  if (ground && !soilFactors[soilResistivity])
    errors.soilResistivity =
      'Выберите тепловое сопротивление грунта из таблицы.';
  if (groupedDirectBurial && soilResistivity !== 2.5)
    errors.soilResistivity =
      'Групповая таблица для D2 рассчитана на 2,5 К·м/Вт.';
  if (breaker !== null && !(breaker > 0 && breaker <= 1000))
    errors.breaker =
      'Номинал защиты: больше 0 и до 1000 А либо оставьте поле пустым.';
  if (Object.keys(errors).length) return { errors, rows: [], selected: null };
  const phaseFactor = phases === 1 ? 1 : Math.sqrt(3);
  const currentPowerFactor = loadMode === 'apparent' ? 1 : cosPhi;
  const current =
    loadMode === 'current'
      ? load
      : (load * 1000) /
        (phaseFactor * voltage * currentPowerFactor * efficiency);
  if (!Number.isFinite(current))
    return {
      errors: { efficiencyPercent: 'Укажите КПД из паспорта двигателя.' },
      rows: [],
      selected: null,
    };
  if (breaker !== null && breaker < current)
    return {
      errors: {
        breaker:
          'Номинал защиты меньше тока нагрузки. Проверьте нагрузку и защиту.',
      },
      rows: [],
      selected: null,
    };
  let groupingFactor = 1;
  if (groupedDirectBurial) {
    groupingFactor = DIRECT_BURIAL_GROUPS[circuits][gapIndex];
  } else if (!ground) {
    const airFactors = method === 'C' ? SINGLE_LAYER : BUNDLED;
    groupingFactor = airFactors[circuits - 1] ?? LARGE_BUNDLES[circuits];
  }
  const soilFactor = ground ? soilFactors[soilResistivity] : 1;
  const factor = temperatureFactor * groupingFactor * soilFactor;
  const sizes = material === 'copper' ? SECTIONS : SECTIONS.slice(5);
  const loadedCores = phases === 1 ? 2 : 3;
  const currents = AMPACITY[insulation][loadedCores][material][method];
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
