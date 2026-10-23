import { describe, expect, it } from 'vitest';
import {
  getCatalogSearchCorrections,
  searchCatalogProducts,
} from './catalogSearch.js';
import { buildProductSuggestions } from '../lib/catalogQuery.js';

const product = (sku, title, extras = {}) => ({
  sku,
  title,
  fullName: title,
  mark: title.split(' ')[0],
  cores: 3,
  crossSection: 2.5,
  voltage: 0.66,
  stock: 10,
  catalogCategory: 'Силовой кабель',
  catalogCategorySlug: 'silovoy-kabel',
  ...extras,
});
const plain = product('YU-001', 'ВВГ 3х2.5', { mark: 'ВВГ' });
const ls = product('YU-002', 'ВВГнг(А)-LS 3х2.5', { mark: 'ВВГ' });
const frls = product('YU-003', 'ВВГнг(А)-FRLS 3х2.5', { mark: 'ВВГ' });
const large = product('YU-004', 'ВВГнг(А)-LS 3х25', {
  mark: 'ВВГ',
  crossSection: 25,
});
const aluminum = product('YU-005', 'АВВГ 3х2.5', { mark: 'АВВГ' });
const control = product('YU-006', 'КВВГ 3х2.5', { mark: 'КВВГ' });
const otherCores = product('YU-007', 'ВВГ 5х2.5', { mark: 'ВВГ', cores: 5 });
const white = product('YU-008', 'ПУГВ 1х6 белый', {
  mark: 'ПУГВ',
  cores: 1,
  crossSection: 6,
  voltage: null,
});
const blue = product('YU-009', 'ПУГВ 1х6 синий', {
  mark: 'ПУГВ',
  cores: 1,
  crossSection: 6,
  voltage: null,
});
const ground = product('YU-010', 'ПУГВ 1х6 Ж/З', {
  mark: 'ПУГВ',
  cores: 1,
  crossSection: 6,
  voltage: null,
});
const composite = product('YU-011', 'СИП-2 3х50+1х54.6', {
  mark: 'СИП-2',
  cores: 3,
  crossSection: 50,
  groundCores: 1,
  groundSection: 54.6,
  voltage: null,
});
const pairs = product('YU-012', 'КПСнг(А)-FRLS 1х2х0.5', {
  mark: 'КПС',
  cores: 1,
  groupCores: 2,
  crossSection: 0.5,
});
const single = product('YU-013', 'КПСнг(А)-FRLS 2х0.5', {
  mark: 'КПС',
  cores: 2,
  crossSection: 0.5,
});
const sip = product('YU-014', 'СИП-4 4х16', {
  mark: 'СИП-4',
  cores: 4,
  crossSection: 16,
});
const pv3 = product('YU-015', 'ПВ3 1х6', {
  mark: 'ПВ3',
  cores: 1,
  crossSection: 6,
});
const nym = product('YU-016', 'NYМ 3х2.5', { mark: 'NYМ' });
const skab = product('YU-017', 'СКАБ 660 3х2.5', { mark: 'СКАБ 660' });
const cat = product('YU-018', 'F/UTP cat.5e 4х2х0.5', {
  mark: 'F/UTP',
  cores: 4,
  groupCores: 2,
  crossSection: 0.5,
});
const unshielded = product('YU-019', 'U/UTP cat.5e 4х2х0.5', {
  mark: 'U/UTP',
  cores: 4,
  groupCores: 2,
  crossSection: 0.5,
});
const noGroup = product('YU-020', 'ВВГнг-LS 3х2.5', { mark: 'ВВГ' });
const noStock = product('YU-021', 'ВВГ 3х2.5', { mark: 'ВВГ', stock: 0 });
const catalog = [
  plain,
  ls,
  frls,
  large,
  aluminum,
  control,
  otherCores,
  white,
  blue,
  ground,
  composite,
  pairs,
  single,
  sip,
  pv3,
  nym,
  skab,
  cat,
  unshielded,
  noGroup,
  noStock,
];
const find = (q) => searchCatalogProducts(catalog, q);

