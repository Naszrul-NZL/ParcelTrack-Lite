import 'server-only';
import type { PoolClient } from 'pg';
import { dashboardSchema } from '@/features/delivery/admin-contract';

export async function readAdminDashboard(client: PoolClient) {
  const { rows: [row] } = await client.query<{
    registered: number; assigned: number; out_for_delivery: number;
    delivered: number; failed: number; total: number; generated_at: Date;
  }>(`
    SELECT
      count(*) FILTER (WHERE current_status = 'REGISTERED')::integer AS registered,
      count(*) FILTER (WHERE current_status = 'ASSIGNED')::integer AS assigned,
      count(*) FILTER (WHERE current_status = 'OUT_FOR_DELIVERY')::integer AS out_for_delivery,
      count(*) FILTER (WHERE current_status = 'DELIVERED')::integer AS delivered,
      count(*) FILTER (WHERE current_status = 'FAILED')::integer AS failed,
      count(*)::integer AS total,
      clock_timestamp() AS generated_at
    FROM app.parcel
  `);
  return dashboardSchema.parse({
    counts: {
      REGISTERED: row.registered,
      ASSIGNED: row.assigned,
      OUT_FOR_DELIVERY: row.out_for_delivery,
      DELIVERED: row.delivered,
      FAILED: row.failed,
    },
    total: row.total,
    generatedAt: row.generated_at.toISOString(),
  });
}
