import { prepareCableStyleRequest } from './cableImageStyle.js';
import { withCableStyleSandbox } from './fixtures/cableStyleSandbox.js';
import { expect, test } from 'vitest';
import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { buildCableTechnicalProfile, technicalProfilePrompt } from './cableTechnicalProfile.js';
import { catalogCableSpecs } from './fixtures/cableCatalogFixture.js';
import { cableSchematicSignature } from './cableReferenceCompatibility.js';

const ordinary = { sku: 'A', markFamily: 'ВВГ', cores: 3, specs: catalogCableSpecs };
const patch = specs => ({ ...ordinary, specs: { ...ordinary.specs, ...specs } });
const read = specs => readCableCatalogProfile(patch(specs));

test('optional unknown interfaces and drain are preserved as unknown and never rendered as extra layers', () => {
  const result = read({ 'Дренажный проводник': undefined, 'Разделительный слой': undefined,
    'Внутренняя оболочка': undefined, 'Огнестойкий барьер': undefined });
  expect(result.issues).toEqual([]);
  expect(result.requirements.optional).toContain('Дренажный проводник');
  const contract = buildCableTechnicalProfile(result.profile);
  expect(contract.innerSheath.status).toBe('unknown');
  expect(contract.drainWireStatus).toBe('unknown');
  expect(contract.fireBarrierStatus).toBe('unknown');
  expect(contract.layers.map(layer => layer.role)).toEqual(['outer-jacket', 'individual-insulation']);
  expect(technicalProfilePrompt(contract)).toContain('Drain status is unknown');
});

test('missing fields produce marked assumptions while contradictory layers remain blocked and undocumented FR is omitted', () => {
  const incomplete = patch({ 'Форма кабеля': undefined, 'Заполнение сердечника': undefined });
  const first = readCableCatalogProfile(incomplete);
  expect(first.profile.schematicAssumptions['Форма кабеля'].status).toBe('UNCONFIRMED');
  expect(first.issues).not.toContain('catalog-missing-or-ambiguous: Заполнение сердечника');
  expect(first.visualKey).toBe(readCableCatalogProfile({ ...incomplete, sku: 'B' }).visualKey);
  expect(readCableCatalogProfile({ ...incomplete, sku: 'B', attributes: ['З'] }).visualKey).not.toBe(first.visualKey);
  expect(read({ 'Материал заполнения': 'ПВХ' }).issues).toContain('catalog-conflict: слои и флаги исполнения');
  expect(read({ 'Бронированный': 'Да' }).profile.armorType).toBe('schematic-armor');
  expect(read({ 'Экранированный': 'Да' }).profile.schematicAssumptions['Расположение экрана'].status).toBe('UNCONFIRMED');
  expect(readCableCatalogProfile({ ...ordinary, attributes: ['нг(А)-FRLS'],
    specs: { ...ordinary.specs, 'Огнестойкий барьер': undefined } }).profile.schematicAssumptions.fireBarrier.value)
    .toBe('not-exposed');
});

test('visibly distinct constructions remain distinct and matching SKU identities share a visual key', () => {
  const variants = [
    {}, { 'Конструкция токопроводящей жилы': 'Многопроволочная' }, { 'Форма токопроводящей жилы': 'Секторная' },
    { 'Бронированный': 'Да', 'Тип брони': 'Стальные ленты' },
    { 'Экранированный': 'Да', 'Расположение экрана': 'Под наружной оболочкой', 'Дренажный проводник': undefined },
    { 'Заполнение сердечника': 'Предусмотрено', 'Материал заполнения': 'ПВХ', 'Расположение заполнения': 'Между изолированными жилами' },
    { 'Огнестойкий барьер': 'Да', 'Материал огнестойкого барьера': 'Слюдосодержащие ленты',
      'Расположение огнестойкого барьера': 'Под индивидуальной изоляцией каждой жилы' },
  ].map(read);
  expect(variants.flatMap(result => result.issues)).toEqual([]);
  expect(new Set(variants.map(result => result.visualKey)).size).toBe(variants.length);
  const otherSku = readCableCatalogProfile({ ...ordinary, sku: 'B' });
  expect(otherSku.visualKey).toBe(variants[0].visualKey);
  expect(otherSku.technicalProfileId).toBe(variants[0].technicalProfileId);
});

