import 'server-only';
import type { PoolClient } from 'pg';
import { ROLES, type Role } from '@/shared/constants';
import { transaction, getPool, assertConnectedRole, type TransactionPool } from './db';
import { getSettings, type Settings } from './settings';
import { requireRole, type AuthContext } from '@/server/modules/auth/principal';
import { readSessionContext } from '@/server/modules/auth/session-context';
import { verifyCsrf } from '@/server/modules/auth/csrf';

export type PrincipalWork<T> = (client: PoolClient, principal: AuthContext) => Promise<T>;
export type PrincipalOptions = { roles?: readonly Role[] };

export function createPrincipalUow(pool: TransactionPool, settings: Pick<Settings, 'APP_ORIGIN' | 'SESSION_COOKIE_NAME'>) {
  return async function authorized<T>(request: Request, options: PrincipalOptions, work: PrincipalWork<T>): Promise<T> {
    const mutation = !['GET', 'HEAD'].includes(request.method);
    return transaction(pool, { write: mutation }, async client => {
      await assertConnectedRole(client, 'app_runtime');
      const { principal, csrfToken } = await readSessionContext(client, request, settings.SESSION_COOKIE_NAME);
      requireRole(principal, ...(options.roles ?? ROLES));
      if (mutation) verifyCsrf(request, csrfToken, settings.APP_ORIGIN);
      await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.session_version',$2,true)", [principal.id, String(principal.sessionVersion)]);
      // Domain write functions acquire/recheck actor locks before parcel locks.
      // This wrapper never gives runtime services a function-owner connection.
      return work(client, principal);
    });
  };
}

export function principalUow<T>(request: Request, options: PrincipalOptions, work: PrincipalWork<T>) {
  return createPrincipalUow(getPool('app_runtime'), getSettings())(request, options, work);
}
