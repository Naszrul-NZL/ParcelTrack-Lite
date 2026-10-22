import './env';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import sharp from 'sharp';
import { required } from './env';
import { SupabaseProofStore,makeStorageKey } from '../src/server/modules/delivery/storage';
if(process.env.PTL_PROFILE!=='test'||process.env.APP_ENV!=='test')throw new Error('Persistence probe requires the isolated test profile.');
const file='.local/test/persistence-probe.json';
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const db=new Client({connectionString:required('MIGRATION_DATABASE_URL')});await db.connect();
const store=new SupabaseProofStore(required('SUPABASE_INTERNAL_URL'),required('STORAGE_SERVICE_KEY'));
try{
 const users=await db.query('SELECT id,username,password_hash,role,is_active,session_version FROM app.app_user ORDER BY id');
 const counts=await db.query('SELECT (SELECT count(*) FROM app.parcel) parcels,(SELECT count(*) FROM app.parcel_status_history) history');
 const grants=await db.query("SELECT proname,proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' ORDER BY proname");
 const snapshot=digest(JSON.stringify([users.rows,counts.rows,grants.rows]));
 const credentials=digest(await fs.readFile('.local/test/credentials.json'));
 if(process.argv.includes('--capture')){
  const key=makeStorageKey('999997','png');const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#152e48'}}).png().toBuffer();await store.publish(key,bytes,'image/png');
  await fs.writeFile(file,JSON.stringify({snapshot,credentials,key,bytes:digest(bytes)}),{mode:0o600});
  console.log('Private database, credential and Storage persistence fingerprints captured.');
 }else{
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  if(saved.snapshot!==snapshot||saved.credentials!==credentials||digest(await store.open(saved.key))!==saved.bytes)throw new Error('Local persistence verification failed.');
  await store.delete(saved.key);console.log('Credentials, account hashes, grants, fixture counts and private Storage bytes survived repeat setup and container recreation.');
 }
}finally{await db.end();}
