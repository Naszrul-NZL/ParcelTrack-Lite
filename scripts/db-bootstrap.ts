import './env';
import { Client } from 'pg';
import { required } from './env';
const roles=['migration_owner','app_runtime','tracking_runtime','maintenance_runtime','ops_runtime','backup_operator'];
const owners=['domain_writer','auth_fn_owner','lookup_fn_owner','maintenance_fn_owner','ops_fn_owner'];
const db=new Client({connectionString:required('BOOTSTRAP_DATABASE_URL')});
await db.connect();
try {
  await db.query('BEGIN');
  for(const role of roles) {
    const password=required('DB_PASSWORD_'+role.toUpperCase());
    const exists=await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
    if(!exists.rowCount) {
      const quoted=await db.query<{value:string}>('SELECT quote_literal($1::text) AS value',[password]);
      await db.query('CREATE ROLE '+role+' LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE '+(role==='backup_operator'?'BYPASSRLS':'NOBYPASSRLS')+' PASSWORD '+quoted.rows[0].value);
    }
  }
  for(const role of owners) {
    if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await db.query('CREATE ROLE '+role+' NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    await db.query('GRANT '+role+' TO migration_owner WITH INHERIT FALSE, SET TRUE');
  }
  // Supabase's postgres operator is deliberately not a superuser. Give it an
  // explicit SET-only membership while it creates/verifies the owned schema.
  const operator=await db.query<{name:string}>('SELECT quote_ident(current_user) AS name');
  await db.query('GRANT migration_owner TO '+operator.rows[0].name+' WITH INHERIT FALSE, SET TRUE');
  await db.query('CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION migration_owner');
  await db.query('SET LOCAL ROLE migration_owner');
  await db.query('REVOKE ALL ON SCHEMA app FROM PUBLIC,anon,authenticated,service_role');
  await db.query('RESET ROLE');
  await db.query("ALTER ROLE app_runtime SET statement_timeout='10s'");
  await db.query("ALTER ROLE app_runtime SET lock_timeout='3s'");
  await db.query("ALTER ROLE app_runtime SET idle_in_transaction_session_timeout='15s'");
  for(const role of ['maintenance_runtime','ops_runtime'])await db.query('ALTER ROLE '+role+" SET statement_timeout='60s'");
  if(process.env.APP_ENV!=='production') {
    const password=required('DB_PASSWORD_FIXTURE_PROVISIONER');
    if(!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='fixture_provisioner'")).rowCount) {
      const q=await db.query<{value:string}>('SELECT quote_literal($1::text) AS value',[password]);
      await db.query('CREATE ROLE fixture_provisioner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+q.rows[0].value);
    }
    await db.query('GRANT domain_writer,auth_fn_owner TO fixture_provisioner WITH INHERIT FALSE, SET TRUE');
  }
  await db.query('COMMIT');
  console.log('Application roles bootstrapped; existing passwords preserved.');
} catch(error) {
  await db.query('ROLLBACK');
  const info=error as {code?:string;message?:string};
  let message=info.message??'Unknown database failure';
  for(const [key,value] of Object.entries(process.env))if(value&&value.length>8&&/PASSWORD|DATABASE_URL|SECRET|KEY/.test(key))message=message.replaceAll(value,'[REDACTED]');
  // PostgreSQL errors may contain credentials; deliberately omit the raw cause.
  // eslint-disable-next-line preserve-caught-error
  throw new Error('Role bootstrap failed ('+(info.code??'unknown')+'): '+message);
}
finally { await db.end(); }
