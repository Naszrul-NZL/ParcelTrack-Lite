import 'server-only';
import type { Principal } from '@/shared/schemas';
import type { Role } from '@/shared/constants';
import { AppError } from '@/server/core/errors';
import { getPool, transaction } from '@/server/core/db';
import { getSettings } from '@/server/core/settings';
import { readSessionContext } from './session-context';
export type AuthContext = Principal & {sessionVersion:number};
export function requireRole(principal: AuthContext, ...roles: Role[]) {
  if (!roles.includes(principal.role)) throw new AppError('FORBIDDEN');
  if (principal.mustChangePassword) throw new AppError('PASSWORD_CHANGE_REQUIRED');
  return principal;
}
export async function requireAuthenticated(request: Request, options: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  return transaction(getPool('app_runtime'),{}, async client => {
    const { principal } = await readSessionContext(client, request, getSettings().SESSION_COOKIE_NAME);
    if (principal.mustChangePassword && !options.allowPasswordChange) throw new AppError('PASSWORD_CHANGE_REQUIRED');
    return principal;
  });
}
export function toPrincipal({id,username,displayName,role,mustChangePassword}: AuthContext): Principal { return {id,username,displayName,role,mustChangePassword}; }
