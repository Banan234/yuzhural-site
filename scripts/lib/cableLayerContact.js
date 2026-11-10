import fs from 'node:fs';
const rule=JSON.parse(fs.readFileSync(new URL('../../data/cableLayerContactRules.json',import.meta.url)));
export function deriveLayerContactRule(p){
 const c=p.technicalConstruction||{};
 const special=p.filler||c.filler||c.separator||c.intentionalVoid||p.shield||p.armor||p.specialElements?.length;
 const confirmed=(p.cores===1&&rule.confirmedSingleCoreFamilies.includes(p.family))||c.directJacketInsulationContact===true;
 return {...rule,mode:p.hasOuterJacket===true&&!special&&confirmed?'CONFIRMED_DIRECT_CONTACT':'PRESERVE_DOCUMENTED_INTERFACES_NO_ASSUMPTION',status:'MANUAL_REVIEW_REQUIRED'};
}
export function layerContactPrompt(r){return `LAYER CONTACT RULE ${r.version}: ${r.mode==='CONFIRMED_DIRECT_CONTACT'?r.directContact:'Preserve actual documented layer interfaces. Do not assume adjacent contact or invent an air gap for unspecified constructions.'} ${r.exceptions} ${r.verification}`;}
