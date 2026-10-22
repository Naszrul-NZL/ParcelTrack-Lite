import { describe,it,expect } from 'vitest';
import { STATUSES } from '@/shared/constants';
import type { Role } from '@/shared/constants';
import { canTransition,canAssign } from '@/server/modules/delivery/rules';
const actors=[{role:'SELLER',assigned:false,active:true},{role:'ADMIN',assigned:false,active:true},{role:'RIDER',assigned:true,active:true},{role:'RIDER',assigned:false,active:true},{role:'RIDER',assigned:true,active:false}] satisfies {role:Role;assigned:boolean;active:boolean}[];
describe('M3-PH1-TC02 full transition permission matrix',()=>{
 for(const from of STATUSES)for(const to of STATUSES)for(const actor of actors)for(const proof of [true,false]){
  it([actor.role,actor.active,actor.assigned,from,to,proof].join(' '),()=>{
   const grants=[['ADMIN','REGISTERED','ASSIGNED',false],['RIDER','ASSIGNED','OUT_FOR_DELIVERY',false],['RIDER','OUT_FOR_DELIVERY','DELIVERED',true],['RIDER','OUT_FOR_DELIVERY','FAILED',true]];
   const expected=actor.active && (actor.role!=='RIDER'||actor.assigned) && grants.some(([role,a,b,file])=>role===actor.role&&a===from&&b===to&&file===proof);
   expect(canTransition(actor,from,to,proof).allowed).toBe(expected);
  });
 }
});
describe('M3-PH1-TC03 assignment',()=>{
 it('denies inactive/wrong targets and immutable final states',()=>{
  expect(canAssign({role:'ADMIN',active:true},{role:'SELLER',active:true},'REGISTERED').allowed).toBe(false);
  expect(canAssign({role:'ADMIN',active:true},{role:'RIDER',active:false},'ASSIGNED').allowed).toBe(false);
  expect(canAssign({role:'ADMIN',active:true},{role:'RIDER',active:true},'DELIVERED').allowed).toBe(false);
  expect(canAssign({role:'ADMIN',active:true},{role:'RIDER',active:true},'OUT_FOR_DELIVERY').allowed).toBe(true);
 });
});
