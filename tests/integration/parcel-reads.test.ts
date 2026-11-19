import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const readers = (database: IsolatedDatabase) => createParcelReadHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

it('pages only the signed-in Seller’s parcels in stable order and caps oversized pages', async () => {
  await harness.run(async database => {
    const seed = await database.fixtureClient();
    await seed.query('SET ROLE domain_writer');
    await seed.query(`
      WITH new_parcels AS (
        INSERT INTO app.parcel (tracking_number, seller_id, recipient_name, recipient_phone, recipient_address,
          weight_kg, current_status, client_request_id, creation_fingerprint, created_at)
        SELECT 'PTL-' || lpad(n::text, 32, 'A'), CASE WHEN n <= 24 THEN $1::bigint ELSE $2::bigint END,
          'Synthetic', '+60123456789', 'Synthetic', 1, 'REGISTERED', gen_random_uuid(), repeat('a', 64),
          '2026-01-01T00:00:00Z' FROM generate_series(1, 28) AS n
        RETURNING id, seller_id
      )
      INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status)
      SELECT id, seller_id, 'REGISTERED' FROM new_parcels
    `, [database.accounts['seller.a'], database.accounts['seller.b']]);
    const expected = (await seed.query<{ id: string }>(
      'SELECT id FROM app.parcel WHERE seller_id = $1 ORDER BY created_at DESC, id DESC', [database.accounts['seller.a']],
    )).rows.map(row => row.id);

    const actor = await loginAs(database, 'seller.a');
    const { list } = readers(database);
    const page = await list(actor.request('/seller/parcels'));
    expect(page.status).toBe(200);
    const result = await page.json();
    expect(result).toMatchObject({ total: 25, page: 1, pageSize: 20 });
    expect(result.items.map((item: { id: string }) => item.id)).toEqual(expected.slice(0, 20));
    expect(result.items[0]).not.toHaveProperty('recipient');
    const second = await list(actor.request('/seller/parcels?page=2'));
    expect((await second.json()).items.map((item: { id: string }) => item.id)).toEqual(expected.slice(20));
    const large = await list(actor.request('/seller/parcels?pageSize=500'));
    expect(await large.json()).toMatchObject({ total: 25, pageSize: 100, items: expect.arrayContaining(result.items) });
    expect((await list(actor.request('/seller/parcels?page=1&page=2'))).status).toBe(422);
    expect((await list(actor.request('/seller/parcels?pageSize=1.5'))).status).toBe(422);
  });
});

it('uses RLS for private detail, gives uniform 404s and audits Admin reads', async () => {
  await harness.run(async database => {
    const [parcel] = await seedRiderParcels(database);
    const { detail } = readers(database);
    const self = await loginAs(database, 'seller.a');
    const seller = await loginAs(database, 'seller.b');
    const rider = await loginAs(database, 'rider.a');
    const unassigned = await loginAs(database, 'rider.b');
    const admin = await loginAs(database, 'admin');
    const read = (actor: typeof self, id = parcel.parcelId) =>
      detail(actor.request('/parcels/' + id), { params: Promise.resolve({ parcelId: id }) });

    const errors = await Promise.all([read(seller), read(seller, '999999999999999999'), read(unassigned)]);
    const envelopes = await Promise.all(errors.map(response => response.json()));
    for (const [index, response] of errors.entries()) {
      expect(response.status).toBe(404);
      expect(envelopes[index].error).toEqual(envelopes[0].error);
    }
    expect((await read(self, 'not-a-parcel-id')).status).toBe(422);
    for (const actor of [self, rider]) {
      const response = await read(actor);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        id: parcel.parcelId, trackingNumber: parcel.trackingNumber,
        assignedRider: { id: rider.principal.id, displayName: rider.principal.displayName, isActive: true },
        history: [{ status: 'REGISTERED' }, { status: 'ASSIGNED' }],
      });
      expect(data.history.every((event: object) => !('changedBy' in event))).toBe(true);
    }
    const adminRead = await read(admin);
    expect(adminRead.status).toBe(200);
    expect(await adminRead.json()).toMatchObject({
      history: [{ changedBy: { id: self.principal.id } }, { changedBy: { id: admin.principal.id } }],
    });
    const owner = await database.migrationClient();
    expect((await owner.query(`SELECT actor_id, request_id, details
      FROM app.audit_event WHERE parcel_id = $1 AND event_type = 'PARCEL_VIEWED'`, [parcel.parcelId])).rows)
      .toEqual([{ actor_id: admin.principal.id, request_id: adminRead.headers.get('x-request-id'), details: {} }]);
  });
});
