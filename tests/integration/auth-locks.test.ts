import { it,expect } from 'vitest';
import { Client } from 'pg';
import { runtimePool,checkedClient } from '../harness/database';
it('M1-PH1-TC06 rejects inactive, stale, wrong-role and must-change actors; ignores pg_temp shadows',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
  const users=(await db.query<{id:string;username:string}>('SELECT id,username FROM app.app_user')).rows;
  const id=(name:string)=>users.find(u=>u.username===name)!.id;
  await db.query('RESET ROLE');
  await db.query('CREATE TEMP TABLE app_user (id bigint,is_active boolean)');
  await db.query('SET LOCAL ROLE domain_writer');
  for(const [name,version,roles,expected] of [['inactive',1,['RIDER'],'PT012'],['seller.a',2,['SELLER'],'PT012'],['seller.a',1,['ADMIN'],'PT001'],['must.change',1,['RIDER'],'PT008']] as const){
   await db.query('SAVEPOINT probe');
   await expect(db.query('SELECT app.lock_active_actor($1,$2,$3)',[id(name),version,roles])).rejects.toMatchObject({code:expected});await db.query('ROLLBACK TO SAVEPOINT probe');
  }
  expect((await db.query('SELECT app.lock_active_actor($1,1,$2) AS role',[id('seller.a'),['SELLER']])).rows[0].role).toBe('SELLER');
 }finally{await db.query('ROLLBACK');await db.end();}
});
it('M3-PH1-TC01 asserts the separate tracking role and denies actor locks',async()=>{
 const pool=runtimePool('tracking_runtime');const client=await checkedClient(pool,'tracking_runtime');
 try{await expect(client.query("SELECT app.lock_active_actor(1,1,ARRAY['SELLER'])")).rejects.toMatchObject({code:'42501'});}finally{client.release();await pool.end();}
});
