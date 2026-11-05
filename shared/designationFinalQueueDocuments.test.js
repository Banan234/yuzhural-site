import { describe, it, expect } from 'vitest';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import { checkConstructionTable } from './designationConstructionTable.js';
const check = (suffix, name, product = {}) => {
  const rule = registry.rules.find((r) => r.id === `scope-${suffix}-q52`);
  expect(rule, suffix).toBeDefined();
  return checkConstructionTable(product, name, rule);
};
const yes = (id, name, product) =>
  expect(check(id, name, product).reason, name).toBeUndefined();
const no = (id, name, product) =>
  expect(check(id, name, product).reason, name).toBeTruthy();
describe('last priority manufacturer queue: exact construction rows', () => {
  it('retains the KMM nominal list and classifies 1.2 as unconfirmed', () => {
    yes('family-0290-podolsk-13', 'КММ 2х0.12');
    yes('family-0291-podolsk-13', 'КММц 7х0.35');
    no('family-0290-podolsk-13', 'КММ 2х1.2');
    no('family-0290-podolsk-13', 'КММ 6х0.35');
  });
  it('retains RPSH core-dependent large sections', () => {
    yes('family-0293-podolsk-13', 'РПШЭк 3х10');
    no('family-0293-podolsk-13', 'РПШЭк 7х10');
    no('family-0292-podolsk-13', 'РПШк 7х0.5');
  });
  it('distinguishes BPDO from BPDOU and KPLM from screened pair rows', () => {
    yes('family-0274-podolsk-10', 'БПДО 0.35');
    no('family-0274-podolsk-10', 'БПДО 0.2');
    yes('family-0278-podolsk-10', 'КПЛМ 4х1');
    no('family-0278-podolsk-10', 'КПЛМ 1х2х0.5');
    no('family-0278-podolsk-10', 'КПЛМ 52х1');
  });
  it('requires an explicit NVE conductor class before applying its row', () => {
    yes('family-0642-podolsk-9', 'НВЭ-3 2х1.5');
    no('family-0642-podolsk-9', 'НВЭ 2х1.5');
    no('family-0642-podolsk-9', 'НВЭ-5 2х1.5');
    no('family-0642-podolsk-9', 'НВЭ-3 2х0.2');
  });
  it('keeps ordinary LAN data apart from unproven LS/HF suffixes', () => {
    yes('family-0539-spec-lan-leaf-260', 'КВП-5е 4х2х0.52');
    no('family-0539-spec-lan-leaf-260', 'КВП-5е 4х2х0.52нг(А)-HF');
    no('family-0540-spec-lan-leaf-263', 'КВПЭф-5е 3х2х0.52');
    yes('family-0537-spec-lowtox20', 'ЛОУТОКС 20нг(А)-FRLSLTx 2х2х1');
    no('family-0537-spec-lowtox20', 'ЛОУТОКС 20нг(А)-FRLSLTx 40х2х2.5');
  });
  it('uses exact LAPP articles and BITNER diameter/count columns', () => {
    yes('family-0160-lapp-liycy-tp', 'UNITRONIC LIYCY/TP 6х2х0.5');
    no('family-0160-lapp-liycy-tp', 'UNITRONIC LIYCY/TP 6х2х1');
    yes('family-0915-bitner-as-fe180', 'BITflame AS FE 180/E90 20х2х0.8');
    no('family-0915-bitner-as-fe180', 'BITflame AS FE 180/E90 20х2х1');
    no('family-0915-bitner-as-fe180', 'BITflame AS FE 180/E90 20х2х0.8', {
      voltage: 0.3,
    });
  });
  it('keeps right-hand Rezh dashes instead of borrowing the unscreened column', () => {
    yes('family-0781-rezh-f196-full', 'СБЗПуЭ 27х2х0.9', { attributes: ['Э'] });
    no('family-0781-rezh-f196-full', 'СБЗПуЭ 19х2х0.9');
    no('family-0781-rezh-f196-full', 'СБЗПуЭ 24х2х0.8');
    no('family-0781-rezh-f196-full', 'СБЗПуЭ 15х2х1');
  });
  it('keeps exact product evidence separate from filters and neighbouring sizes', () => {
    yes('family-0871-chuvash-vol2', 'МКВЭВ 4х0.35', { voltage: 1 });
    no('family-0871-chuvash-vol2', 'МКВЭВ 4х0.35', { voltage: 0.6 });
    yes('family-0659-mokz-pugnp', 'ПУГНП 3х1.5');
    no('family-0659-mokz-pugnp', 'ПУГНП 3х0.75');
    no('family-0659-mokz-pugnp', 'ПУГНП 3х4');
    no('family-1032-sst-industry-current', 'НУД 3х0.75');
  });
  it('enforces INSiL explicit nominal list and dependent core bands', () => {
    yes('family-0547-ekm-ship-insil', 'ИнСил-ВВнг(А)-FRLS 19х1.5');
    no('family-0547-ekm-ship-insil', 'ИнСил-ВВнг(А)-FRLS 19х10');
    no('family-0547-ekm-ship-insil', 'ИнСил-ВВнг(А)-FRLS 3х2.51');
    no('family-0547-ekm-ship-insil', 'ИнСил-ВВнг(А)-FRLS 999х999');
    no('family-0547-ekm-ship-insil', 'ИнСил-ВВнг-FRLS 19х1.5');
  });
  it('distinguishes a concentric conductor from a screen and rejects another tuple', () => {
    yes('family-0529-prysmian-lv', 'NYCY 24х1.5 RE/6', {
      attributes: ['RE/6'],
      concentricConductorCrossSection: 6,
    });
    no('family-0529-prysmian-lv', 'NYCY 24х1.5 RE/6', {
      concentricConductorCrossSection: 10,
    });
    no('family-0529-prysmian-lv', 'NYCY 24х1.5 RE/6', {
      screenCrossSection: 6,
    });
    no('family-0529-prysmian-lv', 'NYCY 24х1.5 RE/10');
    no('family-0529-prysmian-lv', 'NYCY 24х1.5 RM/6');
    no('family-0274-podolsk-10', 'БПДО 1.5', {
      concentricConductorCrossSection: 6,
    });
  });
  it('does not drop the mandatory tinning modifier from SKAB', () => {
    const id = 'scope-family-0532-spec-skab-q52-pair';
    const rule = registry.rules.find((r) => r.id === id);
    expect(
      checkConstructionTable(
        { conductorConfiguration: '4х2х1', attributes: ['нг(А)-LS', 'л'] },
        'СКАБ 250Кнг(А)-LS 4х2х1л',
        rule
      ).reason
    ).toBeUndefined();
    expect(
      checkConstructionTable({}, 'СКАБ 250Кнг(А)-LS 4х2х1', rule).reason
    ).toBeTruthy();
    expect(
      checkConstructionTable({}, 'СКАБ 250Кнг(А)-LS 8х2х1', rule).reason
    ).toBeTruthy();
  });

  it('uses HoldCab joint power/control bands rather than the common maximum', () => {
    yes('family-0809-hka-holdcab-products-en', 'HoldCab PVC LV SLS(A) 10х2.5');
    no('family-0809-hka-holdcab-products-en', 'HoldCab PVC LV SLS(A) 3х2.5');
    yes('family-0807-hka-holdcab-products-en', 'HoldCab PVC LV LS(A) 3х4');
    no('family-0807-hka-holdcab-products-en', 'HoldCab PVC LV LS(A) 3х2.51');
    no('family-0807-hka-holdcab-products-en', 'HoldCab PVC LV LS(AF) 3х4');
  });
  it('retains explicit Pyrocor finish and voltage and the K9 one-core scope', () => {
    yes(
      'family-0872-metromatika-pyrocor-current',
      'ПИРОКОР-ВКВнг(А)LS УФ 3х16 гмк-1'
    );
    no(
      'family-0872-metromatika-pyrocor-current',
      'ПИРОКОР-ВКВнг(А)LS УФ 3х16 мк-1'
    );
    no(
      'family-0872-metromatika-pyrocor-current',
      'ПИРОКОР-ВКВнг(А)LS УФ 3х16 гмк-0.66'
    );
    yes('family-0780-mkm-k9sp-2026', 'КА9СПвПнг(А)HF 1х120-1');
    yes('family-0780-mkm-k9sp-2026', 'КА9СПвПнг(А)HF 5х4-1');
    no('family-0780-mkm-k9sp-2026', 'КА9СПвПнг(А)HF 6х4-1');
  });
  it('matches joined attributes only when every component occurs in the source', () => {
    yes('family-0548-ekm-ship-insil', 'ИнСил-ВБВнг(А)FRLS ХЛ 5х25', {
      attributes: ['нг(А)-FRLS-ХЛ'],
    });
    no('family-0548-ekm-ship-insil', 'ИнСил-ВБВнг(А)FRLS 5х25', {
      attributes: ['нг(А)-FRLS-ХЛ'],
    });
    no('family-0548-ekm-ship-insil', 'ИнСил-ВБВнг(А)FRLS ХЛ 5х25', {
      attributes: ['нг(А)-LS-ХЛ'],
    });
    yes(
      'family-0872-metromatika-pyrocor-current',
      'ПИРОКОР-ВКВнг (А)LS УФ 3х16 гмк-1',
      { attributes: ['нг(А)-LS', 'УФ', 'гмк-1'] }
    );
    no(
      'family-0872-metromatika-pyrocor-current',
      'ПИРОКОР-ВКВнг (А)LS УФ 3х16 гмк-1',
      { attributes: ['нг(А)-LS', 'УФ', 'гмкл-1'] }
    );
  });
  it('normalizes spacing within the explicit category without inventing a category', () => {
    yes('family-0701-kes-catalog', 'КМВэВ 2х2х0.75 нг (А) LS');
    no('family-0701-kes-catalog', 'КМВэВ 2х2х0.75 нг LS');
    no('family-0701-kes-catalog', 'КМВэВ 2х2х0.75 нг (В) LS');
    const rule = registry.rules.find(
      (r) => r.id === 'scope-family-0660-segment-ku-q52-common-LS'
    );
    expect(
      checkConstructionTable(
        { attributes: ['нг(А)-LS-ХЛ'] },
        'Сегмент-КУнг(А)-Эф-LS ХЛ 4х2х1',
        rule
      ).reason
    ).toBeUndefined();
    expect(
      checkConstructionTable(
        { attributes: ['нг(А)-LS-ХЛ'] },
        'Сегмент-КУнг(А)-Эф-LS 4х2х1',
        rule
      ).reason
    ).toBeTruthy();
    expect(
      checkConstructionTable({}, 'Сегмент-КУнг(А)-Эфк-LS 4х2х1', rule).reason
    ).toBeTruthy();
  });
  it('retains the individual-screen marker and explicit KVIP material/armour tail', () => {
    const checkRule = (id, source, product = {}) =>
      checkConstructionTable(
        product,
        source,
        registry.rules.find((r) => r.id === id)
      );
    const id = 'scope-family-0531-spec-skab-q52-screen-triple';
    expect(
      checkRule(id, 'СКАБ 250нг(А)HF ХЛ 2х3эх0.75л', {
        conductorConfiguration: '2х3эх0.75',
        attributes: ['нг(А)-HF-ХЛ', 'л'],
      }).reason
    ).toBeUndefined();
    expect(checkRule(id, 'СКАБ 250нг(А)HF ХЛ 2х3х0.75л').reason).toBeTruthy();
    const kvip = 'scope-family-0088-gerda-kvip-q52-LS-VEL-cold';
    expect(
      checkRule(kvip, 'КВИП нг(А)LS 4х2х1 ВЭЛ-хл', {
        attributes: ['нг(А)-LS', 'ВЭЛ-хл'],
      }).reason
    ).toBeUndefined();
    expect(checkRule(kvip, 'КВИП нг(А)LS 4х2х1 ВЭЛ').reason).toBeTruthy();
    expect(checkRule(kvip, 'КВИП нг(А)HF 4х2х1 ВЭЛ-хл').reason).toBeTruthy();
  });
});
