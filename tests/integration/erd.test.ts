import { it,expect } from 'vitest';
import { Client,type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { makeTracking } from '@/server/modules/parcels/tokens';
import { transaction } from '@/server/core/db';
import { runtimePool } from '../harness/database';

async function probe(db:Client,sql:string,params:unknown[],code:string){
 await db.query('SAVEPOINT probe');
 await expect(db.query(sql,params)).rejects.toMatchObject({code});
 await db.query('ROLLBACK TO SAVEPOINT probe');
}

it('ERD backfilled accounts have exactly one subclass matching their role',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
  const rows=(await db.query(`SELECT u.role,s.user_id IS NOT NULL seller,r.user_id IS NOT NULL rider,a.user_id IS NOT NULL admin
   FROM app.app_user u LEFT JOIN app.seller s ON s.user_id=u.id
   LEFT JOIN app.rider r ON r.user_id=u.id LEFT JOIN app.admin a ON a.user_id=u.id`)).rows;
  expect(rows.length).toBeGreaterThan(0);
  for(const row of rows)expect([row.seller,row.rider,row.admin]).toEqual(['SELLER','RIDER','ADMIN'].map(role=>role===row.role));
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('ERD creates subclass membership automatically and guards disjointness, completeness and role changes',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
  const username='erd.'+randomUUID();
  const id=(await db.query(`INSERT INTO app.app_user(username,display_name,password_hash,role)
   SELECT $1,$1,password_hash,'SELLER' FROM app.app_user WHERE username='seller.a' RETURNING id`,[username])).rows[0].id;
  expect((await db.query('SELECT user_id FROM app.seller WHERE user_id=$1',[id])).rowCount).toBe(1);
  await probe(db,'INSERT INTO app.rider(user_id) VALUES($1)',[id],'23514');
  await probe(db,'DELETE FROM app.seller WHERE user_id=$1',[id],'23514');
  for(const [role,table] of [['RIDER','rider'],['ADMIN','admin'],['SELLER','seller']]){
   await db.query('UPDATE app.app_user SET role=$1 WHERE id=$2',[role,id]);
   expect((await db.query('SELECT user_id FROM app.'+table+' WHERE user_id=$1',[id])).rowCount).toBe(1);
   expect((await db.query(`SELECT (SELECT count(*) FROM app.seller WHERE user_id=$1)
    +(SELECT count(*) FROM app.rider WHERE user_id=$1)+(SELECT count(*) FROM app.admin WHERE user_id=$1) count`,[id])).rows[0].count).toBe('1');
  }
  const seller=(await db.query("SELECT id FROM app.app_user WHERE username='seller.a'")).rows[0].id;
  await probe(db,"UPDATE app.app_user SET role='RIDER' WHERE id=$1",[seller],'23503');
  expect((await db.query('SELECT role FROM app.app_user WHERE id=$1',[seller])).rows[0].role).toBe('SELLER');
  await db.query('RESET ROLE');
  await db.query('DELETE FROM app.app_user WHERE id=$1',[id]);
  await db.query('SET LOCAL ROLE auth_fn_owner');
  expect((await db.query('SELECT user_id FROM app.seller WHERE user_id=$1',[id])).rowCount).toBe(0);
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('ERD parcel foreign keys reject wrong roles while allowing an unassigned parcel',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  const seller=(await db.query("SELECT id FROM app.app_user WHERE username='seller.a'")).rows[0].id;
  const rider=(await db.query("SELECT id FROM app.app_user WHERE role='RIDER' LIMIT 1")).rows[0].id;
  await db.query('SET LOCAL ROLE domain_writer');
  const sql=`INSERT INTO app.parcel(tracking_number,seller_id,assigned_rider_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint)
   VALUES($1,$2,$3,'Synthetic','+60000000000','Fictional',1,'REGISTERED',$4,repeat('a',64)) RETURNING id,assigned_rider_id`;
  await probe(db,sql,[makeTracking(),rider,null,randomUUID()],'23503');
  await probe(db,sql,[makeTracking(),seller,seller,randomUUID()],'23503');
  expect((await db.query(sql,[makeTracking(),seller,null,randomUUID()])).rows[0].assigned_rider_id).toBeNull();
  expect((await db.query(sql,[makeTracking(),seller,rider,randomUUID()])).rows[0].assigned_rider_id).toBe(rider);
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('ERD checks initial history at transaction end and prevents history removal',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');const seller=(await db.query("SELECT id FROM app.app_user WHERE username='seller.a'")).rows[0].id;
  await db.query('SET LOCAL ROLE domain_writer');
  const id=(await db.query(`INSERT INTO app.parcel(tracking_number,seller_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint)
   VALUES($1,$2,'Synthetic','+60000000000','Fictional',1,'REGISTERED',$3,repeat('a',64)) RETURNING id`,[makeTracking(),seller,randomUUID()])).rows[0].id;
  await probe(db,'SET CONSTRAINTS ALL IMMEDIATE',[],'23514');
  await db.query("INSERT INTO app.parcel_status_history(parcel_id,changed_by_id,status) VALUES($1,$2,'REGISTERED')",[id,seller]);
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await probe(db,'DELETE FROM app.parcel_status_history WHERE parcel_id=$1',[id],'42501');
  await probe(db,"UPDATE app.parcel_status_history SET status='DELIVERED' WHERE parcel_id=$1",[id],'42501');
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('ERD proof metadata follows parcel access and runtime cannot mutate subclasses or proofs',async()=>{
 const db=new Client({connectionString:process.env.BOOTSTRAP_DATABASE_URL});await db.connect();
 const pool=runtimePool();
 try{
  await db.query('BEGIN');
  // This grant rolls back with the probe; it permits a real runtime-role check
  // against uncommitted rows without leaving synthetic proof data behind.
  await db.query('GRANT app_runtime TO migration_owner WITH INHERIT FALSE, SET TRUE');
  await db.query('SET LOCAL ROLE migration_owner');
  const users=(await db.query<{id:string;username:string}>("SELECT id,username FROM app.app_user WHERE username IN ('seller.a','seller.b','admin')")).rows;
  const sellerA=users.find(u=>u.username==='seller.a')!.id,sellerB=users.find(u=>u.username==='seller.b')!.id,admin=users.find(u=>u.username==='admin')!.id;
  const rider=(await db.query("SELECT id FROM app.app_user WHERE role='RIDER' AND is_active AND NOT must_change_password LIMIT 1")).rows[0].id;
  await db.query('SET LOCAL ROLE domain_writer');
  const parcel=(await db.query('SELECT id FROM app.parcel WHERE seller_id=$1 LIMIT 1',[sellerA])).rows[0].id;
  await db.query('UPDATE app.parcel SET assigned_rider_id=$1 WHERE id=$2',[rider,parcel]);
  await db.query("INSERT INTO app.delivery_proof(parcel_id,uploaded_by_id,storage_key,media_type,size_bytes) VALUES($1,$2,$3,'image/jpeg',1)",[parcel,rider,parcel+'/'+randomUUID().replaceAll('-','')+'.jpg']);
  // Switch to the web role on the same connection to see this uncommitted probe.
  await db.query('RESET ROLE');await db.query('SET LOCAL ROLE app_runtime');
  for(const [actor,visible] of [[sellerA,1],[sellerB,0],[rider,1],[admin,1]] as const){
   await db.query("SELECT set_config('app.user_id',$1,true),set_config('app.session_version','1',true)",[actor]);
   expect((await db.query('SELECT id FROM app.delivery_proof WHERE parcel_id=$1',[parcel])).rowCount).toBe(visible);
  }
  await db.query("SELECT set_config('app.user_id','',true)");
  expect((await db.query('SELECT id FROM app.delivery_proof')).rowCount).toBe(0);
  await probe(db,'INSERT INTO app.delivery_proof DEFAULT VALUES',[],'42501');
  await probe(db,'DELETE FROM app.rider',[],'42501');
  await probe(db,'SELECT app.sync_user_subclass()',[],'42501');
  expect(await transaction(pool,{},async(client:PoolClient)=>(await client.query('SELECT id FROM app.delivery_proof')).rowCount)).toBe(0);
 }finally{await db.query('ROLLBACK');await db.end();await pool.end();}
});
