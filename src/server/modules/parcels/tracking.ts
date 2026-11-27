import 'server-only';
import { assertConnectedRole, getPool, type TransactionPool } from '@/server/core/db';
import { AppError } from '@/server/core/errors';
import type { z } from 'zod';
import { publicTrackingSchema } from '@/shared/schemas';

export type PublicTracking = z.infer<typeof publicTrackingSchema>;

/**
 * M2-PH3-T04: public tracking reads through the separate `tracking_runtime` pool, which may only execute
 * `app.lookup_tracking`. The token must already be validated and normalized by the caller (A13, M2-PH3-T05).
 * Returns null for an unknown token. The result is parsed through the public allowlist schema, so nothing but
 * `{history:[{status,changedAt}]}` can leave this module; it never uses the private detail serializer.
 */
export async function lookupTracking(token: string, pool: TransactionPool = getPool('tracking_runtime')): Promise<PublicTracking | null> {
  let client;
  try { client = await pool.connect(); } catch { throw new AppError('BUSY'); }
  try {
    await assertConnectedRole(client, 'tracking_runtime');
    const { rows } = await client.query<{ status: string; changed_at: Date }>(
      'SELECT status, changed_at FROM app.lookup_tracking($1)', [token]);
    if (rows.length === 0) return null;
    return publicTrackingSchema.parse({ history: rows.map(row => ({ status: row.status, changedAt: row.changed_at.toISOString() })) });
  } finally { client.release(); }
}
