import { beforeAll,afterAll,it,expect } from 'vitest';
import { Client } from 'pg';
import { runtimePool,checkedClient } from '../harness/database';
import { transaction,assertConnectedRole } from '@/server/core/db';
import { STATUSES,ROLES,AUDIT_TYPES } from '@/shared/constants';
const pool=runtimePool();
const owner=new Client({connectionString:process.env.BOOTSTRAP_DATABASE_URL});
let sellerA:string,sellerB:string;
beforeAll(async()=>{
 await owner.connect();const result=await owner.query<{id:string;username:string}>("SELECT id,username FROM app.app_user WHERE username=ANY($1)",[['seller.a','seller.b']]);
 sellerA=result.rows.find(r=>r.username==='seller.a')?.id??'';sellerB=result.rows.find(r=>r.username==='seller.b')?.id??'';
 if(!sellerA||!sellerB)throw new Error('Run the guarded synthetic fixture command before integration tests.');
});
afterAll(async()=>{await pool.end();await owner.end();});
it('M2-PH1-TC04/11 enforces identity and clears context after commit/rollback',async()=>{
 for(const id of [sellerA,sellerB]){
  const rows=await transaction(pool,{actor:{userId:id,sessionVersion:1}},async db=>(await db.query<{seller_id:string}>('SELECT seller_id FROM app.parcel')).rows);
  expect(rows.length).toBeGreaterThan(0);expect(rows.every(r=>r.seller_id===id)).toBe(true);
 }
 await expect(transaction(pool,{actor:{userId:sellerA,sessionVersion:1}},async()=>{throw new Error('rollback probe');})).rejects.toThrow();
 const client=await checkedClient(pool);try{expect((await client.query('SELECT * FROM app.parcel')).rowCount).toBe(0);await client.query('BEGIN');await client.query("SELECT set_config('app.user_id','garbage',true)");expect((await client.query('SELECT * FROM app.parcel')).rowCount).toBe(0);await client.query('ROLLBACK');}finally{client.release();}
});
it('M1-PH1-TC14 runtime cannot read hashes, change roles or rewrite audit',async()=>{
 const client=await checkedClient(pool);try{
  for(const sql of ['SELECT password_hash FROM app.app_user',"UPDATE app.app_user SET role='ADMIN'",'DELETE FROM app.audit_event','INSERT INTO app.parcel DEFAULT VALUES'])await expect(client.query(sql)).rejects.toMatchObject({code:'42501'});
  expect((await client.query("SELECT * FROM app.get_login_snapshot('seller.a')")).rows[0].password_hash).toMatch(/^\$argon2id\$/);
 }finally{client.release();}
});
it('M3-PH1-TC01 harness rejects the owner connection',async()=>{await expect(assertConnectedRole(owner as unknown as import('pg').PoolClient,'app_runtime')).rejects.toThrow('Restricted runtime role');});
it('M2-PH1-TC06 schema roles and statuses match shared contracts',async()=>{
 const result=await owner.query<{def:string}>("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='app.parcel'::regclass AND contype='c'");
 const values=(rows:{def:string}[])=>[...new Set(rows.flatMap(r=>[...r.def.matchAll(/'([A-Z_]+)'/g)].map(m=>m[1])))].sort();
 expect(values(result.rows)).toEqual([...STATUSES].sort());
 for(const [table,column,expected] of [['app_user','role',ROLES],['audit_event','event_type',AUDIT_TYPES]] as const){const constraints=await owner.query<{def:string}>("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE $2",['app.'+table,'%'+column+'%']);expect(values(constraints.rows)).toEqual([...expected].sort());}
 const rel=await owner.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.parcel'::regclass");expect(rel.rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
});
it('M1-PH1-TC06 locks active actors through the private function and denies web calls',async()=>{
 const client=await pool.connect();try{await expect(client.query('SELECT app.lock_active_actor($1,1,$2)',[sellerA,['SELLER']])).rejects.toMatchObject({code:'42501'});}finally{client.release();}
 await owner.query('BEGIN');try{await owner.query('SET LOCAL ROLE domain_writer');expect((await owner.query('SELECT app.lock_active_actor($1,1,$2) role',[sellerA,['SELLER']])).rows[0].role).toBe('SELLER');}finally{await owner.query('ROLLBACK');}
});
