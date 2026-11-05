import { describe, expect, it } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
const rule = (id) => registry.rules.find((r) => r.id === id);
const check = (id, name, product = {}) =>
  checkConstructionTable(product, name, rule(id));
const accepted = (id, name, product) =>
  expect(check(id, name, product).reason).toBeUndefined();
const rejected = (id, name, product) =>
  expect(check(id, name, product).reason).toBeTruthy();

describe('current-catalog manufacturer document transfer', () => {
  it('keeps XLPE sheath, fire category and voltage-dependent armour rows separate', () => {
    const unarmoured = 'scope-family-0032-hka';
    accepted(unarmoured, 'АПвВГ 3х2.5 0.66 кВ');
    rejected(unarmoured, 'АПвВГ 3х2.5 3 кВ');
    rejected(unarmoured, 'АПвВГ 3х2.51');
    const armour = 'scope-family-0034-hka';
    accepted(armour, 'АПвБШвнг(В) 3х10 3 кВ');
    rejected(armour, 'АПвБШвнг(А) 3х10 3 кВ');
    rejected(armour, 'АПвБШв 3х6 3 кВ');
    rejected(armour, 'АПвБШв 4х10 3 кВ');
    rejected(armour, 'АПвБШв 1х50');
    const ls = 'scope-family-0034-hka-LS95';
    accepted(ls, 'АПвБШв 3х10 нг(А)-LS 1 кВ');
    rejected(ls, 'АПвБШв 3х10 нг(А)-LS 3 кВ');
    rejected(ls, 'АПвБШв 1х50 нг(А)-LS 1 кВ');
  });
  it('keeps documented RPSH voltage dashes and PRS/SHVVP column differences', () => {
    const rpsh = 'scope-family-0074-hka';
    accepted(rpsh, 'РПШ 4х4 0.66 кВ');
    rejected(rpsh, 'РПШ 4х4 3 кВ');
    accepted(rpsh, 'РПШ 3х4 3 кВ');
    rejected(rpsh, 'РПШ 3х0.75 3 кВ');
    accepted('scope-family-0302-hka', 'ПРС 3х0.75');
    rejected('scope-family-0302-hka', 'ПРС 4х0.75');
    rejected('scope-family-0302-hka', 'ПРС 2х2.5');
    accepted('scope-family-0119-hka', 'ШВВП 3х0.5');
    rejected('scope-family-0119-hka', 'ШВВП 3х0.75');
    rejected('scope-family-0119-hka', 'ШВВП 2х0.35');
  });
  it('does not turn a compound KGN or multi-core PVAM into a supported single item', () => {
    accepted('scope-family-0071-hka', 'КГН 5х1');
    rejected('scope-family-0071-hka', 'КГН 5х0.75');
    rejected('scope-family-0071-hka', 'КГН 3х16+1х6');
    rejected('scope-family-0071-hka', 'КГН 3х1.5 1 кВ');
    accepted('scope-family-0177-hka', 'ПВАМ 0.35');
    rejected('scope-family-0177-hka', 'ПВАМ 2х0.35');
    rejected('scope-family-0177-hka', 'ПВАМ 0.35 бел/зел');
  });
  it('keeps the WPP/WPW missing nominal and single wire boundaries', () => {
    accepted('scope-family-0298-hka', 'ВПП 1х95');
    rejected('scope-family-0299-hka', 'ВПВ 1х95');
    accepted('scope-family-0075-hka', 'РКГМ 1х120 0.66 кВ');
    rejected('scope-family-0075-hka', 'РКГМ 1х150');
    accepted('scope-family-0081-hka', 'МГТФ 0.03');
    rejected('scope-family-0081-hka', 'МГТФ 0.24');
    rejected('scope-family-0081-hka', 'МГТФ 2х0.12');
    accepted('scope-family-0149-hka', 'ПНСВ 1х1.2');
    rejected('scope-family-0149-hka', 'ПНСВ 1х1.25');
  });
  it('keeps common-core signal diameter distinct from pair counts and stranded section', () => {
    accepted('scope-family-0186-paritet-1', 'КСПВ 20х0.5');
    rejected('scope-family-0186-paritet-1', 'КСПВ 6х0.8');
    rejected('scope-family-0186-paritet-1', 'КСПВ 2х2х0.5');
    rejected('scope-family-0186-paritet-1', 'КСПВ 4х0.2');
    accepted('scope-family-0252-paritet-1', 'КСПВГ 6х0.2');
    rejected('scope-family-0252-paritet-1', 'КСПВГ 6х0.5');
    accepted('scope-family-0133-paritet-1', 'КСВВ 4х2х0.97 нг(А)-LS');
    rejected('scope-family-0133-paritet-1', 'КСВВ 1х2х0.5 нг(А)-LS');
    rejected('scope-family-0133-paritet-1', 'КСВВ 4х0.5');
  });
  it('does not borrow the KIS-R diameter matrix from KIS or KSR', () => {
    const kis = 'scope-family-0263-paritet-1';
    accepted(kis, 'КИС-РВ 4х2х1.78 нг(А)-FRLS');
    rejected(kis, 'КИС-РВ 1х2х0.78 нг(А)-FRLS');
    accepted('scope-family-0188-paritet-1', 'КСРВ 1х2х0.8 нг(А)-FRLS');
    rejected('scope-family-0188-paritet-1', 'КСРВ 4х2х1.78 нг(А)-FRLS');
    rejected('scope-family-0188-paritet-1', 'КСРВ 1х2х1.5 нг(А)-FRLS');
    accepted('scope-family-0254-paritet-1', 'КИС-В 1х4х0.78');
    rejected('scope-family-0254-paritet-1', 'КИС-В 3х2х0.9');
    rejected('scope-family-0254-paritet-1', 'КИС-В 2х2х1.2');
    rejected('scope-family-0254-paritet-1', 'КИС-В 1х2х0.6+1х0.6');
  });
  it('requires the documented RF model index and exact fire execution for KVK', () => {
    accepted('scope-family-0271-paritet-1', 'КВК-П-2 2х0.75 нг(А)-HF');
    rejected('scope-family-0271-paritet-1', 'КВК-П-2 2х2.5');
    rejected('scope-family-0271-paritet-1', 'КВК-П 2х0.75');
    accepted('scope-family-0269-paritet-1', 'КВК-В-3ф 2х0.75');
    rejected('scope-family-0269-paritet-1', 'КВК-В-3ф 2х0.75 нг(А)-HF');
  });
  it('keeps Kamkabel voltage, conductor count and source interval endpoints joint', () => {
    accepted('scope-family-0490-kam-2026', 'ААШв 3х50 6 кВ');
    rejected('scope-family-0490-kam-2026', 'ААШв 3х50 1 кВ');
    accepted('scope-family-0490-kam-2026', 'ААШв 1х240 3 кВ');
    rejected('scope-family-0490-kam-2026', 'ААШв 3х240 3 кВ');
    rejected('scope-family-0490-kam-2026', 'ААШв 3х999 6 кВ');
    rejected('scope-family-0490-kam-2026', 'ААШв 3х120 6 кВ'); // intermediate nominal series is still open
    accepted('scope-family-0497-kam-2026', 'АСБ 3х16 10 кВ');
    rejected('scope-family-0497-kam-2026', 'АСБ 4х16 10 кВ');
  });
  it('uses the actual alloy LS rows and does not extend them to a flat execution', () => {
    const id = 'scope-family-0024-hka';
    accepted(id, 'АсВВГ 1х150 нг(А)-LS');
    accepted(id, 'АсВВГ 5х25 нг(А)-LS');
    rejected(id, 'АсВВГ 1х500 нг(А)-LS');
    rejected(id, 'АсВВГ 3х4 п нг(А)-LS');
  });
});