test('confirmed outer jacket with unknown material remains a neutral layer; unknown jacket presence is marked', () => {
  const confirmed = read({ 'Материал оболочки': undefined });
  expect(confirmed.issues).toEqual([]);
  const contract = buildCableTechnicalProfile(confirmed.profile);
  expect(contract.layers.find(layer => layer.role === 'outer-jacket').material).toBeNull();
  expect(technicalProfilePrompt(contract)).toContain('neutral illustrative surface');
  expect(read({ 'Наружная оболочка': undefined, 'Материал оболочки': undefined }).profile.schematicAssumptions['Наружная оболочка'].status)
    .toBe('UNCONFIRMED');
});

test('an explicitly present polymer layer needs a location but no chemical name', () => {
  const neutral = read({
    'Материал изоляции': undefined,
    'Внутренняя оболочка': 'Да',
    'Материал внутренней оболочки': undefined,
    'Заполнение сердечника': 'Предусмотрено',
    'Материал заполнения': undefined,
    'Расположение заполнения': 'Между изолированными жилами',
  });
  expect(neutral.issues).toEqual([]);
  const contract = buildCableTechnicalProfile(neutral.profile);
  expect(contract.layers.map(layer => layer.role)).toEqual([
    'outer-jacket', 'inner-sheath', 'interstitial-filling', 'individual-insulation',
  ]);
});

test('schematic reuse ignores invisible polymer chemistry and protects visible anatomy', () => {
  const base = read({}).profile;
  const variant = {
    ...base,
    family: 'other-marking',
    technicalConstruction: { ...base.technicalConstruction, insulationMaterial: 'иной полимер', outerMaterial: null },
  };
  const signature = cableSchematicSignature(base);
  expect(signature).toBeTruthy();
  expect(cableSchematicSignature(variant)).toBe(signature);
  expect(cableSchematicSignature(read({
    'Заполнение сердечника': 'Предусмотрено',
    'Расположение заполнения': 'Между изолированными жилами',
  }).profile)).not.toBe(signature);
  expect(cableSchematicSignature(read({ 'Форма токопроводящей жилы': 'Секторная' }).profile)).not.toBe(signature);
});

test('uses the confirmed card count when its normalized copy is missing and rejects inconsistent counts', () => {
  const product = { ...ordinary, cores: undefined, specs: { ...ordinary.specs, 'Количество жил': '3' } };
  expect(readCableCatalogProfile(product).profile.cores).toBe(3);
  expect(readCableCatalogProfile({ ...product, cores: 2 }).issues)
    .toContain('catalog-conflict: Количество жил');
});

test('rejects a visible contradiction even when the structured specs form a complete profile', () => {
  const conflicting = { ...ordinary, visualCharacteristics: { shield: true } };
  expect(readCableCatalogProfile(conflicting)).toMatchObject({
    profile: null, issues: ['catalog-conflict: shield'],
  });
});

test.each([3, 4])('keeps %i confirmed pairs distinct from an ungrouped multicore cable', count => {
  const grouped = readCableCatalogProfile({
    ...ordinary, cores: count, groupCores: 2, crossSection: 0.75,
    conductorConfiguration: count + '×2×0,75',
  });
  expect(grouped.issues).toEqual([]);
  const contract = buildCableTechnicalProfile(grouped.profile);
  expect(contract.groups).toEqual({ count, coresPerGroup: 2 });
  expect(contract.coreMetalEndCount).toBe(count * 2);
  expect(technicalProfilePrompt(contract)).toContain('separate bundles of 2 insulated cores each');
  const ungrouped = readCableCatalogProfile({ ...ordinary, cores: count * 2 });
  expect(cableSchematicSignature(grouped.profile)).not.toBe(cableSchematicSignature(ungrouped.profile));
});

test('uses the area ratio for an explicitly declared reduced neutral and uses a neutral colour for unknown roles', () => {
  const product = { ...ordinary, crossSection: 2, groundCores: 1, groundSection: 1 };
  expect(readCableCatalogProfile(product).profile.coreColors.at(-1)).toBe('neutral grey');
  const resolved = readCableCatalogProfile({ ...product, hasN: true });
  expect(resolved.issues).toEqual([]);
  const technical = buildCableTechnicalProfile(resolved.profile);
  expect(technical.cores).toHaveLength(4);
  expect(technical.cores.at(-1)).toMatchObject({ color: 'blue', relativeDiameter: Math.sqrt(0.5) });
});


