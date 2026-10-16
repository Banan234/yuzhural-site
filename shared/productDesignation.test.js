import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';

describe('product designation sourced decoding', () => {
  it('matches scoped aliases and keeps section separate from diameter', () => {
    const section = buildProductDesignation({
      mark: '20',
      brand: 'ЛОУТОКС',
      sourceName: 'ЛОУТОКС 20нг(А)-FRLSLTx 1х2х0,5',
    });
    const diameter = buildProductDesignation({
      mark: '30',
      brand: 'ЛОУТОКС',
      sourceName: 'ЛОУТОКС 30нг(А)-FRLSLTx 1х2х0,52',
    });
    expect(section.family).toBe('ЛОУТОКС 20');
    expect(
      section.tokens.some((t) => t.text.includes('сечение каждой жилы 0,5 мм²'))
    ).toBe(true);
    expect(
      diameter.tokens.some((t) => t.text.includes('диаметр жилы 0,52 мм'))
    ).toBe(true);
    expect(
      buildProductDesignation({ mark: '20', sourceName: '20 1х2х0,5' }).family
    ).toBeNull();
    expect(
      buildProductDesignation({
        mark: 'КВПЭф-5е',
        sourceName: 'КВПЭф-5е 4х2х0,52',
      }).family
    ).toBe('КВПЭф-5e');
  });
  it('limits voltage suffixes to documented paper-insulated families', () => {
    const result = buildProductDesignation({
      mark: 'ААШв- 10',
      sourceName: 'ААШв- 10 3х95',
    });
    expect(result.family).toBe('ААШв');
    expect(result.tokens.some((t) => t.code === '10 кВ')).toBe(true);
    for (const mark of ['ААШв-99', 'ААШв10', 'КГ-10'])
      expect(
        buildProductDesignation({ mark, sourceName: `${mark} 3х95` }).family
      ).toBeNull();
  });
  it('uses the documented montage screen and armor positions without guessing longer marks', () => {
    const result = buildProductDesignation({
      mark: 'КУВЭаКВ',
      sourceName: 'КУВЭаКВнг(А)-LS 4х2х0,75',
    });
    expect(result.family).toBe('КУВЭаКВ');
    expect(
      result.tokens.some(
        (t) => t.text === 'Общий экран из алюмополимерной ленты'
      )
    ).toBe(true);
    expect(
      result.tokens.some((t) =>
        t.text.includes('стальных оцинкованных проволок')
      )
    ).toBe(true);
    expect(
      buildProductDesignation({
        mark: 'КУВЭаКВXYZ',
        sourceName: 'КУВЭаКВXYZ 3х1',
      }).family
    ).toBeNull();
    expect(
      buildProductDesignation({
        mark: 'КУВЭаКВ',
        attributes: ['нг(А)-FRHF'],
        sourceName: 'КУВЭаКВнг(А)-FRHF 3х1',
      }).family
    ).toBeNull();
  });
  it('preserves the distinction between concentric conductors and cable screens', () => {
    const result = buildProductDesignation({
      mark: 'NYCY-O',
      sourceName: 'NYCY-O 4х1,5/1,5',
      concentricConductorCrossSection: 1.5,
    });
    expect(result.family).toBe('NYCY');
    expect(
      result.tokens.some((t) =>
        t.text.includes('Сечение концентрического проводника 1,5 мм²')
      )
    ).toBe(true);
    expect(
      result.tokens.some((t) =>
        t.text.includes('Сечение металлического экрана')
      )
    ).toBe(false);
    expect(
      result.tokens.some((t) => t.text.includes('Без защитной жилы'))
    ).toBe(true);
  });
  it('does not claim PVC construction for an HF execution and uses the checked ship sheath', () => {
    const result = buildProductDesignation({
      mark: 'МКЭШВ',
      sourceName: 'МКЭШВ 3х2,5 нг(А)HF',
    });
    expect(result.warnings).toEqual([]);
    expect(result.description).toContain('без галогенов');
    expect(result.tokens.find((t) => t.code === 'Шв').text).toContain(
      'без галогенов'
    );
    const ship = buildProductDesignation({
      mark: 'КНРк',
      sourceName: 'КНРк 1х25',
    });
    expect(ship.description).toContain('ПВХ');
    expect(ship.description).not.toContain('кремнийорганической');
  });
  it('uses family meanings instead of the importer universal letter dictionary', () => {
    const result = buildProductDesignation({
      mark: 'МКЭШВ',
      sourceName: 'МКЭШВ 10х2х0,75 нг(А)LS',
      attributes: ['нг(А)-LS'],
      cableDecoded: { decoded: ['маслостойкий', 'контрольный'] },
    });
    expect(result.tokens.some((t) => t.text === 'Монтажный кабель')).toBe(true);
    expect(result.tokens.map((t) => t.text).join(' ')).not.toContain(
      'маслостойкий'
    );
    expect(
      result.tokens.some((t) => t.text.includes('10 групп по 2 жилы'))
    ).toBe(true);
    expect(
      result.sources.some((s) =>
        s.url.includes('1_KHKA_obshchiy_katalog.pdf#page=294')
      )
    ).toBe(true);
    expect(result.tokens.filter((t) => t.code === 'нг(А)-LS')).toHaveLength(1);
  });
  it('does not mistake an unknown longer mark for a known prefix', () => {
    for (const mark of ['КГXYZ', 'ВВГXYZ', 'МКЭШВнеизвестное', 'АВБШВв']) {
      const result = buildProductDesignation({
        mark,
        sourceName: `${mark} 3х2,5`,
      });
      expect(result.family).toBeNull();
      expect(result.unknown).toContain(mark);
      expect(result.tokens.some((t) => t.text.includes('мм²'))).toBe(false);
    }
  });
  it('distinguishes telephone diameter, insulation thickness, screen and additional cores', () => {
    const phone = buildProductDesignation({
      mark: 'ТППэпЗ',
      sourceName: 'ТППэпЗ 10х2х0,5',
    });
    expect(
      phone.tokens.some((t) => t.text.includes('диаметр жилы 0,5 мм'))
    ).toBe(true);
    expect(phone.tokens.some((t) => t.text.includes('мм²'))).toBe(false);
    const power = buildProductDesignation({
      mark: 'АПвПу2Г',
      sourceName: 'АПвПу2Г 1х95/16-10',
      screenCrossSection: 16,
      voltage: 10,
    });
    expect(
      power.tokens.some((t) =>
        t.text.includes('Сечение металлического экрана 16 мм²')
      )
    ).toBe(true);
    expect(
      power.tokens.some((t) => t.text.includes('Продольная и поперечная'))
    ).toBe(true);
    const unequal = buildProductDesignation({
      mark: 'АВВГ',
      sourceName: 'АВВГ 3х95+1х50',
    });
    expect(
      unequal.tokens.some((t) =>
        t.text.includes('Дополнительные жилы: 1 × 50 мм²')
      )
    ).toBe(true);
    expect(unequal.tokens.map((t) => t.text).join(' ')).not.toContain(
      'заземления'
    );
  });
  it('keeps AWG and malformed sizes out of metric cross-section statements', () => {
    const awg = buildProductDesignation({
      mark: 'H07V-K',
      sourceName: 'H07V-K 2х24AWG',
      cores: 2,
      crossSection: 24,
    });
    expect(awg.tokens.some((t) => t.text.includes('24 AWG'))).toBe(true);
    expect(awg.tokens.some((t) => t.text.includes('сечение каждой'))).toBe(
      false
    );
    const malformed = buildProductDesignation({
      mark: 'ВВГ',
      sourceName: 'ВВГ 3х(2х1',
      cores: 3,
      crossSection: 1,
    });
    expect(malformed.warnings).not.toEqual([]);
    expect(
      malformed.tokens.some((t) => t.text.includes('сечение каждой'))
    ).toBe(false);
  });
  it('requires the GERDA context for its KV/KVK abbreviations', () => {
    expect(
      buildProductDesignation({ mark: 'КВК', sourceName: 'КВК 2х0,75' }).family
    ).toBeNull();
    expect(
      buildProductDesignation({ mark: 'КВК', sourceName: 'Герда КВК 2х2х0,75' })
        .family
    ).toBe('КВК');
  });
  it('decodes LAN shields without treating category and AWG as conductor section', () => {
    const result = buildProductDesignation({
      mark: 'F/UTP cat 5e',
      sourceName: 'F/UTP cat 5e 4pr 24AWG',
    });
    expect(result.family).toBe('F/UTP');
    expect(
      result.tokens.some((t) => t.text.includes('Общий экран из фольги'))
    ).toBe(true);
    expect(
      result.tokens.some((t) => t.text.includes('Категория кабеля 5E'))
    ).toBe(true);
    expect(result.tokens.some((t) => t.text.includes('сечение каждой'))).toBe(
      false
    );
    expect(result.unknown).toContain('F/UTP cat 5e');
  });
  it('does not equate LS with fire resistance and preserves unconfirmed indexes', () => {
    const result = buildProductDesignation({
      mark: 'ВВГ',
      sourceName: 'ВВГ 3х2,5 нг(А)LS UNKNOWN',
      attributes: ['нг(А)-LS', 'UNKNOWN'],
    });
    expect(result.tokens.find((t) => t.code === 'нг(А)-LS').text).not.toContain(
      'огнестойкое'
    );
    expect(result.unknown).toContain('UNKNOWN');
    expect(result.searchUrl).toContain(encodeURIComponent(result.designation));
  });
});
