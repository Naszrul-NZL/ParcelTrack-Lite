import 'server-only';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AuthContext } from '@/server/modules/auth/principal';
import { AppError } from '@/server/core/errors';
import { parcelDetailSchema } from '@/shared/schemas';
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

// Replace the Rider-only detail projection with M2's shared A12 reader when available.
async function readRiderDetail(client: PoolClient, parcelId: string, principal: AuthContext) {
  const { rows } = await client.query(`
    SELECT p.id, p.tracking_number AS "trackingNumber", p.current_status AS "currentStatus",
      p.weight_kg AS "weightKg", p.version, p.created_at AS "createdAt", p.terminal_at AS "terminalAt",
      p.anonymized_at IS NOT NULL AS anonymized,
      jsonb_build_object('name', p.recipient_name, 'phone', p.recipient_phone, 'address', p.recipient_address) AS recipient,
      EXISTS (SELECT 1 FROM app.delivery_proof proof WHERE proof.parcel_id = p.id) AS "hasProof"
    FROM app.parcel p WHERE p.id = $1 AND p.assigned_rider_id = $2
  `, [parcelId, principal.id]);
  const parcel = rows[0];
  if (!parcel) throw new AppError('NOT_FOUND');
  const history = await client.query<{ status: string; changedAt: Date }>(`
    SELECT status, changed_at AS "changedAt" FROM app.parcel_status_history
    WHERE parcel_id = $1 ORDER BY changed_at, id
  `, [parcelId]);
  return parcelDetailSchema.parse({
    ...parcel,
    createdAt: parcel.createdAt.toISOString(),
    terminalAt: parcel.terminalAt?.toISOString() ?? null,
    assignedRider: { id: principal.id, displayName: principal.displayName, isActive: true },
    history: history.rows.map(event => ({ ...event, changedAt: event.changedAt.toISOString() })),
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
  return readRiderDetail(client, parcelId, principal);
}
