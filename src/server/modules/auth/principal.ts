import 'server-only';
import { createHash } from 'node:crypto';
import type { Principal } from '@/shared/schemas';
import type { Role } from '@/shared/constants';
import { AppError } from '@/server/core/errors';
import { getPool, transaction } from '@/server/core/db';
import { getSettings } from '@/server/core/settings';
export type AuthContext = Principal & {sessionVersion:number};
export function requireRole(principal: AuthContext, ...roles: Role[]) {
  if (!roles.includes(principal.role)) throw new AppError('FORBIDDEN');
  if (principal.mustChangePassword) throw new AppError('PASSWORD_CHANGE_REQUIRED');
  return principal;
}
export async function requireAuthenticated(request: Request): Promise<AuthContext> {
  const cookieName = getSettings().SESSION_COOKIE_NAME;
  const token = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length+1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError('UNAUTHENTICATED');
  const digest = createHash('sha256').update(token).digest('hex');
  return transaction(getPool('app_runtime'),{}, async client => {
    const result = await client.query<{id:string;username:string;display_name:string;role:Role;must_change_password:boolean;session_version:number}>("SELECT u.id,u.username,u.display_name,u.role,u.must_change_password,u.session_version FROM app.auth_session s JOIN app.app_user u ON u.id=s.user_id WHERE s.token_digest=$1 AND u.is_active AND u.session_version=s.user_session_version AND s.expires_at>now() AND s.absolute_expires_at>now() AND s.last_seen_at>now()-interval '30 minutes'",[digest]);
    const u = result.rows[0];
    if (!u) throw new AppError('UNAUTHENTICATED');
    return {id:u.id,username:u.username,displayName:u.display_name,role:u.role,mustChangePassword:u.must_change_password,sessionVersion:u.session_version};
  });
}
export function toPrincipal({id,username,displayName,role,mustChangePassword}: AuthContext): Principal { return {id,username,displayName,role,mustChangePassword}; }
