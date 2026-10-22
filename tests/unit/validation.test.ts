import { describe,it,expect } from 'vitest';
import { parcelInputSchema,passwordSchema,phoneSchema,weightSchema,publicTrackingSchema,principalSchema,trackingInputSchema } from '@/shared/schemas';
import { makeTracking } from '@/server/modules/parcels/tokens';
describe('M2-PH1-TC08/09/10 strict schemas and tracking',()=>{
 for(const [raw,expected] of [['012-345 6789','+60123456789'],['+60 12-345 6789','+60123456789']])it('normalizes phone '+raw,()=>expect(phoneSchema.parse(raw)).toBe(expected));
 for(const raw of ['+0123','60123456789','+1234567890123456'])it('rejects phone '+raw,()=>expect(phoneSchema.safeParse(raw).success).toBe(false));
 for(const raw of ['0','100.001','1.0001','-1','NaN','1e2','Infinity'])it('rejects weight '+raw,()=>expect(weightSchema.safeParse(raw).success).toBe(false));
 for(const [raw,expected] of [['0.001','0.001'],['100','100.000'],['1.5','1.500']])it('preserves exact decimal '+raw,()=>expect(weightSchema.parse(raw)).toBe(expected));
 it('enforces Unicode character boundaries without truncation',()=>{
  expect(passwordSchema.safeParse('😀'.repeat(9)).success).toBe(false);expect(passwordSchema.parse('😀'.repeat(10))).toHaveLength(20);expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
 });
 it('rejects role injection and recipient leaks in DTOs',()=>{
  expect(publicTrackingSchema.safeParse({history:[],recipientName:'private'}).success).toBe(false);
  expect(principalSchema.safeParse({id:'1',username:'seller',displayName:'Seller',role:'SELLER',mustChangePassword:false,passwordHash:'private'}).success).toBe(false);
  expect(parcelInputSchema.safeParse({recipientName:'a',recipientPhone:'0123456789',recipientAddress:'x',weightKg:'1',clientRequestId:'c7b68883-12da-4b49-b54e-5627884c103b',role:'ADMIN'}).success).toBe(false);
 });
 it('uses 16 random bytes and normalizes complete tokens',()=>{
  let requested=0;const token=makeTracking(n=>{requested=n;return new Uint8Array(n).fill(171);});expect(requested).toBe(16);expect(token).toBe('PTL-'+'AB'.repeat(16));expect(trackingInputSchema.parse({trackingNumber:' '+token.toLowerCase()+' '}).trackingNumber).toBe(token);
 });
});
