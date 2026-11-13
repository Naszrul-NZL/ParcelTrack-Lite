import { it, expect, vi } from 'vitest';
import { SupabaseProofStore } from '@/server/modules/delivery/storage';

const key = '1/' + 'a'.repeat(32) + '.png';
const missing = () => Response.json({ code: 'NoSuchKey', statusCode: '404', error: 'not_found' }, { status: 400 });

it('recognizes pinned Storage NoSuchKey responses without treating all HTTP 400 errors as absence', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 400 })).mockResolvedValueOnce(missing());
  const store = new SupabaseProofStore('http://localhost:8001', 'synthetic-credential', 'delivery-proofs', transport);
  expect(await store.exists(key)).toBe(false);
  expect(new Headers(transport.mock.calls[1][1]?.headers).get('range')).toBe('bytes=0-0');
  transport.mockResolvedValueOnce(missing());
  await expect(store.open(key)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('preserves uncertainty for authorization, invalid-request and oversized error responses', async () => {
  for (const response of [
    new Response(null, { status: 403 }), new Response(null, { status: 500 }),
    Response.json({ code: 'AccessDenied', statusCode: '403' }, { status: 400 }),
    Response.json({ code: 'NoSuchBucket', statusCode: '404' }, { status: 400 }),
    Response.json({ code: 'NoSuchBucket', statusCode: '404' }, { status: 404 }),
    new Response('Gateway route is not configured', { status: 404 }),
    new Response('x'.repeat(5000), { status: 400 }),
  ]) {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 400 })).mockResolvedValueOnce(response);
    await expect(new SupabaseProofStore('http://localhost:8001', 'synthetic-credential', 'delivery-proofs', transport).exists(key)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  }
});
