import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';
import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';
import { lookupTracking } from '@/server/modules/parcels/tracking';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const settings = { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' };
const handlers = (database: IsolatedDatabase) => ({
  register: createRegistrationHandler(createPrincipalUow(database.pool(), settings), () => process.env.FINGERPRINT_KEY!),
  ...createParcelReadHandlers(createPrincipalUow(database.pool(), settings)),
});
/** Counts parcels as `domain_writer`: forced RLS hides every row from the migration owner. */
async function parcelCount(database: IsolatedDatabase) {
  const client = await database.fixtureClient();
  await client.query('SET ROLE domain_writer');
  return (await client.query<{ n: number }>('SELECT count(*)::int AS n FROM app.parcel')).rows[0].n;
}
const body = (patch: Record<string, unknown>) => JSON.stringify({
  recipientName: 'Synthetic Recipient', recipientPhone: '0123456789', recipientAddress: 'Synthetic address', weightKg: '1.000', clientRequestId: randomUUID(), ...patch,
});

it('M2-PH3-TC14 stores and returns hostile recipient text literally through A10, A11 and A12, and keeps tracking public-only', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const { register, list, detail } = handlers(database);
    const name = '<script>alert(1)</script>';
    const address = `'; DROP TABLE app.parcel; -- <img src=x onerror=alert(1)> "quoted" \\ back`;
    const created = await register(seller.request('/parcels', { method: 'POST', body: body({ recipientName: name, recipientAddress: address }) }));
    expect(created.status).toBe(201);
    const parcel = await created.json();
    expect(parcel.recipient).toMatchObject({ name, address });

    const read = await (await detail(seller.request('/parcels/' + parcel.id), { params: Promise.resolve({ parcelId: parcel.id }) })).json();
    expect(read.recipient).toMatchObject({ name, address });
    // The name is searchable as literal text, including its angle brackets.
    const found = await (await list(seller.request('/seller/parcels?q=' + encodeURIComponent('<script>alert')))).json();
    expect(found.items.map((item: { id: string }) => item.id)).toEqual([parcel.id]);

    // The table survived, and public tracking still answers with status and time only.
    expect(await parcelCount(database)).toBeGreaterThan(0);
    const tracked = await lookupTracking(parcel.trackingNumber, database.pool('tracking_runtime'));
    expect(JSON.stringify(tracked)).not.toMatch(/script|DROP|onerror/);
  });
});

it('M2-PH3-TC14 rejects oversized recipient text and bodies with 422 and writes nothing', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const { register } = handlers(database);
    const before = await parcelCount(database);
    expect(before).toBeGreaterThan(0);
    for (const [label, patch] of [
      ['10 000-character address', { recipientAddress: 'x'.repeat(10_000) }],
      ['501-character address', { recipientAddress: 'x'.repeat(501) }],
      ['121-character name', { recipientName: 'x'.repeat(121) }],
      ['body over 16 KiB', { recipientAddress: 'Synthetic', pad: 'x'.repeat(20_000) }],
    ] as const) {
      const response = await register(seller.request('/parcels', { method: 'POST', body: body(patch) }));
      expect([response.status, (await response.json()).error.code], label).toEqual([422, 'VALIDATION_ERROR']);
    }
    expect(await parcelCount(database)).toBe(before);
  });
});
