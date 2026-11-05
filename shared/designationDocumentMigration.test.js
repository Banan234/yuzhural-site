import { describe, expect, it } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
import { checkDesignationConstruction } from './designationConstructionEvidence.js';
const r = (id) => registry.rules.find((r) => r.id === id);
const check = (id, s, p = {}) => checkConstructionTable(p, s, r(id));

describe('transferred manufacturer document scopes', () => {
  it('uses the explicitly declared TOFLEX screen substitution at the correct position', () => {
    const id = 'scope-family-0316-tomsk-constructor';
    expect(r(id).constructorDerivation).toMatchObject({
      baseMark: 'КУЭВВ',
      screenSlots: ['Эа'],
    });
    expect(check(id, 'КУЭаВВнг(А)-LS 2х2х0.75').reason).toBeUndefined();
    for (const s of [
      'КУЭмВВнг(А)-LS 2х2х0.75',
      'КУЭаВВнг(А)-LSLTx-ХЛ 2х2х0.75',
      'КУЭаВВнг(А)-LS 2х2х1.2',
      'КУЭаВВнг(А)-LS 17х2х0.75',
    ])
      expect(check(id, s).reason).toBeTruthy();
    const input = {
      product: {},
      designation: 'КУЭаВВнг(А)-LS 2х2х0.75',
      family: knowledge.families.find((f) => f.id === 'family-0316'),
    };
    expect(
      checkDesignationConstruction({ ...input, documents: knowledge.documents })
        .status
    ).toBe('confirmed');
    expect(
      checkDesignationConstruction({
        ...input,
        documents: knowledge.documents.filter((d) => d.id !== 'tomsk-toflex'),
      }).status
    ).toBe('unconfirmed');
  });
  it('requires the exact individual screen material and actual waterblock marker', () => {
    const id = 'scope-family-0998-uncom-mk-constructor';
    expect(
      check(id, 'ККЗ МК ЭВЭалВнг(А)LS 4х3х1 эал', {
        attributes: ['нг(А)-LS', 'эал'],
      }).reason
    ).toBeUndefined();
    for (const s of [
      'ККЗ МК ЭВЭалВнг(А)LS 4х3х1',
      'ККЗ МК ЭВЭалВнг(А)LS 4х3х1 эл',
      'ККЗ МК ЭВЭалВнг(А)FRLS 4х3х1 эал',
    ])
      expect(check(id, s).reason).toBeTruthy();
    const common = 'scope-family-0996-uncom-mk-constructor';
    expect(
      check(common, 'ККЗ МК ВЭалКВнг(А)LS-ХЛ(г) 12х2х1', {
        attributes: ['нг(А)-LS-ХЛ', '(г)'],
      }).reason
    ).toBeUndefined();
    expect(
      check(common, 'ККЗ МК ВЭалКВнг(А)LS-ХЛ 12х2х1', { attributes: ['(г)'] })
        .reason
    ).toBeTruthy();
  });
  it('preserves PE/X identity and does not interpret a lowercase multiplier as an X variant', () => {
    const id = 'scope-family-0815-lapp-verified-01';
    expect(
      check(id, 'OLFLEXclassic 100 3G0.5', { hasGroundCore: true }).reason
    ).toBeUndefined();
    expect(check(id, 'OLFLEXclassic 100 5G50').reason).toBeUndefined();
    for (const s of [
      'OLFLEXclassic 100 3х0.5',
      'OLFLEXclassic 100 3x0.5',
      'OLFLEXclassic 100 3G2.51',
      'OLFLEXclassic 100 4G1.5+2x0.5',
    ])
      expect(check(id, s).reason).toBeTruthy();
    expect(
      check(id, 'OLFLEXclassic 100 2X0.5', { hasGroundCore: true }).reason
    ).toBeTruthy();
    expect(r(id).evidence.pages).toContain(5);
  });
  it('keeps LAPP BD and PlusA model suffixes rather than extending the bare family', () => {
    expect(
      check('scope-family-0824-lapp-verified-14', 'JE-LIYCY BD 4х2х0.5').reason
    ).toBeUndefined();
    expect(
      check('scope-family-0824-lapp-verified-14', 'JE-LIYCY 4х2х0.5').reason
    ).toBeTruthy();
    expect(
      check(
        'scope-family-0822-lapp-verified-11',
        'UNITRONIC FD CP/TP Plus A 2х2х0.14'
      ).reason
    ).toBeUndefined();
    expect(
      check(
        'scope-family-0822-lapp-verified-11',
        'UNITRONIC FD CP/TP Plus 2х2х0.14'
      ).reason
    ).toBeTruthy();
  });
  it('keeps J-Y(ST)Y LG diameter dependent pair counts', () => {
    const id = 'scope-family-0825-lapp-verified-15';
    expect(check(id, 'J-Y(ST)Y LG 100х2х0.6').reason).toBeUndefined();
    expect(check(id, 'J-Y(ST)Y LG 100х2х0.8').reason).toBeTruthy();
  });
  it('checks the KUIN insulation/fire relationship and group size caps', () => {
    const id = 'scope-family-0087-kuban-В';
    expect(
      check(id, 'КУИН нг(А)FRLS 5х1 ВЭ', { attributes: ['нг(А)-FRLS', 'ВЭ'] })
        .reason
    ).toBeUndefined();
    expect(
      check(id, 'КУИН нг(А)FRLS 7х1 ВЭК ХЛ', {
        attributes: ['нг(А)-FRLS', 'ВЭК', 'ХЛ'],
      }).reason
    ).toBeUndefined();
    expect(check(id, 'КУИН нг(А)HF 5х1 ВЭ').reason).toBeTruthy();
    expect(check(id, 'КУИН нг(А)FRLS 15х4х1 ВЭ').reason).toBeTruthy();
    expect(check(id, 'КУИН нг(А)FRLS 5х2х4 ВЭ').reason).toBeTruthy();
    expect(
      check('scope-family-0087-kuban-П', 'КУИН нг(А)HF 5х2х1 ПЭК').reason
    ).toBeUndefined();
  });
  it('keeps GERDA factory identity and armoured dependent row limits', () => {
    expect(
      check('scope-family-0090-gerda', 'ГЕРДА КВК 44х2х0.75').reason
    ).toBeUndefined();
    expect(
      check('scope-family-0090-gerda', 'КВК 44х2х0.75').reason
    ).toBeTruthy();
    expect(
      check('scope-family-0799-gerda-kvev-marks', 'КВВЭБ 10х2х1').reason
    ).toBeUndefined();
    expect(
      check('scope-family-0799-gerda-kvev-marks', 'КВВЭБ 10х2х1.5').reason
    ).toBeTruthy();
    expect(
      check('scope-family-0799-gerda-kvev-marks', 'КВВЭБнг(А) 10х2х1').reason
    ).toBeTruthy();
  });
  it('preserves section-dependent MGSHV voltage and screened core counts', () => {
    const id = 'scope-family-0080-podolsk-9-МГШВЭ';
    expect(check(id, 'МГШВЭ 3х0.75 1 кВ').reason).toBeUndefined();
    expect(check(id, 'МГШВЭ 3х1 1 кВ').reason).toBeTruthy();
    expect(check(id, 'МГШВЭ 0.12 1 кВ').reason).toBeTruthy();
    expect(check(id, 'МГШВЭ 0.12 0.38 кВ').reason).toBeUndefined();
  });
  it('does not carry warm10mm²control scopes into coldorFRLSrows', () => {
    expect(
      check('scope-family-0139-podolsk-3-base', 'КВКБШв 4х10').reason
    ).toBeUndefined();
    expect(
      check('scope-family-0139-podolsk-3-cold', 'КВКБШв-ХЛ 4х10').reason
    ).toBeTruthy();
    expect(
      check(
        'scope-family-0139-podolsk-3-LS-cold-split',
        'КВКБШвнг(А)-LS 4х10 ХЛ'
      ).reason
    ).toBeTruthy();
    expect(
      check(
        'scope-family-0139-podolsk-3-LS-cold-split',
        'КВКБШвнг(А)-LS 4х6 ХЛ',
        { attributes: ['нг(А)-LS', 'ХЛ'] }
      ).reason
    ).toBeUndefined();
    expect(
      check('scope-family-0139-podolsk-3-FRLS', 'КВКБШвнг(А)-FRLS 37х2.5')
        .reason
    ).toBeTruthy();
    expect(
      check('scope-family-0139-podolsk-3-FRLS', 'КВКБШвнг(А)-FRLS 19х2.5')
        .reason
    ).toBeUndefined();
  });
  it('separates H05/H07 nominal series and ratingfromthe application/testvoltage', () => {
    expect(
      check('scope-family-0018-liyv', 'H07V-K 1х240 0.75 кВ').reason
    ).toBeUndefined();
    expect(check('scope-family-0018-liyv', 'H07V-K 1х0.5').reason).toBeTruthy();
    expect(
      check('scope-family-0018-liyv', 'H07V-K 1х1.5 1 кВ').reason
    ).toBeTruthy();
    expect(
      check('scope-family-0151-liyv', 'H05V-K 1х0.5 0.5 кВ').reason
    ).toBeUndefined();
    expect(check('scope-family-0151-liyv', 'H05V-K 1х1.5').reason).toBeTruthy();
  });
  it('uses KГТПnamedrows without swallowing a composite PEprefix', () => {
    expect(
      check('scope-family-0541-zvetlit-kgtp', 'КГтп 3х1.5 0.66 кВ').reason
    ).toBeUndefined();
    expect(
      check('scope-family-0541-zvetlit-kgtp', 'КГтп 3х0.75 0.66 кВ').reason
    ).toBeTruthy();
    expect(
      check('scope-family-0541-zvetlit-kgtp', 'КГтп 3х1.5+1х1').reason
    ).toBeTruthy();
  });
  it('keeps the HELU protective variants and documented nominal voltage separate', () => {
    const jz = 'scope-family-0587-helu-short';
    expect(check(jz, 'JZ-600 3х0.5 1 кВ').reason).toBeUndefined();
    expect(check(jz, 'JZ-600 3х0.5 0.75 кВ').reason).toBeTruthy();
    expect(check(jz, 'JZ-600 2х0.5').reason).toBeTruthy();
    const cy = 'scope-family-0653-helu-fcy';
    expect(check(cy, 'F-CY-OZ 2х0.5').reason).toBeUndefined();
    expect(check(cy, 'F-CY-OZ 1х0.5').reason).toBeTruthy();
    expect(check(cy, 'F-DY-OZ 1х0.5').reason).toBeTruthy();
  });
  it('does not extend the reinforced THERMFLEX or Bd proof to their generic names', () => {
    const therm = 'scope-family-0658-helu-short';
    expect(check(therm, 'THERMFLEX 180 EWKF 3G0.75').reason).toBeUndefined();
    for (const name of [
      'H05SS-F 3G0.75',
      'THERMFLEX 180 EWKF 3x0.75',
      'THERMFLEX 180 EWKF 3G2.51',
    ])
      expect(check(therm, name).reason).toBeTruthy();
    const bd = 'scope-family-0900-helu-jh-red';
    expect(check(bd, 'J-H(ST)H Bd 2х2х0.8').reason).toBeUndefined();
    expect(check(bd, 'J-H(ST)H 2х2х0.8').reason).toBeTruthy();
    expect(check(bd, 'J-H(ST)H Bd 2х2х0.6').reason).toBeTruthy();
  });
  it('does not turn signal peak voltage into an AC nominal voltage', () => {
    const id = 'scope-family-0162-tkd-elitronic';
    expect(check(id, 'ELITRONIC-CY LIYCY 12х0.5').reason).toBeUndefined();
    expect(check(id, 'ELITRONIC-CY LIYCY 12х0.5 0.5 кВ').reason).toBeTruthy();
    expect(check(id, 'ELITRONIC-CY LIYCY 12х0.51').reason).toBeTruthy();
  });
});
