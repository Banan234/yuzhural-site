import { describe, expect, it } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
import { checkDesignationConstruction } from './designationConstructionEvidence.js';
import { buildProductDesignation } from './productDesignation.js';

const rule = (id) => registry.rules.find((r) => r.id === id);
const check = (id, source, fields = {}) =>
  checkConstructionTable(fields, source, rule(id));
const positive = (id, source, fields) =>
  expect(check(id, source, fields).reason).toBeUndefined();
const negative = (id, source, fields) =>
  expect(check(id, source, fields).reason).toBeTruthy();

describe('dependent manufacturer construction matrices', () => {
  it('keeps ГОСТ1508 base and ng(A) control tables separate', () => {
    positive('scope-family-0007-hka-control-base', 'КВВГ 52х1.5');
    negative('scope-family-0007-hka-control-base', 'КВВГ 52х2.5');
    positive('scope-family-0007-hka-control-ngA', 'КВВГнг(А) 52х2.5');
    negative('scope-family-0007-hka-control-ngA', 'КВВГнг(А) 52х4');
  });
  it('does not borrow X rows for OPVC-JZ G constructions', () => {
    positive('table-family-1030-tkd-opvc-jz', 'OPVC-JZ 12х1.5');
    negative('table-family-1030-tkd-opvc-jz', 'OPVC-JZ 41х1.5');
    negative('table-family-1030-tkd-opvc-jz', 'OPVC-JZ 36х2.5');
  });
  it('does not cross the Р5/Р6 or size-dependent count limits', () => {
    positive('scope-family-1033-spec-sklon', 'СКЛОН Р6 24х0.35');
    positive('scope-family-1033-spec-sklon', 'СКЛОН Р6 5х25');
    negative('scope-family-1033-spec-sklon', 'СКЛОН Р6 24х6');
    negative('scope-family-1033-spec-sklon', 'СКЛОН Р6 5х35');
  });
  it('excludes AC claims for DC-only armoured one-core rows', () => {
    positive('scope-family-0003-hka-base', 'ВБШв 3х6 3 кВ');
    negative('scope-family-0003-hka-base', 'ВБШв 4х6 3 кВ');
    negative('scope-family-0003-hka-base', 'ВБШв 1х50 1 кВ');
  });
  it('does not borrow screened PPG 3kV scope for unscreened PPG', () => {
    positive('scope-family-0068-hka', 'ППГнг(А)-HF 1х1000 1 кВ');
    negative('scope-family-0068-hka', 'ППГнг(А)-HF 1х1000 3 кВ');
    negative('scope-family-0068-hka', 'ППГ 3х2.5');
  });
  it('requires joint class/size/voltage and rejects conflicting input', () => {
    positive('scope-family-0814-podolsk-9', 'НВМ 0.2-1 600В бел');
    negative('scope-family-0814-podolsk-9', 'НВМ 0.2-5 600В бел');
    negative('scope-family-0814-podolsk-9', 'НВМ 0.2-1');
    negative('scope-family-0814-podolsk-9', 'НВМ 0.2-1 600В бел', {
      voltage: 1,
    });
    negative('scope-family-0814-podolsk-9', 'НВМ 0.2-1 600В бел', { cores: 2 });
  });
  it('keeps the drain conductor separate from ground and grouped cores', () => {
    positive('table-family-1031-nestor-nesmak-hf', 'NESMAK-HF 12x2x0.5+0.5');
    negative('table-family-1031-nestor-nesmak-hf', 'NESMAK-HF 12x2x0.5+1');
    negative('table-family-1031-nestor-nesmak-hf', 'NESMAK-HF 12x2x0.5+0.5', {
      groundSection: 0.5,
    });
    negative('table-family-1031-nestor-nesmak-hf', 'NESMAK-HF 12x2x0.5+0.5', {
      conductorConfiguration: '12x2x0.75+0.5',
    });
  });
  it('checks fixed sections and balanced grouped notation', () => {
    positive('scope-family-0945-podolsk-13', 'СЭК 5х2');
    negative('scope-family-0945-podolsk-13', 'СЭК 5х2х0.5');
    const id = 'scope-family-0078-hka';
    positive(id, 'МКЭШВ 2х(2х0.5)');
    negative(id, 'МКЭШВ 2х(2х0.5');
    negative(id, 'МКЭШВ 2х2х0.5)');
    negative(id, 'МКЭШВ 38х(2х0.5)');
  });
  it('does not inherit thermoelectrode material or an absent nominal', () => {
    positive('scope-family-0842-sentek-ptvv', 'ПТВВ-ХА 2х0.5');
    negative('scope-family-0842-sentek-ptvv', 'ПТВВ-ХК 2х0.5');
    negative('scope-family-0842-sentek-ptvv', 'ПТВВ-ХА 2х0.35');
  });
  it('separates H05/H07 and pair/core count tables', () => {
    positive('scope-family-0903-helu-h05bq-en', 'H05BQ-F 3х0.75');
    negative('scope-family-0903-helu-h05bq-en', 'H05BQ-F 3х2.5');
    positive('scope-family-0901-helu-paar-en', 'PAAR-CY-OZ 20х2х1');
    negative('scope-family-0901-helu-paar-en', 'PAAR-CY-OZ 20х2х0.75');
    positive('scope-family-0902-helu-ozbl-en', 'OZ-BL-CY 41х0.75');
    negative('scope-family-0902-helu-ozbl-en', 'OZ-BL-CY 41х1.5');
  });
  it('requires both editions when model and size evidence depend on each other', () => {
    const input = {
      product: { attributes: ['нг(А)-HF'] },
      designation: 'КУЭПКП нг(А)HF 2х2х1.5',
      family: knowledge.families.find((f) => f.id === 'family-0417'),
    };
    const result = checkDesignationConstruction({
      ...input,
      documents: knowledge.documents,
    });
    expect(result.status).toBe('confirmed');
    expect(result.supportingEvidence[0].documentId).toBe('tomsk-toflex');
    for (const id of ['tomsk-toflex', 'tomsk-constructor']) {
      expect(
        checkDesignationConstruction({
          ...input,
          documents: knowledge.documents.map((d) =>
            d.id === id ? { ...d, sha256: 'changed' } : d
          ),
        }).status
      ).toBe('unconfirmed');
    }
    expect(
      checkDesignationConstruction({
        ...input,
        designation: 'КУЭПКП нг(А)LSLTx-ХЛ 2х2х1.5',
        documents: knowledge.documents,
      }).status
    ).toBe('unconfirmed');
  });
  it('keeps unsupported geometry and unknown models unconfirmed', () => {
    for (const fields of [
      { hasGroundCore: true },
      { conductorStrandCount: 999 },
      { doubleInsulationThickness: 10 },
    ]) {
      expect(
        buildProductDesignation({
          sourceName: 'ВВГ 3х2.5',
          mark: 'ВВГ',
          ...fields,
        }).officialComplete
      ).toBe(false);
    }
    for (const sourceName of [
      'ВВГ 999х999',
      'ВВГ 3х2.51',
      'HELUKABEL 3х2.5',
      'LAPP KABEL 3х2.5',
    ]) {
      expect(
        buildProductDesignation({ sourceName, mark: sourceName.split(' ')[0] })
          .officialComplete
      ).toBe(false);
    }
  });
});