describe('buyer intent and numeric safety', () => {
  it('accepts units after dimensions and spaced dimensions after a known mark', () => {
    expect(find('ВВГ 3х2.5 мм²')).toContain(plain);
    expect(find('ВВГ 3 2,5')).toContain(plain);
    expect(find('ВВГ 3 2,5')).not.toContain(otherCores);
  });
  it('keeps imported numeric designations findable by exact name', () => {
    const opaque = product('OPAQUE', 'AT-(ZN)HBH 2g62.5/125 STB900 2.5', {
      crossSection: null,
    });
    expect(searchCatalogProducts([opaque], opaque.title)).toEqual([opaque]);
    expect(searchCatalogProducts([opaque], '2.5 мм²')).toEqual([]);
  });
  it('does not interpret digits in H05V-K as voltage', () => {
    const cable = product('H05', 'H05V-K 1х1 корич', {
      mark: 'H05V-K',
      cores: 1,
      crossSection: 1,
      voltage: null,
    });
    expect(searchCatalogProducts([cable], 'H05V-K 1х1')).toEqual([cable]);
    expect(searchCatalogProducts([cable], 'H05V-K 5В')).toEqual([]);
  });
  it.each(['3х2,5', '3x2.5', '3 × 2,50', '3*2.5', '3 на 2.5'])(
    'matches the complete dimension: %s',
    (dimension) => {
      const result = find(`ВВГ ${dimension}`);
      expect(result).toContain(plain);
      expect(result).toContain(ls);
      expect(result).not.toContain(large);
      expect(result).not.toContain(otherCores);
      expect(result).not.toContain(aluminum);
      expect(result).not.toContain(control);
    }
  );
  it.each([
    'ВВГ 2,5',
    '2.5 ВВГ',
    'ВВГ2.5',
    'ВВГ сечение 2.5',
    'ВВГ сечением 2.5 мм²',
    'ВВГ 2.5 квадрата',
  ])('accepts section notation: %s', (q) => {
    const r = find(q);
    expect(r).toContain(plain);
    expect(r).toContain(otherCores);
    expect(r).not.toContain(large);
  });
  it.each(['ВВГ 3 жилы 2,5', 'трехжильный ВВГ 2.5', 'ВВГ жил: 3 2.5'])(
    'accepts explicit core count: %s',
    (q) => {
      expect(find(q)).toContain(plain);
      expect(find(q)).not.toContain(otherCores);
    }
  );
  it('keeps family boundaries and ranks an exact designation first', () => {
    expect(find('ВВГ')).not.toContain(aluminum);
    expect(find('ВВГ')).not.toContain(control);
    expect(find('ВВГ 3х2.5')[0]).toBe(plain);
  });
  it('keeps pair configurations and additional conductors exact', () => {
    expect(find('КПС 1x2x0,50')).toEqual([pairs]);
    expect(find('КПС 2x0.5')).toEqual([single]);
    expect(find('СИП 2 3х50+1х54,6')).toEqual([composite]);
    expect(find('СИП-2 3х50+1х54')).toEqual([]);
    expect(find('СИП-2 3х50')).toEqual([]);
    expect(find('СИП-2 4 жилы 50')).toEqual([composite]);
  });
  it('never changes digits to find a result', () => {
    for (const q of [
      'ВВГ 3х2',
      'ВВГ 3х250',
      'ВВГ 185',
      'ВВГ 2.5 25',
      'ВВГ 3х0',
      'ВВГ 0',
    ])
      expect(find(q)).toEqual([]);
  });
  it('does not interpret numbers in marks as sections', () => {
    expect(find('ПВ 3')).toEqual([pv3]);
    expect(find('СИП 4')).toEqual([sip]);
    expect(find('СКАБ 660')).toEqual([skab]);
    expect(find('СКАБ 660 2.5')).toEqual([skab]);
  });
  it('matches nominal voltage in either unit and rejects unknown voltage', () => {
    expect(find('ВВГ 660 В')).toContain(plain);
    expect(find('ВВГ 0.66 кВ')).toContain(plain);
    expect(find('ВВГ 1 кВ')).toEqual([]);
    expect(find('ПУГВ 660В')).toEqual([]);
  });
});

