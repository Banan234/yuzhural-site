import {it,expect} from 'vitest';
import {isCableReferenceCompatible} from './cableReferenceCompatibility.js';
const p={cores:3,geometry:'round',hasOuterJacket:true,conductorMaterial:'copper',conductorConstruction:'solid',shield:false,armor:false,specialElements:[]};
it('restricts single-core anatomy and critical technical construction',()=>{
 expect(isCableReferenceCompatible(p,{...p,cores:5})).toBe(true);
 for(const change of [{cores:1},{armor:true},{shield:true},{geometry:'flat'},{conductorMaterial:'aluminium'},{conductorConstruction:'stranded'},{hasOuterJacket:false},{specialElements:['fire-barrier']}])expect(isCableReferenceCompatible(p,{...p,...change})).toBe(false);
});
