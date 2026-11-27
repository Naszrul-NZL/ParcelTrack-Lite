import 'server-only';
import type { PoolClient } from 'pg';
import { AppError } from '@/server/core/errors';
import type { AuthContext } from '@/server/modules/auth/principal';
import { parcelDetailSchema, parcelListSchema, type ParcelDetail, type ParcelListQuery, type ParcelSummary } from '@/shared/schemas';
import { escapeLike } from './tokens';

type SummaryRow = Omit<ParcelSummary, 'createdAt'> & { createdAt: Date };
type DetailRow = SummaryRow & Pick<ParcelDetail, 'recipient' | 'assignedRider' | 'hasProof' | 'anonymized'> & {
  terminalAt: Date | null;
  history: ParcelDetail['history'];
};

/**
 * A11 (M2-PH3-T02). The SQL text is constant: the search text only ever reaches PostgreSQL as LIKE patterns with
 * `\`, `%` and `_` escaped, so a wildcard in `q` matches itself and never widens the result. The tracking number
 * is stored in uppercase, so its prefix pattern is uppercased; the name match uses ILIKE. `sort` is an allowlisted
 * key compared inside the query, never spliced into it.
 */
export async function listSellerParcels(client: PoolClient, sellerId: string, query: ParcelListQuery) {
  const { page, pageSize, q, status, sort } = query;
  const tokenPrefix = q === undefined ? null : escapeLike(q.toUpperCase()) + '%';
  const nameContains = q === undefined ? null : '%' + escapeLike(q) + '%';
  const { rows: [result] } = await client.query<{ items: ParcelSummary[]; total: string }>(`
    WITH own AS (
      SELECT id, tracking_number, current_status, weight_kg, created_at, version,
        CASE WHEN $7::text = 'currentStatus' THEN
          array_position(ARRAY['REGISTERED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED'], current_status)
        END AS status_rank
      FROM app.parcel
      WHERE seller_id = $1
        AND ($4::text IS NULL OR current_status = $4)
        AND ($5::text IS NULL OR tracking_number LIKE $5 ESCAPE '\\' OR recipient_name ILIKE $6 ESCAPE '\\')
    ), selected AS (
      SELECT * FROM own ORDER BY status_rank, created_at DESC, id DESC LIMIT $2 OFFSET $3
    )
    SELECT (SELECT count(*) FROM own)::text AS total,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id::text, 'trackingNumber', tracking_number, 'currentStatus', current_status,
        'weightKg', weight_kg::text, 'createdAt', created_at, 'version', version
      ) ORDER BY status_rank, created_at DESC, id DESC), '[]'::jsonb) AS items
    FROM selected
  `, [sellerId, pageSize, (page - 1) * pageSize, status ?? null, tokenPrefix, nameContains, sort]);

  return parcelListSchema.parse({
    items: result.items.map(parcel => ({ ...parcel, createdAt: new Date(parcel.createdAt).toISOString() })),
    page, pageSize, total: Number(result.total),
  });
}

export async function readParcelDetail(client: PoolClient, principal: AuthContext, parcelId: string, requestId: string) {
  const isAdmin = principal.role === 'ADMIN';
  const { rows: [parcel] } = await client.query<DetailRow>(`
    SELECT p.id, p.tracking_number AS "trackingNumber", p.current_status AS "currentStatus",
      p.weight_kg AS "weightKg", p.created_at AS "createdAt", p.version, p.terminal_at AS "terminalAt",
      p.anonymized_at IS NOT NULL AS anonymized,
      jsonb_build_object('name', p.recipient_name, 'phone', p.recipient_phone, 'address', p.recipient_address) AS recipient,
      CASE WHEN rider.id IS NOT NULL THEN
        jsonb_build_object('id', rider.id::text, 'displayName', rider.display_name, 'isActive', rider.is_active)
      END AS "assignedRider",
      EXISTS (SELECT 1 FROM app.delivery_proof proof WHERE proof.parcel_id = p.id) AS "hasProof",
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('status', h.status, 'changedAt', h.changed_at) ||
          CASE WHEN $2 THEN jsonb_build_object(
            'changedBy', jsonb_build_object('id', u.id::text, 'displayName', u.display_name)
          ) ELSE '{}'::jsonb END
          ORDER BY h.changed_at, h.id
        ), '[]'::jsonb)
        FROM app.parcel_status_history h
        JOIN app.app_user u ON u.id = h.changed_by_id
        WHERE h.parcel_id = p.id
      ) AS history
    FROM app.parcel p
    LEFT JOIN app.app_user rider ON rider.id = p.assigned_rider_id
    WHERE p.id = $1
  `, [parcelId, isAdmin]);
  if (!parcel) throw new AppError('NOT_FOUND');

  const detail = parcelDetailSchema.parse({
    ...parcel, createdAt: parcel.createdAt.toISOString(), terminalAt: parcel.terminalAt?.toISOString() ?? null,
    history: parcel.history.map(event => ({ ...event, changedAt: new Date(event.changedAt).toISOString() })),
  });
  if (isAdmin) {
    await client.query(`
      INSERT INTO app.audit_event (actor_id, parcel_id, event_type, outcome, request_id)
      VALUES ($1, $2, 'PARCEL_VIEWED', 'SUCCESS', $3)
    `, [principal.id, parcelId, requestId]);
  }
  return detail;
}
