import 'server-only';
import type { PoolClient } from 'pg';
import { userListSchema, type UserList } from '@/shared/schemas';

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
