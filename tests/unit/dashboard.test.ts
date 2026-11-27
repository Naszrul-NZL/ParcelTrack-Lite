import type { PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';
import { readAdminDashboard } from '@/server/modules/delivery/dashboard-service';

it('M3-PH3-TC19 zero-fills all dashboard statuses from one aggregate statement', async () => {
  const generated = new Date('2026-11-28T00:00:00.000Z');
  const query = vi.fn().mockResolvedValue({ rows: [{
    registered: 0, assigned: 0, out_for_delivery: 0, delivered: 0, failed: 0, total: 0, generated_at: generated,
  }] });
  await expect(readAdminDashboard({ query } as unknown as PoolClient)).resolves.toEqual({
    counts: { REGISTERED: 0, ASSIGNED: 0, OUT_FOR_DELIVERY: 0, DELIVERED: 0, FAILED: 0 },
    total: 0,
    generatedAt: generated.toISOString(),
  });
  expect(query).toHaveBeenCalledOnce();
});
