import { describe, expect, it } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
import { buildProductDesignation } from './productDesignation.js';
const check = (id, name, product = {}) =>
  checkConstructionTable(
    product,
    name,
    registry.rules.find((r) => r.id === id)
  );
const yes = (id, name, product) =>
  expect(check(id, name, product).reason).toBeUndefined();
const no = (id, name, product) =>
  expect(check(id, name, product).reason).toBeTruthy();

describe('manufacturer signal and ship cable document matrices', () => {
  it('uses the KSB diameter-dependent dashes for the exact armour and execution', () => {
    const base = 'scope-family-0240-spec-automation-base';
    yes(base, 'КСБ 32х2х1.78 нг(А)-FRLS');
    no(base, 'КСБ 40х2х1.78 нг(А)-FRLS');
    no(base, 'КСБ 1х2х1 нг(А)-FRLS');
    yes('scope-family-0240-spec-automation-LTx', 'КСБ 40х2х1.78 нг(А)-FRLSLTx');
    const barrier = 'scope-family-0243-spec-automation-base';
    yes(barrier, 'КСБС 32х2х0.98 нг(А)-FRHF');
    no(barrier, 'КСБС 40х2х0.98 нг(А)-FRHF');
    no(barrier, 'КСБС 32х2х1.38 нг(А)-FRHF');
    yes('scope-family-0241-spec-automation-base', 'КСБКГ 40х2х0.98 нг(А)-FRLS');
    no('scope-family-0241-spec-automation-base', 'КСБКГ 40х2х1.13 нг(А)-FRLS');
    no('scope-family-0242-spec-automation-base', 'КСБК 32х2х0.64 нг(А)-FRLS');
  });
  it('does not turn flexible conductor diameters into the solid KSB series or area', () => {
    const id = 'scope-family-0246-spec-automation-base';
    yes(id, 'КСБГ 10х2х1.1 нг(А)-FRLS');
    no(id, 'КСБГ 11х2х1.1 нг(А)-FRLS');
    no(id, 'КСБГ 2х2х1.13 нг(А)-FRLS');
    no(id, 'КСБГ 2х2х1 нг(А)-FRLS');
    no(id, 'КСБГ 2х2х1.1');
    expect(registry.rules.find((r) => r.id === id).evidence.pages).toContain(
      40
    );
  });
  it('keeps KIP solid/foamed PE, cold sheath and required HF separate', () => {
    yes('scope-family-0216-spec-automation-base', 'КИПЭВ 10х2х0.6');
    no('scope-family-0216-spec-automation-base', 'КИПЭВ 11х2х0.6');
    no('scope-family-0216-spec-automation-base', 'КИПЭВ 1х2х0.78');
    yes('scope-family-0228-spec-automation-LS', 'КИПвЭВ 2х2х0.78 нг(А)-LS');
    no('scope-family-0228-spec-automation-LS', 'КИПвЭВ 2х2х0.6 нг(А)-LS');
    no('scope-family-0223-spec-automation-base', 'КИПЭВКВм 2х2х0.6 нг(А)-LS');
    yes('scope-family-0747-spec-automation-base', 'КИПэБ 2х2х0.6 нг(А)-HF');
    no('scope-family-0747-spec-automation-base', 'КИПэБ 2х2х0.6');
    no('scope-family-0751-spec-automation-base', 'КГППэП 2х2х0.78');
  });
  it('requires the documented LonWorks fire category rather than any LS suffix', () => {
    yes('scope-family-0665-spec-automation-base', 'КАЭфВ 1х2х0.64 нг(D)-LS');
    no('scope-family-0665-spec-automation-base', 'КАЭфВ 1х2х0.64 нг(А)-LS');
    no('scope-family-0666-spec-automation-base', 'КАЭфП 1х2х0.64');
    yes('scope-family-0666-spec-automation-base', 'КАЭфП 1х2х0.64 нг(А)-HF');
  });
  it('uses the named KPSVV matrix, not maximum 40 pairs or a neighbouring armour', () => {
    yes('scope-family-0134-spec-main-base', 'КПСВВ 16х2х2.5');
    no('scope-family-0134-spec-main-base', 'КПСВВ 40х2х2.5');
    no('scope-family-0134-spec-main-LS', 'КПСВВ 2х2х0.5 нг(А)-FRLS');
    yes('scope-family-0634-spec-main-base', 'КПСВВБВм 3х2х2.5');
    no('scope-family-0634-spec-main-base', 'КПСВВБВм 4х2х2.5');
    no('scope-family-0634-spec-main-base', 'КПСВВБВм 6х2х1.5');
    yes('scope-family-0632-spec-main', 'КПСВВКВм 10х2х1');
    no('scope-family-0632-spec-main', 'КПСВВКВм 12х2х1');
  });
  it('keeps 5e and KMS models exact and does not promote a bare category', () => {
    yes('scope-family-0637-spec-main-base', 'КВПЭфВП-5е 4х2х0.52');
    no('scope-family-0637-spec-main-base', 'КВПЭфВП 4х2х0.52');
    yes('scope-family-0757-spec-main-base', 'КМС-2в 8х2х0.52');
    no('scope-family-0757-spec-main-base', 'КМС-2в 6х2х0.52');
    no('scope-family-0758-spec-main-base', 'КМС-2у 1х2х0.52');
    yes('scope-family-0761-spec-main-base', 'КСПвЭП 8х2х0.4');
    no('scope-family-0761-spec-main-base', 'КСПвЭП 3х2х0.4');
    expect(
      buildProductDesignation({
        sourceName: 'КВПЭфВП 4х2х0.52',
        mark: 'КВПЭфВП',
      }).officialComplete
    ).toBe(false);
  });
  it('respects SK-EPEPK count/section dashes and its 500V working rating', () => {
    const id = 'scope-family-0754-spec-automation-base';
    yes(id, 'СК-ЭПЭПК 3х0.75 нг(А)-HF');
    no(id, 'СК-ЭПЭПК 37х2.5 нг(А)-HF');
    yes(id, 'СК-ЭПЭПК 16х2х0.75 нг(А)-HF');
    no(id, 'СК-ЭПЭПК 20х2х0.75 нг(А)-HF');
    no(id, 'СК-ЭПЭПК 10х2х1.5 нг(А)-HF');
    no(id, 'СК-ЭПЭПК 3х0.75 нг(А)-HF 1 кВ');
  });
  it('keeps Podolsk screen position and voltage-dependent tuples separate', () => {
    yes('scope-family-0123-podolsk-5-base', 'КМПВ 1х0.35 0.5 кВ');
    no('scope-family-0123-podolsk-5-base', 'КМПВ 1х0.35 1 кВ');
    no('scope-family-0123-podolsk-5-base', 'КМПВ 52х2.5');
    yes('scope-family-0124-podolsk-5-LS', 'КМПВэВ 10х0.5 нг(А)-LS');
    no('scope-family-0126-podolsk-5-LS', 'КМПэВэВ 10х0.5 нг(А)-LS');
    yes('scope-family-0126-podolsk-5-LS', 'КМПэВэВ 7х1.5 нг(А)-LS 1 кВ');
    no('scope-family-0126-podolsk-5-LS', 'КМПэВэВ 7х0.5 нг(А)-LS 1 кВ');
    no('scope-family-0124-podolsk-5-LS', 'КМПВэВ 7х0.75 нг(А)-FRHF');
  });
  it('does not borrow paired rail counts from a different reinforced aluminium shell', () => {
    yes('scope-family-0598-samara-catalog-base', 'СБПЗАШп 15х2х0.9');
    no('scope-family-0601-samara-catalog-base', 'СБПЗАуБпШп 15х2х0.9');
    yes('scope-family-0684-samara-catalog-base', 'СБВБАБпШп 18х2х0.9');
    no('scope-family-0684-samara-catalog-base', 'СБВБАБпШп 19х2х0.9');
    yes('scope-family-0685-samara-catalog-base', 'СБВБАуБпШп 19х2х0.9');
    no('scope-family-0686-samara-catalog-base', 'СБМВБПу 7х2х4');
    yes('scope-family-0686-samara-catalog-base', 'СБМВБПу 3х2х4');
  });
  it('checks the entire MKPp seven-quad auxiliary configuration and rejects a TZPA transplant', () => {
    const id = 'scope-family-0691-samara-catalog-seven-compound';
    const configuration = '7х4х1.05+5х2х0.7+1х0.7';
    yes(id, `МКПпАБП ${configuration}`, {
      conductorConfiguration: configuration,
    });
    no(id, 'МКПпАБП 7х4х1.05+4х2х0.7+1х0.7');
    no(id, 'МКПпАБП 7х4х1.05+5х2х0.9+1х0.7');
    no(id, `МКПпАБП ${configuration}`, { conductorConfiguration: '7х4х1.05' });
    no(
      'scope-family-0687-samara-catalog-base',
      'ТЗПАБпШп 7х4х1.2+5х2х0.9+1х0.9'
    );
    yes('scope-family-0687-samara-catalog-base', 'ТЗПАБпШп 7х4х1.2');
  });
  it('preserves wire/cord column distinctions and star quads', () => {
    yes('scope-family-0788-samara-catalog-base', 'ПРППм 2х0.9');
    no('scope-family-0788-samara-catalog-base', 'ПРППм 2х0.5');
    yes('scope-family-0789-samara-catalog-base', 'ШВП-2 2х0.5');
    no('scope-family-0789-samara-catalog-base', 'ШВП-2 3х0.5');
    yes('scope-family-0680-samara-catalog-base', 'КСПЗПБ 2х4х0.9');
    no('scope-family-0680-samara-catalog-base', 'КСПЗПБ 4х2х0.9');
    no('scope-family-0790-samara-catalog-base', 'КПКРВ 1х2х1 нг(А)-FRHF');
  });
});
