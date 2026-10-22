import { describe,it,expect } from 'vitest';
import { parseSettings } from '@/server/core/settings';
import { errorResponse } from '@/server/core/errors';
import { redact } from '@/server/core/logging';
import { PasswordService } from '@/server/modules/auth/password';
import { sourceAddress } from '@/server/core/request';
import { z } from 'zod';
const configured={APP_ENV:'development',APP_ORIGIN:'http://localhost:3000',APP_DATABASE_URL:'postgresql://restricted@localhost/test',TRACKING_DATABASE_URL:'postgresql://tracking@localhost/test',SUPABASE_INTERNAL_URL:'http://localhost:8000',STORAGE_SERVICE_KEY:'a'.repeat(40),FINGERPRINT_KEY:'b'.repeat(40),RATE_LIMIT_KEY:'c'.repeat(40),SESSION_COOKIE_NAME:'ptl_session_dev'};
describe('M1-PH1-TC01/02/03/04 security core',()=>{
 it('fails closed without exposing supplied configuration',()=>{
  expect(()=>parseSettings({...configured,APP_ENV:'production',FAILPOINT_COMMIT:'1'})).toThrow('Test-only');
  expect(()=>parseSettings({...configured,FINGERPRINT_KEY:'canary-secret'})).toThrow('Required application configuration');
  expect(()=>parseSettings({...configured,RATE_LIMIT_KEY:configured.FINGERPRINT_KEY})).toThrow('Independent');
 });
 it('keeps input out of validation and internal error responses',async()=>{
  const result=z.strictObject({password:z.string().min(10)}).safeParse({password:'CANARY'});
  if(result.success)throw new Error('Expected invalid input');
  const response=errorResponse(result.error);expect(response.status).toBe(422);expect(await response.text()).not.toContain('CANARY');
  expect(await errorResponse(new Error('CANARY private SQL')).text()).not.toContain('CANARY');
 });
 it('redacts nested secrets, headers and exception messages',()=>expect(JSON.stringify(redact({password:'CANARY',nested:{recipientName:'CANARY',cookie:'CANARY'},error:new Error('CANARY')}))).not.toContain('CANARY'));
 it('hashes with Argon2id and rejects short/common passwords',async()=>{
  const service=new PasswordService(1);expect(()=>service.hash('short')).toThrow();expect(()=>service.hash('password123')).toThrow();const hash=await service.hash('DifferentLocalValue!');expect(hash).toMatch(/^\$argon2id\$/);expect(await service.verify(hash,'DifferentLocalValue!')).toBe(true);expect(await service.verify(hash,'incorrect')).toBe(false);expect(await service.verify(null,'incorrect')).toBe(false);
 });
 it('rejects forged source headers without a trusted adapter',()=>{
  const old=process.env.PTL_ADAPTER_SECRET;process.env.PTL_ADAPTER_SECRET='trusted-server-secret';
  try{expect(()=>sourceAddress(new Request('http://localhost',{headers:{'x-forwarded-for':'1.2.3.4','x-ptl-client-ip':'1.2.3.4'}}))).toThrow();}finally{if(old)process.env.PTL_ADAPTER_SECRET=old;else delete process.env.PTL_ADAPTER_SECRET;}
 });
});
