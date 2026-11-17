import 'server-only';
import type { PoolClient } from 'pg';
import type { Role } from '@/shared/constants';
import { LIMITS } from '@/shared/constants';
import { AppError } from '@/server/core/errors';
import type { AuthContext } from './principal';
import { readCookieToken, tokenDigest, touchSession } from './sessions';

export function sessionDigest(request: Request, cookieName: string) {
  const token = readCookieToken(request, cookieName);
  if (!token) throw new AppError('UNAUTHENTICATED');
  return tokenDigest(token);
}

export async function readSessionContext(client: PoolClient, request: Request, cookieName: string) {
  const digest = sessionDigest(request, cookieName);
  const result = await client.query<{
    id: string; username: string; display_name: string; role: Role;
    must_change_password: boolean; session_version: number; csrf_token: string;
  }>(`SELECT u.id,u.username,u.display_name,u.role,u.must_change_password,u.session_version,s.csrf_token
    FROM app.auth_session s JOIN app.app_user u ON u.id=s.user_id
    WHERE s.token_digest=$1 AND u.is_active AND u.session_version=s.user_session_version
      AND s.expires_at>now() AND s.absolute_expires_at>now()
      AND s.last_seen_at>now()-($2::integer * interval '1 minute')`, [digest, LIMITS.idleMinutes]);
  const user = result.rows[0];
  if (!user) throw new AppError('UNAUTHENTICATED');
  await touchSession(client, digest);
  const principal: AuthContext = {
    id: user.id, username: user.username, displayName: user.display_name, role: user.role,
    mustChangePassword: user.must_change_password, sessionVersion: user.session_version,
  };
  return { principal, csrfToken: user.csrf_token };
}
