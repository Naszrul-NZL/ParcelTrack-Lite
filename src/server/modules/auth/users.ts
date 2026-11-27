import 'server-only';
import type { PoolClient } from 'pg';
import { userListSchema, userSummarySchema, type UserList } from '@/shared/schemas';

export type UserStatusInput = { isActive: boolean; expectedVersion: number };

/**
 * Disables or reactivates a Seller or Rider (A09) through `app.set_user_active`, which checks the acting Admin, rejects
 * Admin and self targets, compares the version, bumps both versions, deletes the target's sessions and audits the change
 * in one statement. The strict response schema is the allowlist for what reaches the client.
 */
export async function setUserActive(client: PoolClient, userId: string, { isActive, expectedVersion }: UserStatusInput, requestId: string) {
  const { rows: [row] } = await client.query(`
    SELECT id::text AS id, username, display_name AS "displayName", role,
      must_change_password AS "mustChangePassword", is_active AS "isActive", version
    FROM app.set_user_active($1, $2, $3, $4)
  `, [userId, isActive, expectedVersion, requestId]);
  return userSummarySchema.parse(row);
}

/**
 * Admin creates a Rider (A08) through `app.register_account`, which accepts the RIDER role only for a verified Admin,
 * forces must-change and a 72-hour expiry on the initial password, and audits `USER_CREATED`. The hash is made by the
 * caller; the plain password never reaches this module.
 */
export async function createRider(client: PoolClient, { username, displayName }: { username: string; displayName: string }, passwordHash: string, requestId: string) {
  const { rows: [row] } = await client.query(`
    SELECT id::text AS id, username, display_name AS "displayName", role,
      must_change_password AS "mustChangePassword", is_active AS "isActive", version
    FROM app.register_account($1, $2, $3, 'RIDER', $4)
  `, [username, displayName, passwordHash, requestId]);
  return userSummarySchema.parse(row);
}

/**
 * Admin sets a new one-time password for a Seller or Rider (A21) through `app.admin_reset_password`, which rejects
 * Admin and self targets, sets must-change and a 72-hour expiry, ends the target's sessions and audits `PASSWORD_RESET`.
 */
export async function resetPassword(client: PoolClient, userId: string, passwordHash: string, requestId: string) {
  await client.query('SELECT app.admin_reset_password($1, $2, $3)', [userId, passwordHash, requestId]);
}

export type UserListFilters = { role?: 'SELLER' | 'RIDER' | 'ADMIN'; isActive?: boolean; page: number; pageSize: number };

/**
 * Admin account directory (A07). Reads only the columns the runtime role is granted, never the password hash,
 * and every filter is a bound parameter. Newest first with the id as a stable tie-breaker.
 */
export async function listUsers(client: PoolClient, { role, isActive, page, pageSize }: UserListFilters): Promise<UserList> {
  const { rows: [result] } = await client.query<{ items: unknown[]; total: string }>(`
    WITH filtered AS (
      SELECT id, username, display_name, role, is_active, must_change_password, version, created_at
      FROM app.app_user
      WHERE ($1::text IS NULL OR role = $1) AND ($2::boolean IS NULL OR is_active = $2)
    ), selected AS (
      SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4
    )
    SELECT (SELECT count(*) FROM filtered)::text AS total,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id::text, 'username', username, 'displayName', display_name, 'role', role,
        'mustChangePassword', must_change_password, 'isActive', is_active, 'version', version
      ) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items
    FROM selected
  `, [role ?? null, isActive ?? null, pageSize, (page - 1) * pageSize]);
  // The strict response schema is the allowlist: an extra column would fail here instead of reaching the client.
  return userListSchema.parse({ items: result.items, page, pageSize, total: Number(result.total) });
}
