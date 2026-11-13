import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { AppError, classifyError } from './errors';
import { getSettings } from './settings';
import { BACKUP_LOCK_KEY } from '@/shared/constants';
export interface ActorContext { userId: string; sessionVersion: number }
export interface TransactionOptions { actor?: ActorContext; write?: boolean }
export interface PgConnection { query: PoolClient['query']; release: PoolClient['release'] }
export interface TransactionPool { connect(): Promise<PoolClient> }
export async function transaction<T>(pool: TransactionPool, options: TransactionOptions, work: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try { client = await pool.connect(); } catch { throw new AppError('BUSY'); }
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.session_version', $2, true)", [options.actor?.userId ?? '', options.actor ? String(options.actor.sessionVersion) : '']);
    if (options.write) {
      const state = await client.query<{maintenance_mode:boolean;set_until:Date|null}>('SELECT maintenance_mode, set_until FROM app.system_state WHERE id = 1');
      if (state.rows[0]?.maintenance_mode && state.rows[0].set_until && new Date(state.rows[0].set_until).getTime() > Date.now()) throw new AppError('MAINTENANCE');
      const lock=await client.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock_shared($1::bigint) AS locked', [BACKUP_LOCK_KEY]);
      if(!lock.rows[0]?.locked)throw new AppError('MAINTENANCE');
      // Recheck after acquiring the lock: maintenance may have begun after the first read.
      const current=await client.query<{maintenance_mode:boolean;set_until:Date|null}>('SELECT maintenance_mode, set_until FROM app.system_state WHERE id = 1');
      if(current.rows[0]?.maintenance_mode && current.rows[0].set_until && new Date(current.rows[0].set_until).getTime()>Date.now())throw new AppError('MAINTENANCE');
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error instanceof AppError ? error : classifyError(error);
  } finally { client.release(destroy); }
}
const pools = new Map<string,Pool>();
export function getPool(role: 'app_runtime'|'tracking_runtime'): Pool {
  const settings = getSettings();
  if (!pools.has(role)) {
    const pool = new Pool({connectionString:role === 'app_runtime' ? settings.APP_DATABASE_URL : settings.TRACKING_DATABASE_URL, max:settings.DB_POOL_MAX, connectionTimeoutMillis:3000, idleTimeoutMillis:10_000, application_name:'parceltrack-' + role});
    pool.on('error', () => { /* Idle failures are handled on the next acquisition; never log connection URLs. */ });
    pools.set(role,pool);
  }
  return pools.get(role)!;
}
export async function assertConnectedRole(client: PoolClient, expected: string) {
  const result = await client.query<{role:string;bypass:boolean;superuser:boolean;createdb:boolean;createrole:boolean;schema_create:boolean;owner_member:boolean}>(`SELECT current_user AS role, rolbypassrls AS bypass, rolsuper AS superuser,rolcreatedb AS createdb,rolcreaterole AS createrole,
    has_schema_privilege(current_user,'app','CREATE') AS schema_create,
    EXISTS(SELECT 1 FROM pg_catalog.pg_roles owner WHERE owner.rolname=ANY(ARRAY['migration_owner','domain_writer','auth_fn_owner','ops_fn_owner','lookup_fn_owner','maintenance_fn_owner']) AND pg_has_role(current_user,owner.oid,'MEMBER')) AS owner_member
    FROM pg_catalog.pg_roles WHERE rolname=current_user`);
  const role = result.rows[0];
  if (!role || role.role !== expected || role.bypass || role.superuser || role.createdb || role.createrole || role.schema_create || role.owner_member) throw new Error('Restricted runtime role assertion failed.');
}
