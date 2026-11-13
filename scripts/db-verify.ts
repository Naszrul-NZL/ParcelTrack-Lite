import './env';
import { Client } from 'pg';
import { required } from './env';
const owner=new Client({connectionString:required('BOOTSTRAP_DATABASE_URL')});await owner.connect();
const fail=()=>{throw new Error('Database privilege verification failed.');};
try{
 const roles=await owner.query<{rolname:string;rolsuper:boolean;rolbypassrls:boolean;rolcreatedb:boolean;rolcreaterole:boolean}>("SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)",[['app_runtime','tracking_runtime','maintenance_runtime','ops_runtime']]);
 if(roles.rowCount!==4||roles.rows.some(r=>r.rolsuper||r.rolbypassrls||r.rolcreatedb||r.rolcreaterole))fail();
 for(const role of roles.rows){const grants=await owner.query<{bad:boolean}>("SELECT has_schema_privilege($1,'app','CREATE') OR pg_has_role($1,'migration_owner','MEMBER') AS bad",[role.rolname]);if(grants.rows[0].bad)fail();}
 const rls=await owner.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND relname=ANY($1)",[['seller','rider','admin','parcel','parcel_status_history','delivery_proof']]);
 if(rls.rowCount!==6||rls.rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity))fail();
 const foreignKeys=await owner.query<{conname:string;target:string}>("SELECT conname,confrelid::regclass::text target FROM pg_constraint WHERE connamespace='app'::regnamespace AND contype='f' AND conname=ANY($1)",[['parcel_seller_id_fkey','parcel_assigned_rider_id_fkey','delivery_proof_uploaded_by_id_fkey']]);
 const targets:Record<string,string>={parcel_seller_id_fkey:'app.seller',parcel_assigned_rider_id_fkey:'app.rider',delivery_proof_uploaded_by_id_fkey:'app.rider'};
 if(foreignKeys.rowCount!==3||foreignKeys.rows.some(f=>targets[f.conname]!==f.target))fail();
 await owner.query('BEGIN');await owner.query('SET LOCAL ROLE auth_fn_owner');
 const membership=await owner.query<{bad:boolean}>(`SELECT EXISTS(SELECT 1 FROM app.app_user u
  LEFT JOIN app.seller s ON s.user_id=u.id LEFT JOIN app.rider r ON r.user_id=u.id LEFT JOIN app.admin a ON a.user_id=u.id
  WHERE (s.user_id IS NOT NULL)::integer+(r.user_id IS NOT NULL)::integer+(a.user_id IS NOT NULL)::integer<>1
   OR (u.role='SELLER')<>(s.user_id IS NOT NULL) OR (u.role='RIDER')<>(r.user_id IS NOT NULL) OR (u.role='ADMIN')<>(a.user_id IS NOT NULL)) bad`);
 await owner.query('ROLLBACK');if(membership.rows[0].bad)fail();
 for(const role of ['anon','authenticated','service_role']){
  const result=await owner.query<{bad:boolean}>("SELECT has_schema_privilege($1,'app','USAGE') AS bad",[role]);if(result.rows[0].bad)fail();
 }
 const functions=await owner.query<{proname:string;owner:string;proconfig:string[];public_execute:boolean}>("SELECT p.proname,r.rolname AS owner,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.prosecdef");
 if(functions.rows.some(f=>f.public_execute||!['auth_fn_owner','domain_writer','lookup_fn_owner','maintenance_fn_owner','ops_fn_owner'].includes(f.owner)||!f.proconfig?.some(x=>/search_path=pg_catalog, app, pg_temp/.test(x))))fail();
 const execute=await owner.query<{role:string;can_lock:boolean;can_snapshot:boolean}>("SELECT role,has_function_privilege(role,'app.lock_active_actor(bigint,integer,text[],text,boolean)','EXECUTE') can_lock,has_function_privilege(role,'app.get_login_snapshot(text)','EXECUTE') can_snapshot FROM unnest(ARRAY['app_runtime','tracking_runtime','domain_writer']) role");
 for(const grant of execute.rows)if(grant.can_lock!==(grant.role==='domain_writer')||grant.can_snapshot!==(grant.role==='app_runtime'))fail();
 const app=new Client({connectionString:required('APP_DATABASE_URL')});await app.connect();
 try{
  for(const sql of ['SELECT password_hash FROM app.app_user',"UPDATE app.app_user SET role='ADMIN'",'DELETE FROM app.audit_event','INSERT INTO app.parcel DEFAULT VALUES','DELETE FROM app.seller','INSERT INTO app.delivery_proof DEFAULT VALUES','SELECT app.sync_user_subclass()']){
   let denied=false;try{await app.query(sql);}catch(error){denied=!!error&&typeof error==='object'&&'code' in error&&error.code==='42501';}if(!denied)fail();
  }
 }finally{await app.end();}
 console.log('Restricted roles, forced RLS, function grants and Supabase API-role separation verified.');
}finally{await owner.end();}
