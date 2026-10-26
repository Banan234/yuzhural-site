import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';

const decode = (mark, sourceName, attributes = []) =>
  buildProductDesignation({ mark, sourceName, attributes });

describe('manufacturer model and execution boundaries', () => {
  it('keeps screened signal cable diameter rows within the actual factory table', () => {
    const d = decode('СБЗПу', 'СБЗПуЭ 24х2х0.9', ['Э']);
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('диаметр жилы 0,9 мм'))).toBe(
      true
    );
    expect(decode('СБЗПу', 'СБЗПуЭ 33х0.9', ['Э']).officialComplete).toBe(true);
    expect(decode('СБЗПу', 'СБЗПуЭ 24х2х0.8', ['Э']).officialComplete).toBe(
      false
    );
    expect(decode('СБЗПу', 'СБЗПуЭ 5х2х0.9', ['Э']).officialComplete).toBe(
      false
    );
    expect(decode('ПУНП', 'ПУНП 3х2.5 бел', ['бел']).officialComplete).toBe(
      true
    );
    expect(decode('ПУНП', 'ПУНП 4х2.5').officialComplete).toBe(false);
  });
  it('preserves exact fluoropolymer RG and tinned-copper control constructions', () => {
    const rg = decode('RG-316D', 'RG-316D');
    expect(rg.officialComplete).toBe(true);
    expect(rg.tokens.some((t) => t.text.includes('Посеребрённая медь'))).toBe(
      true
    );
    const steel = decode('RG-316D-2', 'RG-316D-2');
    expect(steel.officialComplete).toBe(true);
    expect(steel.tokens.some((t) => t.text.includes('омеднённая сталь'))).toBe(
      true
    );
    expect(decode('RG-316D', 'RG-316D 2х1').officialComplete).toBe(false);
    expect(
      decode('Cable LI6YC6Y-J', 'Cable LI6YC6Y-J 7x0.75').officialComplete
    ).toBe(true);
    expect(
      decode('Cable LI6YC6Y-J', 'Cable LI6YC6Y-J 6x0.75').officialComplete
    ).toBe(false);
    expect(decode('AGL LI6YC6Y', 'AGL LI6YC6Y 4x0.75').officialComplete).toBe(
      false
    );
    expect(decode('RG-213U', 'RG-213U').officialComplete).toBe(true);
    expect(decode('RG-213U', 'RG-213U PUR').officialComplete).toBe(false);
  });
  it('checks optical fiber type, module arithmetic and factory load without copper units', () => {
    const d = decode('ДПЛ', 'ДПЛнг(А)HF-08У 2х4 -2,7кН', [
      'нг(А)-HF',
      '08У',
      '2,7кН',
    ]);
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('G.657.A1'))).toBe(true);
    expect(
      d.tokens.some((t) => t.text.includes('растягивающая нагрузка 2,7 кН'))
    ).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('мм²'))).toBe(false);
    for (const name of [
      'ДПЛнг(А)HF-08У 3х4 -2,7кН',
      'ДПЛнг(А)HF-08А 2х4 -2,7кН',
      'ДПЛнг(А)HF-08У 2х4 -7кН',
      'ДПЛнг(А)HF-192У 8х24 -2,7кН',
      'ДПЛнг(А)HF-08У 2х4 -2,7кН XYZ',
    ])
      expect(decode('ДПЛ', name).officialComplete).toBe(false);
    expect(decode('ТОЛ-П', 'ТОЛ-П-04М-2,7кН').officialComplete).toBe(true);
    expect(decode('ТОЛ-П', 'ТОЛ-П-48М-2,7кН').officialComplete).toBe(false);
    expect(
      decode('ДПЛ', 'ДПЛ-П 16М 2х8 -2.7кН').tokens.some((t) =>
        t.text.includes('50/125')
      )
    ).toBe(true);
  });
  it('distinguishes Nestor signal pairs from the common screen drain conductor', () => {
    const d = decode('NESMAK-HF', 'NESMAK-HF 12x2x0.5+0.5');
    expect(d.officialComplete).toBe(true);
    expect(
      d.tokens.some((t) => t.text.includes('контактный проводник экрана'))
    ).toBe(true);
    for (const size of [
      '3x2x0.5+0.5',
      '12x2x0.75+0.5',
      '12x2x0.5+1',
      '12x2x0.5',
    ])
      expect(decode('NESMAK-HF', `NESMAK-HF ${size}`).officialComplete).toBe(
        false
      );
  });

  it('applies the documented section-dependent count limits to new control cable rows', () => {
    expect(
      decode('Kabeltec FLEX-H', 'Kabeltec FLEX-H 3x0.75').officialComplete
    ).toBe(true);
    expect(
      decode('Kabeltec FLEX-H', 'Kabeltec FLEX-H 13x0.75').officialComplete
    ).toBe(false);
    expect(decode('OPVC-JZ', 'OPVC-JZ 3х2.5').officialComplete).toBe(true);
    expect(decode('OPVC-JZ', 'OPVC-JZ 12х1.5').officialComplete).toBe(true);
    expect(decode('OPVC-JZ', 'OPVC-JZ 36х2.5').officialComplete).toBe(false);
    expect(decode('СКЛОН Р6', 'СКЛОН Р6 24х0,35').officialComplete).toBe(true);
    expect(decode('СКЛОН Р6', 'СКЛОН Р6 24х6').officialComplete).toBe(false);
    expect(decode('НУД', 'НУД 3х1.5').officialComplete).toBe(false);
  });
  it('keeps the RG letter variant, impedance and dielectric diameter tied to the exact factory row', () => {
    const rg = decode('RG- 62 au', 'RG- 62 au');
    expect(rg.officialComplete).toBe(true);
    expect(rg.tokens.some((t) => t.text.includes('93 Ом'))).toBe(true);
    expect(rg.tokens.some((t) => t.text.includes('3,7 мм'))).toBe(true);
    expect(decode('RG- 58 C/U', 'RG- 58 C/U').officialComplete).toBe(true);
    expect(decode('RG- 58 A/U', 'RG- 58 A/U').officialComplete).toBe(false);
    expect(decode('RG- 6u', 'RG- 6u').officialComplete).toBe(false);
    expect(decode('RG- 6a/u', 'RG- 6a/u 2х1').officialComplete).toBe(false);
    expect(decode('TASKER RG 223', 'TASKER RG 223').officialComplete).toBe(
      true
    );
    expect(decode('TASKER RG 223', 'TASKER RG 223 PUR').officialComplete).toBe(
      false
    );
  });

  it('accepts documented KUNRS sizes and rejects an extra pair grouping', () => {
    const fire = ['нг(А)-FRHF'];
    expect(
      decode('КунРс П', 'КунРс Пнг(А)FRHF 3х10', fire).officialComplete
    ).toBe(true);
    expect(
      decode('КунРс П', 'КунРс Пнг(А)FRHF 1х6', fire).officialComplete
    ).toBe(false);
    expect(
      decode('КунРс П', 'КунРс Пнг(А)FRHF 41х6', fire).officialComplete
    ).toBe(false);
    expect(
      decode('КунРс П', 'КунРс Пнг(А)FRHF 3х2х6', fire).officialComplete
    ).toBe(false);
    expect(decode('КУПР-250', 'КУПР-250 19х0.35').officialComplete).toBe(true);
    expect(decode('КУПР-250', 'КУПР-250 14эх1.5').officialComplete).toBe(true);
    expect(decode('КУПР-250', 'КУПР-250 14эх2.5').officialComplete).toBe(false);
  });

  it('recovers the exact OneKeyElectro fire suffix across the original price spacing', () => {
    expect(
      decode('ONEKEYELECTRO-КС-ТТ', 'ONEKEYELECTRO-КС-ТТнг (А) 3х16', ['нг(А)'])
        .officialComplete
    ).toBe(true);
    expect(
      decode('ONEKEYELECTRO-КС-ТТ', 'ONEKEYELECTRO-КС-ТТнг (А) 3х16 XYZ', [
        'нг(А)',
        'XYZ',
      ]).officialComplete
    ).toBe(false);
    expect(
      decode('HELUKABEL OZ-500 CPR', 'HELUKABEL OZ-500 CPR 2х1.5')
        .officialComplete
    ).toBe(true);
    expect(
      decode('HELUKABEL OZ-500 HMH-C', 'HELUKABEL OZ-500 HMH-C 2х1.5')
        .officialComplete
    ).toBe(false);
  });

  it('uses the KKZ factory constructor and requires the material code of individual screens', () => {
    const source = 'ККЗ МК ВЭалКВнг(А)LS-хл(г) 12х2х1';
    const decoded = decode('МК ВЭалКВ', source, ['нг(А)-LS-ХЛ', '(г)']);
    expect(decoded.officialComplete).toBe(true);
    expect(decoded.evidence.documentId).toBe('uncom-mk-constructor');
    expect(decoded.tokens.find((t) => t.code === 'Общий экран').text).toContain(
      'Алюмофлекс'
    );
    expect(decoded.tokens.find((t) => t.code === 'Броня').text).toContain(
      'оцинкованных'
    );
    expect(
      decode('МК ВЭалКВ', source.replace('ККЗ', 'Другой завод'), [
        'нг(А)-LS-ХЛ',
        '(г)',
      ]).officialComplete
    ).toBe(false);
    expect(
      decode('МК ВЭалКВ', source.replace('12х2х1', '62х2х1'), [
        'нг(А)-LS-ХЛ',
        '(г)',
      ]).officialComplete
    ).toBe(false);
    expect(
      decode('МК ВЭалКВ', source.replace('LS-хл', 'HF'), ['нг(А)-HF', '(г)'])
        .officialComplete
    ).toBe(false);
    expect(
      decode('МК ЭВЭалВ', 'ККЗ МК ЭВЭалВнг(А)LS 4х3х1 эал', ['нг(А)-LS', 'эал'])
        .officialComplete
    ).toBe(true);
    expect(
      decode('МК ЭВЭалВ', 'ККЗ МК ЭВЭалВнг(А)LS 4х3х1', ['нг(А)-LS'])
        .officialComplete
    ).toBe(false);
    expect(
      decode('МК ЭПвЭалВ', 'ККЗ МК ЭПвЭалВнг(А)LS 2х(2х1)зэл', [
        'нг(А)-LS',
        'ЗЭЛ',
      ]).officialComplete
    ).toBe(false);
  });

  it('keeps the documented TСP diameter and pair counts separate from area', () => {
    const decoded = decode('ТЦПВ', 'ТЦПВ 2х2х0.52');
    expect(decoded.officialComplete).toBe(true);
    expect(
      decoded.tokens.some((t) => t.text.includes('диаметр жилы 0,52 мм'))
    ).toBe(true);
    expect(decode('ТЦПП', 'ТЦПП 2х2х0.52').officialComplete).toBe(true);
    expect(decode('ТЦПВ', 'ТЦПВ 1х2х0.52').officialComplete).toBe(false);
    expect(decode('ТЦПВ', 'ТЦПВ 2х2х0.9').officialComplete).toBe(false);
    expect(
      decode('ТЦПВ', 'ТЦПВ 2х2х0.52 нг(А)HF', ['нг(А)-HF']).officialComplete
    ).toBe(false);
  });

  it('uses Belden fixed model dimensions without treating AWG as mm²', () => {
    const d = decode('9842 2pr24', 'Belden 9842 2pr24');
    expect(d.officialComplete).toBe(true);
    expect(
      d.tokens.some((t) => t.text.includes('Количество витых пар: 2'))
    ).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('24 AWG'))).toBe(true);
    expect(d.evidence.documentId).toBe('belden-9842');
    expect(decode('9842', 'Otherbrand 9842').officialComplete).toBe(false);
    expect(decode('9842', 'Belden 9842 3х2х0.5').officialComplete).toBe(false);
    expect(decode('9842', 'Belden 9842 AWG22').officialComplete).toBe(false);
    expect(decode('9842 4pr24', 'Belden 9842 4pr24').officialComplete).toBe(
      false
    );
  });

  it('keeps documented pair-count limits and fire executions for SPKB constructions', () => {
    const fire = ['нг(А)-FRHF'];
    expect(
      decode('КПКЭП', 'КПКЭП 37х2х1 нг(А)FRHF', fire).officialComplete
    ).toBe(true);
    expect(
      decode('КПКЭП', 'КПКЭП 38х2х1 нг(А)FRHF', fire).officialComplete
    ).toBe(false);
    expect(
      decode('КПКЭП', 'КПКЭП 3х2х1 нг(А)LS', ['нг(А)-LS']).officialComplete
    ).toBe(false);
    expect(
      decode('КПКЭП', 'КПКЭП 3х2х10 нг(А)FRHF', fire).officialComplete
    ).toBe(false);
  });

  it('distinguishes HF telephone insulation from the NDG sheath execution', () => {
    const hf = decode('ТПП', 'ТПП 10х2х0.5 нг(А)HF', ['нг(А)-HF']);
    const ndg = decode('ТППэп', 'ТППэп 10х2х0.5 (А)ндг', ['(А)ндг']);
    expect(hf.officialComplete).toBe(true);
    expect(ndg.officialComplete).toBe(true);
    expect(hf.tokens.find((t) => t.code === 'Изоляция').text).toContain(
      'не содержащая галогенов'
    );
    expect(ndg.tokens.find((t) => t.code === 'Изоляция').text).toBe(
      'Полиэтилен'
    );
    expect(
      decode('ТПП', 'ТПП 10х2х0.8 нг(А)HF', ['нг(А)-HF']).officialComplete
    ).toBe(false);
  });

  it('limits the manufacturer BD model to the documented pair counts', () => {
    expect(
      decode('JE-Y(ST)Y', 'JE-Y(ST)Y 12х2х0.8 Bd ROHS', ['Bd', 'ROHS'])
        .officialComplete
    ).toBe(true);
    expect(
      decode('JE-Y(ST)Y', 'JE-Y(ST)Y 32х2х0.8 Bd', ['Bd']).officialComplete
    ).toBe(false);
  });

  it('keeps archived category C coax construction separate from category A', () => {
    const d = decode('РК 75-7-320ф-С', 'РК75-7-320ф-Снг(С)HF', ['нг(С)-HF']);
    expect(d.officialComplete).toBe(true);
    expect(d.evidence.documentId).toBe('spec-main-2019-copy');
    expect(
      d.tokens.find((t) => t.code === 'Внутренний проводник').text
    ).toContain('1,58');
    expect(
      decode('РК 75-7-320ф-С', 'РК75-7-320ф-Снг(А)HF', ['нг(А)-HF'])
        .officialComplete
    ).toBe(false);
  });

  it('requires the factory diameter and fire execution for KIPE constructions', () => {
    expect(
      decode('КИП', 'КИПэ 2х2х0.6 нг(А)HF', ['Э', 'нг(А)-HF']).officialComplete
    ).toBe(true);
    expect(
      decode('КИП', 'КИПэ 2х2х0.5 нг(А)HF', ['Э', 'нг(А)-HF']).officialComplete
    ).toBe(false);
    expect(
      decode('КИП', 'КИПэ 2х2х0.6 нг(А)LS', ['Э', 'нг(А)-LS']).officialComplete
    ).toBe(false);
  });

  it('uses the fixed factory section for SEC pair-count notation', () => {
    const d = decode('СЭК', 'СЭК 5х2');
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('0,35 мм²'))).toBe(true);
    expect(decode('СЭК', 'СЭК 6х2').officialComplete).toBe(false);
    expect(decode('СЭК', 'СЭК 5х2х0.5').officialComplete).toBe(false);
    expect(decode('СЭК', 'СЭКнг(А)LS 5х2', ['нг(А)-LS']).officialComplete).toBe(
      false
    );
  });

  it('decodes only exact documented heating models and keeps watts separate from mm²', () => {
    const d = decode(
      'Греющий кабель 33HTP2-BP саморег.',
      'Греющий кабель 33HTP2-BP саморег.'
    );
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('33 Вт/м при 10 °C'))).toBe(
      true
    );
    expect(decode('33HTP2-BP', '33HTP2-BP 3х1.5').officialComplete).toBe(false);
    expect(decode('33HTP2-BP', '33HTP2-BP 115V').officialComplete).toBe(false);
    expect(
      decode('34HTP2-BP', 'Греющий кабель 34HTP2-BP').officialComplete
    ).toBe(false);
    expect(
      decode('33HTP2-BP', '33HTP2-BP нг(А)HF', ['нг(А)-HF']).officialComplete
    ).toBe(false);
  });

  it('keeps resistance codes separate from watts and rejects an undocumented SNF code', () => {
    const d = decode('Греющий кабель СНФ 07R1', 'Греющий СНФ 07R1');
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('7,13 Ом/км при 20 °C'))).toBe(
      true
    );
    expect(d.tokens.some((t) => t.code === 'Мощность')).toBe(false);
    expect(
      decode('Греющий кабель СНФ 22R7', 'Греющий СНФ 22R7').officialComplete
    ).toBe(false);
    expect(decode('СНФ 07R1', 'СНФ 07R1 230V').officialComplete).toBe(false);
  });

  it('accepts the documented UNITRONIC AWG configuration only in its exact source form', () => {
    expect(
      decode('UNITRONIC 300', 'UNITRONIC 300 2x18AWG').officialComplete
    ).toBe(true);
    expect(decode('UNITRONIC 300', 'UNITRONIC 300').officialComplete).toBe(
      false
    );
    expect(
      decode('UNITRONIC 300', 'UNITRONIC 300 4x18AWG').officialComplete
    ).toBe(false);
    expect(decode('UNITRONIC 300', 'UNITRONIC 300 2x18').officialComplete).toBe(
      false
    );
    expect(
      decode('UNITRONIC 300', 'UNITRONIC 300 S 2x18AWG').officialComplete
    ).toBe(false);
    expect(
      decode('UNITRONIC BUS CAN', 'UNITRONIC BUS CAN 2х2х0.34').officialComplete
    ).toBe(true);
    expect(
      decode('UNITRONIC BUS CAN', 'UNITRONIC BUS CAN 3х2х0.34').officialComplete
    ).toBe(false);
  });

  it('keeps KPM constructor materials, water blocking and element limits tied to the factory grammar', () => {
    const mark = 'КПМВЭфИЭФКВГм-В';
    const d = decode(mark, mark + ' нг(А)LS 4х2х1', ['нг(А)-LS']);
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.find((t) => t.code === 'Жилы').text).toContain('нелужёные');
    expect(d.tokens.some((t) => t.text.includes('Водоблокирующие'))).toBe(true);
    expect(
      decode(mark, mark + ' нг(А)LS 66х2х1', ['нг(А)-LS']).officialComplete
    ).toBe(false);
    expect(
      decode(mark, mark + ' нг(А)HF 4х2х1', ['нг(А)-HF']).officialComplete
    ).toBe(false);
    expect(
      decode('КПМСЭфКПГм-В', 'КПМСЭфКПГм-В нг(А)FRLS 3х1.5', ['нг(А)-FRLS'])
        .officialComplete
    ).toBe(false);
    expect(
      decode('КШС', 'КШС 3х2х0.52 нг(А)FRHF', ['нг(А)-FRHF']).officialComplete
    ).toBe(true);
    expect(
      decode('КШС', 'КШС 4х2х0.52 нг(А)FRHF', ['нг(А)-FRHF']).officialComplete
    ).toBe(false);
  });
});
