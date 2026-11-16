import rule from '../../data/cableLayerContactRules.json' with { type: 'json' };
export function deriveLayerContactRule(p, technicalProfile){
 const c=p.technicalConstruction||{};
 const innerSheath = technicalProfile?.innerSheath.status === 'present' || c.innerSheath;
 const filling = (technicalProfile?.interstitialFilling ?? c.interstitialFilling)?.status === 'present';
 const special=innerSheath||filling||p.filler||c.filler||c.separator||c.intentionalVoid||p.shield||p.armor||p.specialElements?.length;
 const confirmed=(c.source!=='catalog-construction-1'&&p.cores===1&&rule.confirmedSingleCoreFamilies.includes(p.family))||c.directJacketInsulationContact===true;
 return {...rule,mode:p.hasOuterJacket===true&&!special&&confirmed?'CONFIRMED_DIRECT_CONTACT':'PRESERVE_DOCUMENTED_INTERFACES_NO_ASSUMPTION',status:'MANUAL_REVIEW_REQUIRED'};
}
export function layerContactPrompt(r){return `LAYER CONTACT RULE ${r.version}: ${r.mode==='CONFIRMED_DIRECT_CONTACT'?r.directContact:'Preserve actual documented layer interfaces. Do not assume adjacent contact or invent an air gap for unspecified constructions.'} ${r.exceptions} ${r.verification}`;}
