import type { ParcelStatus, Role } from '@/shared/constants';
export type Decision = {allowed:true} | {allowed:false; code:'FORBIDDEN'|'INVALID_TRANSITION'|'PROOF_REQUIRED'|'PROOF_NOT_ALLOWED'|'INVALID_ASSIGNEE'};
export function canTransition(actor: {role:Role;active:boolean;assigned:boolean}, from:ParcelStatus, to:ParcelStatus, proof:boolean): Decision {
  if (!actor.active) return {allowed:false,code:'FORBIDDEN'};
  if (actor.role === 'ADMIN' && from === 'REGISTERED' && to === 'ASSIGNED') return proof ? {allowed:false,code:'PROOF_NOT_ALLOWED'} : {allowed:true};
  if (actor.role !== 'RIDER' || !actor.assigned) return {allowed:false,code:'FORBIDDEN'};
  if (from === 'ASSIGNED' && to === 'OUT_FOR_DELIVERY') return proof ? {allowed:false,code:'PROOF_NOT_ALLOWED'} : {allowed:true};
  if (from === 'OUT_FOR_DELIVERY' && (to === 'DELIVERED' || to === 'FAILED')) return proof ? {allowed:true} : {allowed:false,code:'PROOF_REQUIRED'};
  return {allowed:false,code:'INVALID_TRANSITION'};
}
export function canAssign(actor:{role:Role;active:boolean}, target:{role:Role;active:boolean}, status:ParcelStatus): Decision {
  if (!actor.active || actor.role !== 'ADMIN') return {allowed:false,code:'FORBIDDEN'};
  if (!target.active || target.role !== 'RIDER') return {allowed:false,code:'INVALID_ASSIGNEE'};
  return status === 'DELIVERED' || status === 'FAILED' ? {allowed:false,code:'INVALID_TRANSITION'} : {allowed:true};
}
export function requiredNextActions(status: ParcelStatus) {
  return status === 'REGISTERED' ? ['ASSIGN'] : status === 'ASSIGNED' ? ['START_DELIVERY'] : status === 'OUT_FOR_DELIVERY' ? ['DELIVER_WITH_PROOF','FAIL_WITH_PROOF'] : [];
}
