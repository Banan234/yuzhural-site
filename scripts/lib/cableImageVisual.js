import { createHash } from 'node:crypto';

export class CableImageInputError extends Error {}

const canonical = (value) =>
  String(value)
    .toUpperCase()
    .replace(/Ё/gu, 'Е')
    .replace(/\s/gu, '')
    .replace(/НГ\(A\)/gu, 'НГ(А)');
const letters = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ь: '',
  ъ: '',
};
const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[а-я]/gu, (c) => letters[c])
    .replace(/[()]/gu, '')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const reject = (reason) => {
  throw new CableImageInputError(reason);
};

/** Conservative designation identity; an unknown modifier never silently disappears. */
export function getCableVisualFamily(spec, config) {
  const rules = config.visualRules;
  const modifiers = new Set();
  for (const attribute of spec.attributes) {
    const key = canonical(attribute);
    const suffix = Object.entries(rules.familyModifiers).find(
      ([name]) => canonical(name) === key
    )?.[1];
    if (suffix) modifiers.add(suffix);
    else if (!rules.nonFamilyAttributes.some((name) => canonical(name) === key))
      reject(`Unverified visual modifier: ${attribute}`);
  }
  const suffixes = [...modifiers].sort((a, b) => a.localeCompare(b, 'en'));
  // Conflicting fire indices need review rather than a synthetic combined family.
  if (suffixes.filter((value) => /^нг/iu.test(value)).length > 1)
    reject('Conflicting fire designation modifiers');
  return (
    spec.family +
    suffixes
      .map((value, index) =>
        index === 0 && /^нг/iu.test(value) ? value : `-${value}`
      )
      .join('')
  );
}

/** Only visible construction enters the identity. Render settings have a separate fingerprint. */
export function getCableVisualConfig(spec, config, colorRules) {
  const family = getCableVisualFamily(spec, config);
  const rule = {
    ...config.visualRules.default,
    ...config.visualRules.families?.[spec.family],
    ...config.visualRules.families?.[family],
  };
  const sectionAffectsVisual = rule.sectionAffectsVisual === true;
  const sectionMode = sectionAffectsVisual
    ? config.geometry.sectionMode
    : 'constant';
  let thicknessLabel = config.geometry.defaultThickness;
  let sectionKey = null;
  if (sectionAffectsVisual) {
    if (sectionMode === 'bands') {
      const band = config.geometry.sectionBands.find(
        (item) => spec.section <= item.maxSection
      );
      if (!band?.label) reject('No configured thickness band for this section');
      thicknessLabel = band.label;
      sectionKey = `band-${slug(band.label)}`;
    } else {
      sectionKey = `s${String(spec.section).replace('.', 'p')}`;
      if (spec.groundCores)
        sectionKey += `-${spec.groundCores}x${String(spec.groundSection).replace('.', 'p')}`;
    }
  }
  const descriptor = {
    family,
    cores: spec.cores,
    shape: spec.shape,
    material: spec.material,
    strand: spec.strand,
    jacket: spec.jacket,
    insulation: spec.insulation,
    colors: spec.colors,
    sectionAffectsVisual,
    sectionKey,
  };
  const preset = config.families[spec.family];
  const parts = [`${slug(family)}__${spec.cores}core`];
  for (const field of ['shape', 'material', 'strand', 'jacket', 'insulation'])
    if (spec[field] !== preset[field])
      parts.push(`${field}-${slug(spec[field])}`);
  if (
    !same(spec.colors, colorRules.profiles[preset.colors]?.[String(spec.cores)])
  )
    parts.push(`colors-${spec.colors.map(slug).join('-')}`);
  if (sectionKey) parts.push(sectionKey);
  const visualKey = parts.join('__');
  if (!/^[a-z0-9][a-z0-9_-]{0,219}$/u.test(visualKey))
    reject('Unsafe or excessively long visual key');
  return {
    visualKey,
    family,
    sectionAffectsVisual,
    sectionMode,
    thicknessLabel,
    descriptor,
    descriptorHash: createHash('sha256')
      .update(JSON.stringify(descriptor))
      .digest('hex'),
  };
}

export const getCableVisualKey = (spec, config, colorRules) =>
  getCableVisualConfig(spec, config, colorRules).visualKey;