test('prepares grouped and reduced-core requests through the protected style path', () =>
  withCableStyleSandbox(async ({ root }) => {
    const grouped = readCableCatalogProfile({ ...ordinary, groupCores: 2, crossSection: 0.75,
      conductorConfiguration: '3×2×0,75' });
    const pairs = await prepareCableStyleRequest(root, grouped.profile);
    expect(pairs.prompt).toContain('exactly 3 separate bundles of 2 insulated cores each');
    expect(pairs.geometryRequirements.expectedMetalEndCount).toBe(6);

    const mixed = readCableCatalogProfile({ ...ordinary, crossSection: 2,
      groundCores: 1, groundSection: 1, hasN: true });
    const request = await prepareCableStyleRequest(root, mixed.profile);
    expect(request.geometryRequirements.mode).toBe('MIXED');
    expect(request.technicalProfile.cores.at(-1).relativeDiameter).toBe(Math.sqrt(0.5));
    expect(request.geometryRequirements.expectedMetalEndCount).toBe(4);
  }));

test('universal schematic preserves the exact known count and omits unsupported layers', () =>
  withCableStyleSandbox(async ({ root }) => {
    const product = { sku: 'UNKNOWN', markFamily: 'UNKNOWN', cores: 3 };
    const resolved = readCableCatalogProfile(product);
    expect(resolved.issues).toEqual([]);
    expect(resolved.profile.cores).toBe(3);
    expect(resolved.source.fields).toEqual({ cores: 3 });
    expect(cableSchematicSignature(resolved.profile)).toBeNull();
    const request = await prepareCableStyleRequest(root, resolved.profile);
    expect(request.technicalProfile.layers.map(layer => layer.role)).toEqual(['outer-jacket', 'individual-insulation']);
    expect(request.technicalProfile.unconfirmedRenderingAssumptions['Экранированный'].status).toBe('UNCONFIRMED');
    expect(request.prompt).toContain('SCHEMATIC ILLUSTRATION');
    expect(readCableCatalogProfile({ ...product, cores: null }).profile).toBeNull();
  }));

test('parses compound and parenthesized group counts without treating an auxiliary core as PE', () => {
  const mixed = readCableCatalogProfile({ ...ordinary, cores: null, conductorConfiguration: '3×120+1×70' });
  expect(mixed.profile.cores).toBe(4);
  expect(buildCableTechnicalProfile(mixed.profile).cores.at(-1).relativeDiameter).toBeCloseTo(Math.sqrt(70 / 120));
  expect(mixed.profile.coreColors.at(-1)).toBe('neutral grey');
  const paired = readCableCatalogProfile({ ...ordinary, cores: 5, groupCores: 2,
    crossSection: 0.75, conductorConfiguration: '5х(2х0,75)' });
  expect(buildCableTechnicalProfile(paired.profile)).toMatchObject({
    coreMetalEndCount: 10, groups: { count: 5, coresPerGroup: 2 },
  });
});

test('preserves the known presence of an FR barrier without rendering undocumented anatomy', () => {
  const fr = readCableCatalogProfile({ ...ordinary, attributes: ['нг(А)-FRHF'],
    specs: { ...ordinary.specs, 'Огнестойкий барьер': 'Да' } });
  const contract = buildCableTechnicalProfile(fr.profile);
  expect(contract.fireBarrierStatus).toBe('present-not-exposed');
  expect(contract.layers.map(layer => layer.role)).not.toContain('fire-barrier');
  expect(technicalProfilePrompt(contract)).toContain('do not expose or invent a barrier layer');
});

test('keeps an undocumented FR variant in technical review before preparing a generation request', () =>
  withCableStyleSandbox(async ({ root }) => {
    for (const barrier of [undefined, 'Да']) {
      const fr = readCableCatalogProfile({ ...ordinary, attributes: ['нг(А)-FRLS'],
        specs: { ...ordinary.specs, 'Огнестойкий барьер': barrier } });
      await expect(prepareCableStyleRequest(root, fr.profile)).rejects.toThrow(
        'для огнестойкого исполнения не подтверждены материал или расположение барьера');
    }
  }));

test('uses decoded pair count and keeps overall and individual screens separate', () => {
  const profile = readCableCatalogProfile({
    sku: 'LAN', name: 'S/FTP кат. 6 4PR', sourceName: 'S/FTP кат. 6 4PR',
    markFamily: 'S/FTP', catalogCategorySlug: 'kabeli-peredachi-dannykh',
    designationDecoded: { tokens: [{ code: '4PR', text: 'Количество витых пар: 4' }] },
  }).profile;
  const technical = buildCableTechnicalProfile(profile);
  expect(technical.coreMetalEndCount).toBe(8);
  expect(technical.groups).toEqual({ count: 4, coresPerGroup: 2 });
  expect(technical.layers.filter(layer => layer.function === 'electromagnetic-screening')
    .map(layer => layer.scope)).toEqual(['overall', 'each-pair']);
});
