import 'server-only';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AuthContext } from '@/server/modules/auth/principal';
import { readParcelDetail } from '@/server/modules/parcels/read-service';
import {
  adminParcelListSchema,
  adminParcelListQuerySchema,
  assignmentSchema,
} from '@/features/delivery/admin-contract';

export async function listAdminParcels(
  client: PoolClient,
  { status, riderId, needsReassignment, page, pageSize }: z.infer<typeof adminParcelListQuerySchema>,
) {
  const { rows: [result] } = await client.query<{ items: Array<{ createdAt: string }>; total: string }>(`
    WITH filtered AS (
      SELECT p.id, p.tracking_number, p.current_status, p.weight_kg, p.created_at, p.version,
        rider.id AS rider_id, rider.display_name AS rider_display_name, rider.is_active AS rider_is_active
      FROM app.parcel p
      LEFT JOIN app.app_user rider ON rider.id = p.assigned_rider_id
      WHERE ($1::text IS NULL OR p.current_status = $1)
        AND ($2::bigint IS NULL OR p.assigned_rider_id = $2)
        AND ($3::boolean IS NULL OR $3 = (
          p.current_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
          AND rider.id IS NOT NULL
          AND NOT rider.is_active
        ))
    ), selected AS (
      SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5
    )
    SELECT (SELECT count(*) FROM filtered)::text AS total,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id::text, 'trackingNumber', tracking_number, 'currentStatus', current_status,
        'weightKg', weight_kg::text, 'createdAt', created_at, 'version', version,
        'assignedRider', CASE WHEN rider_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', rider_id::text, 'displayName', rider_display_name, 'isActive', rider_is_active
        ) END
      ) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items
    FROM selected
  `, [status ?? null, riderId ?? null, needsReassignment ?? null, pageSize, (page - 1) * pageSize]);

  return adminParcelListSchema.parse({
    items: result.items.map(item => ({ ...item, createdAt: new Date(item.createdAt).toISOString() })),
    page,
    pageSize,
    total: Number(result.total),
  });
}

export async function assignAdminParcel(
  client: PoolClient,
  principal: AuthContext,
  parcelId: string,
  { riderId, expectedVersion }: z.infer<typeof assignmentSchema>,
  requestId: string,
) {
  await client.query("SELECT set_config('app.request_id', $1, true)", [requestId]);
  await client.query('SELECT app.assign_parcel($1, $2, $3)', [parcelId, riderId, expectedVersion]);
  return readParcelDetail(client, principal, parcelId, requestId, { auditRead: false });
}
