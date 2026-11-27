import { expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { principalUow } from '@/server/core/authorized';
import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';

it('releases a stalled multipart reader with BUSY after the pre-authorization transaction is released', async () => {
  vi.useFakeTimers();
  const query = vi.fn().mockResolvedValue({ rows: [{ current_status: 'ASSIGNED', version: 2 }], rowCount: 1 });
  const authorize: typeof principalUow = async (_request, _options, work) => work(
    { query } as unknown as PoolClient,
    { id: '1', username: 'rider.a', displayName: 'Rider', role: 'RIDER', mustChangePassword: false, sessionVersion: 1 },
  );
  const body = new ReadableStream<Uint8Array>({});
  try {
    const request = new Request('http://localhost/api/v1/rider/parcels/1/status', {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=probe' },
      body, duplex: 'half',
    } as RequestInit);
    const result = createRiderHandlers(authorize).updateStatus(request, { params: Promise.resolve({ parcelId: '1' }) });
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await result;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'BUSY' } });
    expect(body.locked).toBe(false);
    expect(query).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
