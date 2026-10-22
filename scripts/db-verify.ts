import './env';
import { Client } from 'pg';
import { required } from './env';
const owner=new Client({connectionString:required('BOOTSTRAP_DATABASE_URL')});await owner.connect();
const fail=()=>{throw new Error('Database privilege verification failed.');};
try{
 const roles=await owner.query<{rolname:string;rolsuper:boolean;rolbypassrls:boolean;rolcreatedb:boolean;rolcreaterole:boolean}>("SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)",[['app_runtime','tracking_runtime','maintenance_runtime','ops_runtime']]);
 if(roles.rowCount!==4||roles.rows.some(r=>r.rolsuper||r.rolbypassrls||r.rolcreatedb||r.rolcreaterole))fail();
 for(const role of roles.rows){const grants=await owner.query<{bad:boolean}>("SELECT has_schema_privilege($1,'app','CREATE') OR pg_has_role($1,'migration_owner','MEMBER') AS bad",[role.rolname]);if(grants.rows[0].bad)fail();}
 const rls=await owner.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND relname=ANY($1)",[['parcel','parcel_status_history']]);
 if(rls.rowCount!==2||rls.rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity))fail();
 for(const role of ['anon','authenticated','service_role']){
  const result=await owner.query<{bad:boolean}>("SELECT has_schema_privilege($1,'app','USAGE') AS bad",[role]);if(result.rows[0].bad)fail();
 }
 const functions=await owner.query<{proname:string;owner:string;proconfig:string[];public_execute:boolean}>("SELECT p.proname,r.rolname AS owner,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.prosecdef");
 if(functions.rows.some(f=>f.public_execute||!['auth_fn_owner','domain_writer','lookup_fn_owner','maintenance_fn_owner','ops_fn_owner'].includes(f.owner)||!f.proconfig?.some(x=>/search_path=pg_catalog, app, pg_temp/.test(x))))fail();
 const execute=await owner.query<{role:string;can_lock:boolean;can_snapshot:boolean}>("SELECT role,has_function_privilege(role,'app.lock_active_actor(bigint,integer,text[],text,boolean)','EXECUTE') can_lock,has_function_privilege(role,'app.get_login_snapshot(text)','EXECUTE') can_snapshot FROM unnest(ARRAY['app_runtime','tracking_runtime','domain_writer']) role");
 for(const grant of execute.rows)if(grant.can_lock!==(grant.role==='domain_writer')||grant.can_snapshot!==(grant.role==='app_runtime'))fail();
 const app=new Client({connectionString:required('APP_DATABASE_URL')});await app.connect();
 try{
  for(const sql of ['SELECT password_hash FROM app.app_user',"UPDATE app.app_user SET role='ADMIN'",'DELETE FROM app.audit_event','INSERT INTO app.parcel DEFAULT VALUES']){
   let denied=false;try{await app.query(sql);}catch(error){denied=!!error&&typeof error==='object'&&'code' in error&&error.code==='42501';}if(!denied)fail();
  }
 }finally{await app.end();}
 console.log('Restricted roles, forced RLS, function grants and Supabase API-role separation verified.');
}finally{await owner.end();}
