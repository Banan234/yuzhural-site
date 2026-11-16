import { expect, test } from 'vitest';
import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { catalogCableSpecs } from './fixtures/cableCatalogFixture.js';
import { matchesApprovedCableConstruction } from '../../shared/productImages.js';
import { digest } from './cableStyleBatch.js';

const fixture = {
  sku:'TEST', markFamily:'ВВГ', cores:2,
  specs:{...catalogCableSpecs,'Конструкция токопроводящей жилы':undefined},
  designationDecoded:{tokens:[{code:'test',text:'Медные однопроволочные жилы'}],warnings:[],unknown:[]},
};
test('explicit catalog evidence can complete profiles without an extra characteristic field',()=>{
  const result=readCableCatalogProfile(fixture);
  expect(result.issues).toEqual([]);
  expect(result.profile.conductorConstruction).toBe('solid');
  expect(result.source.recovered['Конструкция токопроводящей жилы'][0].source).toBe('designationDecoded.tokens[0]');
  expect(result.visualKey).toBe(readCableCatalogProfile({...fixture,sku:'OTHER',crossSection:10}).visualKey);
});

test('conflicting evidence and alternative variants cannot fill missing construction',()=>{
  const mismatch=readCableCatalogProfile({...fixture,specs:{...fixture.specs,'Конструкция токопроводящей жилы':'Многопроволочная'}});
  expect(mismatch.issues).toContain('catalog-conflict: Конструкция токопроводящей жилы');
  const uncertain=readCableCatalogProfile({...fixture,designationDecoded:{tokens:[{code:'test',text:'Медные многопроволочные жилы; однопроволочные в исполнении «ок»'}]}});
  expect(uncertain.profile.schematicAssumptions['Конструкция токопроводящей жилы'].status).toBe('UNCONFIRMED');
  const changed=readCableCatalogProfile({...fixture,designationDecoded:{tokens:[{code:'test',text:'Общий экран из медных лент'}]}});
  expect(changed.issues).toContain('catalog-conflict: Экранированный');
  const fire=readCableCatalogProfile({...fixture,attributes:['нг(А)-FRLS'],
    specs:{...fixture.specs,'Огнестойкий барьер':undefined}});
  expect(fire.profile.schematicAssumptions.fireBarrier.value).toBe('not-exposed');
});

test('reuse is recalculated from live catalog evidence after a change in construction',()=>{
  const original=readCableCatalogProfile(fixture);
  const approval={technicalSourceVersion:'catalog-construction-1',visualKey:original.visualKey,profileHash:digest(original.profile)};
  expect(matchesApprovedCableConstruction(fixture,approval)).toBe(true);
  const revised={...fixture,designationDecoded:{tokens:[{code:'test',text:'Медные многопроволочные жилы'}]}};
  expect(readCableCatalogProfile(revised).profile.conductorConstruction).toBe('stranded');
  expect(matchesApprovedCableConstruction(revised,approval)).toBe(false);
});

test('symbolic screen type does not split profiles, but a change in screen presence does',()=>{
  const withScreen={...fixture,specs:{...fixture.specs,'Экранированный':'Да',
    'Расположение экрана':'Под наружной оболочкой','Тип экрана':'Медная лента'}};
  const foil={...withScreen,specs:{...withScreen.specs,'Тип экрана':'Алюминиевая фольга'}};
  const first=readCableCatalogProfile(withScreen), second=readCableCatalogProfile(foil);
  expect(first.visualKey).toBe(second.visualKey);
  expect(first.visualKey).not.toBe(readCableCatalogProfile(fixture).visualKey);
  expect(second.source.fields['Тип экрана']).toBe('Алюминиевая фольга');
});
