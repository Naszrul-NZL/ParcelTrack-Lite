import { it,expect } from 'vitest';
import { Client } from 'pg';
import { runner } from 'node-pg-migrate';
import { randomUUID } from 'node:crypto';
import { makeTracking } from '@/server/modules/parcels/tokens';
import { PasswordService } from '@/server/modules/auth/password';

async function scratchDatabase(run:(url:string)=>Promise<void>){
 const operator=new Client({connectionString:process.env.BOOTSTRAP_DATABASE_URL});await operator.connect();
 const name='erd_'+randomUUID().replaceAll('-','');
 let created=false;
 try{
  await operator.query('CREATE DATABASE '+name+' OWNER migration_owner');created=true;
  const url=new URL(process.env.MIGRATION_DATABASE_URL!);url.pathname='/'+name;
  await run(url.toString());
 }finally{
  try{
   if(created){await operator.query('SET ROLE migration_owner');await operator.query('DROP DATABASE '+name);}
  }finally{await operator.end();}
 }
}

async function migrate(url:string,count?:number){
 await runner({databaseUrl:url,dir:'db/migrations',direction:'up',count,migrationsTable:'schema_migrations',schema:'app',createSchema:true,checkOrder:true,singleTransaction:true,log:()=>{}});
}

async function seed(db:Client){
 const hash=await new PasswordService().hash(randomUUID());
 await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
 const users=(await db.query<{id:string;role:string}>(`INSERT INTO app.app_user(username,display_name,password_hash,role)
  VALUES('erd.seller','Seller',$1,'SELLER'),('erd.rider','Rider',$1,'RIDER'),('erd.admin','Admin',$1,'ADMIN') RETURNING id,role`,[hash])).rows;
 const seller=users.find(u=>u.role==='SELLER')!.id,rider=users.find(u=>u.role==='RIDER')!.id;
 await db.query('SET LOCAL ROLE domain_writer');
 const parcel=(await db.query(`INSERT INTO app.parcel(tracking_number,seller_id,assigned_rider_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint)
  VALUES($1,$2,$3,'Synthetic','+60000000000','Fictional',1,'REGISTERED',$4,repeat('a',64)) RETURNING id`,[makeTracking(),seller,rider,randomUUID()])).rows[0].id;
 await db.query("INSERT INTO app.parcel_status_history(parcel_id,changed_by_id,status) VALUES($1,$2,'REGISTERED')",[parcel,seller]);
 await db.query('COMMIT');
 return {seller,rider,parcel,hash};
}

it('ERD migrations install on an empty database and create subclasses for committed new accounts',async()=>{
 await scratchDatabase(async url=>{
  await migrate(url);
  const db=new Client({connectionString:url});await db.connect();
  try{
   const seeded=await seed(db);
   await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
   for(const table of ['seller','rider','admin'])expect((await db.query('SELECT user_id FROM app.'+table)).rowCount).toBe(1);
   await db.query('SET LOCAL ROLE domain_writer');
   expect((await db.query('SELECT id FROM app.parcel_status_history WHERE parcel_id=$1',[seeded.parcel])).rowCount).toBe(1);
   await db.query("INSERT INTO app.delivery_proof(parcel_id,uploaded_by_id,storage_key,media_type,size_bytes) VALUES($1,$2,$3,'image/png',1)",[seeded.parcel,seeded.rider,seeded.parcel+'/'+('a'.repeat(32))+'.png']);
   await db.query('COMMIT');
   await migrate(url);
  }finally{await db.query('ROLLBACK');await db.end();}
 });
});

it('ERD forward migration rejects invalid legacy data atomically and preserves valid accounts/parcels/history',async()=>{
 await scratchDatabase(async url=>{
  await migrate(url,3);
  const db=new Client({connectionString:url});await db.connect();
  try{
   const seeded=await seed(db);
   await db.query('BEGIN');await db.query('SET LOCAL ROLE domain_writer');
   await db.query('UPDATE app.parcel SET assigned_rider_id=seller_id');await db.query('COMMIT');
   await expect(migrate(url)).rejects.toMatchObject({code:'23503'});
   expect((await db.query("SELECT to_regclass('app.seller') AS table")).rows[0].table).toBeNull();
   expect((await db.query('SELECT name FROM app.schema_migrations')).rowCount).toBe(3);
   await db.query('BEGIN');await db.query('SET LOCAL ROLE domain_writer');
   await db.query('UPDATE app.parcel SET assigned_rider_id=$1',[seeded.rider]);
   const missing=(await db.query(`INSERT INTO app.parcel(tracking_number,seller_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint)
    VALUES($1,$2,'Synthetic','+60000000000','Fictional',1,'REGISTERED',$3,repeat('a',64)) RETURNING id`,[makeTracking(),seeded.seller,randomUUID()])).rows[0].id;
   await db.query('COMMIT');
   await expect(migrate(url)).rejects.toMatchObject({code:'23514'});
   expect((await db.query("SELECT to_regclass('app.seller') AS table")).rows[0].table).toBeNull();
   await db.query('BEGIN');await db.query('SET LOCAL ROLE domain_writer');
   await db.query("INSERT INTO app.parcel_status_history(parcel_id,changed_by_id,status) VALUES($1,$2,'REGISTERED')",[missing,seeded.seller]);
   await db.query('COMMIT');
   await migrate(url);
   expect((await db.query('SELECT password_hash FROM app.app_user WHERE id=$1',[seeded.seller])).rows[0].password_hash).toBe(seeded.hash);
   await db.query('BEGIN');await db.query('SET LOCAL ROLE auth_fn_owner');
   expect((await db.query('SELECT user_id FROM app.seller WHERE user_id=$1',[seeded.seller])).rowCount).toBe(1);
   await db.query('SET LOCAL ROLE domain_writer');
   expect((await db.query('SELECT assigned_rider_id FROM app.parcel WHERE id=$1',[seeded.parcel])).rows[0].assigned_rider_id).toBe(seeded.rider);
   expect((await db.query('SELECT id FROM app.parcel_status_history')).rowCount).toBe(2);
   await db.query('COMMIT');
  }finally{await db.query('ROLLBACK');await db.end();}
 });
});