describe('text, modifiers, aliases, and exact articles', () => {
  it.each([
    'ввгнг(а)-ls 3х2,5',
    'LS ВВГ 3х2.5 нг(А)',
    'купить кабель ВВГ 3х2.5 нг(А) LS',
    'vvgng(a)-ls 3x2.5',
    'BBГнг(A)-LS 3x2.5',
    'ВВГнг(А)-ЛС 3х2.5',
  ])('matches word order and notation: %s', (q) => {
    expect(find(q)).toEqual([ls]);
  });
  it('does not replace fire performance requirements', () => {
    expect(find('ВВГ 3х2.5 FRLS')).toEqual([frls]);
    expect(find('ВВГ 3х2.5 LS')).not.toContain(frls);
    expect(find('ВВГ нг(А) 3х2.5')).not.toContain(noGroup);
  });
  it.each(['ПУГВ 6 бел', 'белого ПУГВ 6', 'ПУГВ6 белый'])(
    'understands color abbreviations: %s',
    (q) => expect(find(q)).toEqual([white])
  );
  it('normalizes yellow-green and preserves other colors', () => {
    expect(find('ПУГВ 6 желто-зеленый')).toEqual([ground]);
    expect(find('ПУГВ 6 ж/з')).toEqual([ground]);
    expect(find('ПУГВ 6 синий')).toEqual([blue]);
  });
  it('supports Latin marks and transliterated Russian marks', () => {
    expect(find('vvg 3х2.5')).toContain(plain);
    expect(find('NYM 3x2,5')).toEqual([nym]);
    expect(find('NYМ 3x2,5')).toEqual([nym]);
  });
  it('preserves explicit network shielding and category', () => {
    expect(find('F/UTP cat.5e')).toEqual([cat]);
    expect(find('U/UTP cat.5e')).toEqual([unshielded]);
    expect(find('F/UTP cat.6')).toEqual([]);
    expect(find('F/UTP кат5е 4 пары')).toEqual([cat]);
    expect(find('F/UTP cat5e 2 пары')).toEqual([]);
  });
  it('keeps AWG configurations separate from metric sections', () => {
    const cable = product('AWG', 'F/UTP 4х2хAWG24', {
      mark: 'F/UTP',
      cores: 4,
      crossSection: null,
    });
    expect(searchCatalogProducts([cable], 'F/UTP 4x2xAWG24')).toEqual([cable]);
    expect(searchCatalogProducts([cable], 'F/UTP 24 AWG')).toEqual([cable]);
    expect(searchCatalogProducts([cable], 'F/UTP AWG22')).toEqual([]);
    expect(searchCatalogProducts([cable], 'F/UTP 24 мм²')).toEqual([]);
  });
  it('matches material and stock only from catalog facts', () => {
    expect(find('медный ВВГ 3х2.5')).toContain(plain);
    expect(find('алюминиевый 3х2.5')).toEqual([aluminum]);
    expect(find('ВВГ в наличии')).not.toContain(noStock);
  });
  it.each([
    'YU-001',
    'yu001',
    'артикул YU-001',
    'арт. YU-001',
    'код: YU-001',
    'sku YU-001',
  ])('finds an exact SKU: %s', (q) => expect(find(q)).toEqual([plain]));
  it('supports a numeric exact SKU without confusing section-only searches', () => {
    const p = product('185', 'КГ 1х16', { crossSection: 16 });
    expect(searchCatalogProducts([p], '185')).toEqual([p]);
    expect(searchCatalogProducts([p], 'арт 185')).toEqual([p]);
    expect(searchCatalogProducts([p], '185 мм²')).toEqual([]);
    expect(find('арт 2.5')).toEqual([]);
  });
  it('rejects garbage and overly long requests', () => {
    for (const q of ['!!!', 'купить', 'unfindable', 'а'.repeat(257)])
      expect(find(q)).toEqual([]);
    expect(searchCatalogProducts(catalog, [])).toEqual([]);
    expect(find('')).toBe(catalog);
    expect(find('   ')).toBe(catalog);
  });
});

describe('explicit spelling recovery and suggestions', () => {
  it('offers a keyboard correction while preserving the dimension', () => {
    expect(find('ddu 3x2.5')).toEqual([]);
    expect(getCatalogSearchCorrections(catalog, 'ddu 3x2.5')).toContainEqual({
      query: 'ввг 3x2.5',
      count: find('ввг 3х2.5').length,
    });
  });
  it('offers one edit or transposition but never rewrites an existing mark or a size', () => {
    expect(getCatalogSearchCorrections(catalog, 'ПУГБ 6 белый')).toContainEqual(
      { query: 'пугв 6 белый', count: 1 }
    );
    expect(
      getCatalogSearchCorrections(catalog, 'ВВГнн 3х2.5').some((s) =>
        s.query.includes('ввгнг')
      )
    ).toBe(true);
    expect(getCatalogSearchCorrections(catalog, 'ВВГ 3х25.1')).toEqual([]);
    expect(getCatalogSearchCorrections(catalog, 'ВВГ 999')).toEqual([]);
  });
  it('suggestions use the same matches and preserve all query constraints', () => {
    const suggestions = buildProductSuggestions(catalog, 'ВВГ 3х2.5 LS', 7);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      mark: 'ВВГ',
      query: 'ВВГ 3х2.5 LS',
      filterMark: 'ВВГ',
      count: 2,
    });
    const selected = find(suggestions[0].query).filter(
      (p) => p.mark === suggestions[0].filterMark
    );
    expect(selected).toHaveLength(suggestions[0].count);
  });
  it('returns correction actions when no product matches', () => {
    expect(
      buildProductSuggestions(catalog, 'ПУГБ 6 белый', 7)[0]
    ).toMatchObject({ type: 'correction', query: 'пугв 6 белый', count: 1 });
  });
});
