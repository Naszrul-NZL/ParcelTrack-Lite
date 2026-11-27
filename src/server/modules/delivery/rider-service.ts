import 'server-only';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AuthContext } from '@/server/modules/auth/principal';
import { AppError } from '@/server/core/errors';
import { readParcelDetail } from '@/server/modules/parcels/read-service';
import { riderListSchema, type riderListQuerySchema, type riderStatusFields } from '@/features/delivery/rider-contract';

export async function listRiderParcels(
  client: PoolClient, principal: AuthContext, { status, page, pageSize }: z.infer<typeof riderListQuerySchema>,
) {
  const { rows } = await client.query<{
    items: Array<{ createdAt: string }>;
    total: string;
  }>(`
    WITH matching AS (
      SELECT id, tracking_number, current_status, weight_kg, created_at, version
      FROM app.parcel
      WHERE assigned_rider_id = $1 AND ($2::text IS NULL OR current_status = $2)
    ),
    selected AS (
      SELECT * FROM matching ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4
    )
    SELECT (SELECT count(*)::text FROM matching) AS total,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id::text, 'trackingNumber', tracking_number, 'currentStatus', current_status,
        'weightKg', weight_kg::text, 'createdAt', created_at, 'version', version
      ) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items
    FROM selected
  `, [principal.id, status ?? null, pageSize, (page - 1) * pageSize]);

  return riderListSchema.parse({
    items: rows[0].items.map(item => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
    total: Number(rows[0].total), page, pageSize,
  });
}

export async function updateRiderStatus(
  client: PoolClient, principal: AuthContext, parcelId: string, fields: z.infer<typeof riderStatusFields>, requestId: string,
) {
  const assignment = await client.query(
    'SELECT id FROM app.parcel WHERE id = $1 AND assigned_rider_id = $2',
    [parcelId, principal.id],
  );
  if (!assignment.rowCount) throw new AppError('NOT_FOUND');
  await client.query("SELECT set_config('app.request_id', $1, true)", [requestId]);
  await client.query('SELECT app.update_delivery_status($1, $2, $3)', [parcelId, fields.expectedVersion, fields.status]);
  return readParcelDetail(client, principal, parcelId, requestId);
}
