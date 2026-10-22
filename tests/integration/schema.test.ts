import { it,expect } from 'vitest';
import '../harness/database';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { makeTracking } from '@/server/modules/parcels/tokens';
it('M2-PH1-TC06 parcel constraints reject invalid weight, status and duplicate keys',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');const user=(await db.query("SELECT id FROM app.app_user WHERE username='seller.a'")).rows[0].id;await db.query('SET LOCAL ROLE domain_writer');
  const token=makeTracking(),request=randomUUID();
  const sql="INSERT INTO app.parcel(tracking_number,seller_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint) VALUES($1,$2,'Synthetic','+60000000000','Fictional', $3,$4,$5,repeat('a',64)) RETURNING id";
  await db.query(sql,[token,user,'1.000','REGISTERED',request]);
  for(const [tracking,weight,status,key,code] of [[makeTracking(),'0','REGISTERED',randomUUID(),'23514'],[makeTracking(),'1','SHIPPED',randomUUID(),'23514'],[token,'1','REGISTERED',randomUUID(),'23505'],[makeTracking(),'1','REGISTERED',request,'23505']]){
   await db.query('SAVEPOINT probe');await expect(db.query(sql,[tracking,user,weight,status,key])).rejects.toMatchObject({code});await db.query('ROLLBACK TO SAVEPOINT probe');
  }
 }finally{await db.query('ROLLBACK');await db.end();}
});
it('M3-PH1-TC07 draft proof constraints work in a rolled-back scratch transaction',async()=>{
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query(await readFile('db/drafts/0006_delivery_proof.sql','utf8'));
  await db.query('SET LOCAL ROLE domain_writer');const parcel=(await db.query('SELECT id,seller_id FROM app.parcel ORDER BY id LIMIT 1')).rows[0];
  const sql='INSERT INTO app.delivery_proof(parcel_id,uploaded_by_id,storage_key,media_type,size_bytes) VALUES($1,$2,$3,$4,$5)';const key=parcel.id+'/'+('a'.repeat(32))+'.jpg';
  for(const [path,type,size] of [['../x','image/jpeg',1],[key,'image/gif',1],[key,'image/jpeg',4194304]]){
   await db.query('SAVEPOINT probe');await expect(db.query(sql,[parcel.id,parcel.seller_id,path,type,size])).rejects.toMatchObject({code:'23514'});await db.query('ROLLBACK TO SAVEPOINT probe');
  }
  await db.query(sql,[parcel.id,parcel.seller_id,key,'image/jpeg',1]);await db.query('SAVEPOINT probe');await expect(db.query(sql,[parcel.id,parcel.seller_id,parcel.id+'/'+('b'.repeat(32))+'.jpg','image/jpeg',1])).rejects.toMatchObject({code:'23505'});await db.query('ROLLBACK TO SAVEPOINT probe');
 }finally{await db.query('ROLLBACK');await db.end();}
});
it('M2-PH1-TC02 gateway does not expose the app schema and Realtime publishes no app tables',async()=>{
 const state=JSON.parse(await readFile('.local/test/credentials.json','utf8'));
 const response=await fetch(process.env.SUPABASE_INTERNAL_URL+'/rest/v1/parcel?select=*',{headers:{apikey:state.anon,Authorization:'Bearer '+state.anon,'Accept-Profile':'app'}});
 expect(response.status).toBe(406);expect((await response.json()).code).toBe('PGRST106');
 const db=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});await db.connect();try{expect((await db.query("SELECT 1 FROM pg_publication_tables WHERE schemaname='app'")).rowCount).toBe(0);}finally{await db.end();}
});
