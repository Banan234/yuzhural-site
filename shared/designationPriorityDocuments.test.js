import { describe, expect, it } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
import { checkDesignationConstruction } from './designationConstructionEvidence.js';

const rule = (id) => {
  const result = registry.rules.find((item) => item.id === id);
  expect(result, id).toBeDefined();
  return result;
};
const table = (id, designation, product = {}) =>
  checkConstructionTable(product, designation, rule(id));
const yes = (id, name, product) =>
  expect(table(id, name, product).reason, name).toBeUndefined();
const no = (id, name, product) =>
  expect(table(id, name, product).reason, name).toBeTruthy();
const family = (id, designation, product = {}) =>
  checkDesignationConstruction({
    family: knowledge.families.find((item) => item.id === id),
    documents: knowledge.documents,
    designation,
    product,
  });

describe('priority manufacturer document transfer, physical tables', () => {
  it('requires the exact main/screen/voltage tuple, not an ordered larger screen', () => {
    const id = 'scope-family-0063-hka-base';
    yes(id, 'АПвПу 1х70мк/16-10', {
      cores: 1,
      crossSection: 70,
      screenCrossSection: 16,
      conductorConfiguration: '1х70мк/16',
      attributes: ['мк', '10'],
    });
    no(id, 'АПвПу 1х70мк/35-10');
    no(id, 'АПвПу 1х70мк/16-10', { screenCrossSection: 35 });
    no(id, 'АПвПу 1х70мк/16');
    no(id, 'АПвПу 1х70мк/16-11');
  });
  it('keeps the 35kV dashes and the one-core 2г restriction', () => {
    const id = 'scope-family-0063-hka-base';
    yes(id, 'АПвПу 3х120/16-35');
    yes(id, 'АПвПу 3х150/25-20');
    no(id, 'АПвПу 3х150/25-35');
    no('scope-family-0065-hka-base', 'АПвПу2г 3х120/16-10');
    yes('scope-family-0065-hka-base', 'АПвПу2г 1х120/16-10');
  });
  it('reads the documented fire execution before or after the voltage', () => {
    const id = 'scope-family-0043-hka-LS';
    yes(id, 'ПвВнг(А)-LS 1х50/16-6');
    yes(id, 'ПвВ 1х50/16нг(А)-LS-6');
    yes(id, 'ПвВ 1х50/16-6нг(А)-LS');
    no(id, 'ПвВнг(А)-LS 1х50/16-6нг(В)-LS');
    no(id, 'ПвВ 1х50/16-6нг(А)-LS', { attributes: ['нг(А)-HF'] });
    expect(family('family-0058', 'АПвП 3х120/50-10нг(А)-HF').status).toBe(
      'unconfirmed'
    );
  });
  it('does not teach old unscreened rules to ignore a screen field', () => {
    no('scope-family-0597-hka-base', 'ПВСн 4х2.5', { screenCrossSection: 16 });
    no('scope-family-0597-hka-base', 'ПВСн 4х2.5/16');
    yes('scope-family-0597-hka-base', 'ПВСн 4х2.5');
  });
  it('keeps documented SIP2 neutral geometry separate from legacy earth fields', () => {
    const id = 'scope-family-0022-hka-neutral-25.0';
    yes(id, 'СИП-2 3х16+1х25 0.6/1 кВ', {
      voltage: 1,
      attributes: ['0.6/1 кВ'],
    });
    no(id, 'СИП-2 3х16+1х25 0.6/1 кВ', { voltage: 6 });
    no(id, 'СИП-2 3х16+1х25', {
      hasGroundCore: true,
      groundCores: 1,
      groundSection: 25,
    });
    no(id, 'СИП-2 3х16+1х25+1х16 0.6/1 кВ');
  });
  it('retains the separate telephone insulation/TU ambiguity', () => {
    expect(family('family-0103', 'ТППэпЗ 10х2х0.5').status).toBe('unconfirmed');
    expect(family('family-0104', 'ТППэпБ 10х2х0.5').status).toBe('unconfirmed');
  });
  it('uses the literal TPV pair and TSV triple rows', () => {
    yes('scope-family-0107-hka-base', 'ТПВ 5х2х0.7');
    no('scope-family-0107-hka-base', 'ТПВ 10х2х0.7');
    yes('scope-family-0108-hka-base', 'ТСВ 20х3х0.5');
    no('scope-family-0108-hka-base', 'ТСВ 5х3х0.5');
    no('scope-family-0108-hka-base', 'ТСВ 20х3х0.64');
  });
  it('preserves nominal ACSR pairs and rejects rounding or mixing steel areas', () => {
    expect(family('family-0651', 'АС 185/29').status).toBe('confirmed');
    expect(family('family-0651', 'АС 16/2.7').status).toBe('confirmed');
    expect(family('family-0651', 'АС 185/43.1').status).toBe('unconfirmed');
    expect(family('family-0651', 'АС 70/72').status).toBe('unconfirmed');
    expect(family('family-0651', 'АС 500/27').status).toBe('unconfirmed');
    // The PDF says27.7 in both nominal columns; the corpus text loses a decimal.
    expect(family('family-0651', 'АС 400/27').status).toBe('unconfirmed');
    expect(family('family-0651', 'АС 400/27.7').status).toBe('confirmed');
  });
  it('does not transfer a screened diameter or a high count into a neighbour', () => {
    yes('scope-family-0582-hka-base', 'КПЭП 10х2х1.13 нг(А)-HF');
    no('scope-family-0182-hka-base', 'КГПэП 10х2х0.8 нг(А)-HF');
    yes('scope-family-0737-hka-base', 'МКСБ 7х4х1.2');
    no('scope-family-0737-hka-base', 'МКСБ 7х2х1.2');
  });
  it('keeps the NYY protective marker and shape-specific tuples', () => {
    yes('scope-family-0153-hka-NYY-J-base', 'NYY 12х2.5-J');
    no('scope-family-0153-hka-NYY-J-base', 'NYY 12х2.5');
    yes('scope-family-0153-hka-NYY-J-RM', 'NYY 4х35-J RM');
    no('scope-family-0153-hka-NYY-J-RM', 'NYY 3х16-J RM');
    no('scope-family-0153-hka-NYY-J-RM', 'NYY 4х35-J RM Class 2');
  });
  it('requires LAPP G/X and does not take a maximum or another article row', () => {
    const id = 'scope-family-0164-lapp-110-review51';
    yes(id, 'OLFLEXclassic 110 10G0.5');
    no(id, 'OLFLEXclassic 110 10X0.5');
    no(id, 'OLFLEXclassic 110 10х0.5');
    no(id, 'OLFLEXclassic 110 100G35');
    no(id, 'OLFLEXclassic 110 10G0.5', {
      hasGroundCore: true,
      attributes: ['X'],
    });
  });
  it('keeps printed nominal endpoints bounded instead of accepting any decimal', () => {
    yes('scope-family-0519-kam-2026-review51', 'ПРКА 2.5');
    no('scope-family-0519-kam-2026-review51', 'ПРКА 2.51');
    no('scope-family-0519-kam-2026-review51', 'ПРКА 16');
    yes('scope-family-0672-kam-2026-review51', 'КТФЭ 7х1.5');
    no('scope-family-0672-kam-2026-review51', 'КТФЭ 8х1.5');
    no('scope-family-0672-kam-2026-review51', 'КТФЭ 10х1.5');
  });
  it('does not turn screened OCR subscripts into 43 or 529 conductors', () => {
    const id = 'scope-family-0638-rkz-catalog-review51-screened';
    yes(id, 'КУПР 52эх0.5');
    no(id, 'КУПР 52эх1.5');
    no(id, 'КУПР 529эх0.5');
    no(id, 'КУПР 52х0.5');
  });
  it('respects the RKZ KGMVEV discrete count, grouping and section dependencies', () => {
    const id = 'scope-family-0696-rkz-catalog-review51-base';
    yes(id, 'КГМВЭВ 2х4 нг(А)');
    yes(id, 'КГМВЭВ 4х1.5 нг(А)-LS');
    no(id, 'КГМВЭВ 7х1.5 нг(А)-LS');
    no(id, 'КГМВЭВ 2х2х4 нг(А)');
    yes(id, 'КГМВЭВ 2х3х1 нг(А)');
    no(id, 'КГМВЭВ 2х3х0.5 нг(А)');
    no(id, 'КГМВЭВ 5х2х1 нг(А)-ХЛ');
  });
  it('does not inherit the small-count KGSrT limit at 19 or 27 conductors', () => {
    const id = 'scope-family-0768-rkz-catalog-review51-base';
    yes(id, 'КГСрТ 3х2.5 нг(В)-HF');
    no(id, 'КГСрТ 4х16 нг(В)-HF');
    no(id, 'КГСрТ 19х2.5 нг(В)-HF');
    no(id, 'КГСрТ 27х1.5 нг(В)-HF');
  });
  it('reads Rezh fire COLUMN dashes instead of neighbouring LS values', () => {
    const fr = 'scope-family-0209-rezh-review51-OEK-szFRLS-pair';
    yes(fr, 'КУМП-ОЭКс з нг(А)-FRLS 24х2х0.5', { attributes: ['з'] });
    no(fr, 'КУМП-ОЭКс з нг(А)-FRLS 25х2х0.5');
    yes('scope-family-0208-rezh-review51-OEK-LS', 'КУМП-ОЭК нг(А)-LS 37х2х0.5');
    no('scope-family-0208-rezh-review51-OEK-LS', 'КУМП-ОЭК нг(А)-FRLS 1х2х1');
    const single = 'scope-family-0209-rezh-review51-OEK-szFRLS-single';
    yes(single, 'КУМП-ОЭКс з нг(А)-FRLS 2х0.75');
    yes(single, 'КУМП-ОЭКс з нг(А)-FRLS 21х6');
    no(single, 'КУМП-ОЭКс з нг(А)-FRLS 22х6');
  });
  it('retains filling/tinned markers and refuses undocumented combined cold executions', () => {
    const id = 'scope-family-0210-rezh-review51-IEOE-HF';
    yes(id, 'КУМП-ИЭОЭ нг(А)-HF 10х2х0.75л', { attributes: ['л'] });
    no(id, 'КУМП-ИЭОЭ нг(А)-HF 10х2х0.75', { attributes: ['л'] });
    yes(
      'scope-family-0210-rezh-review51-IEOE-zLS',
      'КУМП-ИЭОЭ з нг(А)-LS 20х2х0.5'
    );
    no(
      'scope-family-0210-rezh-review51-IEOE-zLS',
      'КУМП-ИЭОЭ з нг(А)-LS-ХЛ 3х2х1.5'
    );
  });
  it('accepts documented single colours but not invented striped combinations', () => {
    const id = 'scope-family-0114-energo-apv-review51';
    yes(id, 'АПВ 35 бел', { attributes: ['бел'] });
    yes(id, 'АПВ 50 жел/зел', { attributes: ['жел/зел'] });
    no(id, 'АПВ 35 бел/красн');
    no(id, 'АПВ 25 белый с красной полосой');
    yes('scope-family-0178-hka-base', 'ПГВА 0.5 красн', {
      attributes: ['красн'],
    });
    no('scope-family-0176-hka-base', 'ПВА 50 черн');
  });
  it('does not confuse non-positive/unknown geometry with a manufacture prohibition', () => {
    no('scope-family-0023-hka-base', 'СИП-4 999х999');
    no('scope-family-0023-hka-base', 'СИП-4 3х2.51');
    const result = family('family-0651', 'АС 70/72');
    expect(result.status).toBe('unconfirmed');
    expect(result).not.toHaveProperty('impossible');
  });
});
