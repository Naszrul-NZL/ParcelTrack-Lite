import './env';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { PasswordService, SYNTHETIC_ACCOUNTS } from '../src/server/modules/auth/password';
import { required } from './env';
import { makeTracking } from '../src/server/modules/parcels/tokens';
const url=required('FIXTURE_DATABASE_URL');
// A separate explicit acknowledgement is required even for local data.
if(process.env.APP_ENV==='production' || process.env.ALLOW_SYNTHETIC_FIXTURES!=='local-only' || !/^(127\.0\.0\.1|localhost)$/.test(new URL(url).hostname))throw new Error('Fixture loading is restricted to explicitly acknowledged local test/development databases.');
const password=required('FIXTURE_PASSWORD');
const accounts=SYNTHETIC_ACCOUNTS;
const passwords=new PasswordService();
const db=new Client({connectionString:url});await db.connect();
try {
 await db.query('BEGIN'); await db.query('SET LOCAL ROLE auth_fn_owner');
 for(const [username,role,active,change] of accounts)await db.query('INSERT INTO app.app_user(username,display_name,password_hash,role,is_active,must_change_password) VALUES($1,$1,$2,$3,$4,$5) ON CONFLICT(username) DO NOTHING',[username,await passwords.hash(password),role,active,change]);
 const users=await db.query<{id:string;username:string}>('SELECT id,username FROM app.app_user');
 const ids=Object.fromEntries(users.rows.map(u=>[u.username,u.id]));
 await db.query('SET LOCAL ROLE domain_writer');
 for(const username of ['seller.a','seller.b']) {
  const exists=await db.query('SELECT 1 FROM app.parcel WHERE seller_id=$1',[ids[username]]);
  if(!exists.rowCount) {
   const parcel=await db.query<{id:string}>("INSERT INTO app.parcel(tracking_number,seller_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint) VALUES($1,$2,'Synthetic Recipient','+60000000000','Fictional test address',1.250,'REGISTERED',$3,repeat('a',64)) RETURNING id",[makeTracking(),ids[username],randomUUID()]);
   await db.query("INSERT INTO app.parcel_status_history(parcel_id,changed_by_id,status) VALUES($1,$2,'REGISTERED')",[parcel.rows[0].id,ids[username]]);
  }
 }
 await db.query('COMMIT');console.log('Synthetic fixtures loaded idempotently. No passwords printed.');
} catch {await db.query('ROLLBACK');throw new Error('Fixture loading failed.');}finally{await db.end();}
