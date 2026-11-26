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

it('M2-PH2-TC11 pages only the signed-in Seller’s parcels in stable order and caps oversized pages', async () => {
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

it('M2-PH2-TC10 uses RLS for private detail, gives uniform 404s and audits Admin reads', async () => {
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

it('M2-PH2-TC17 answers SQL-injection strings in A11 and A12 parameters with 422 or 404, never wider results', async () => {
  await harness.run(async database => {
    const seeded = await seedRiderParcels(database);
    // domain_writer has owner policies for every parcel; the migration owner reads nothing under forced RLS.
    const check = await database.fixtureClient();
    await check.query('SET ROLE domain_writer');
    const parcelCount = async () => Number((await check.query('SELECT count(*) FROM app.parcel')).rows[0].count);
    const before = await parcelCount();
    expect(before).toBeGreaterThanOrEqual(seeded.length);
    const { list, detail } = readers(database);
    const owner = await loginAs(database, 'seller.a');
    const other = await loginAs(database, 'seller.b');
    // `params` carries the decoded segment, as Next.js passes it to the route handler.
    const read = (id: string) => detail(other.request('/parcels/' + encodeURIComponent(id)), {
      params: Promise.resolve({ parcelId: id }),
    });

    const hostileIds = [
      `${seeded[0].parcelId} OR 1=1`, `${seeded[0].parcelId}'; DROP TABLE app.parcel; --`, `' OR ''='`,
      '1 UNION SELECT id FROM app.app_user', '-1', '0', '1e3', '0x1', '9'.repeat(19), "1'",
    ];
    for (const id of hostileIds) {
      const response = await read(id);
      expect(response.status, id).toBe(422);
      expect((await response.json()).error.code, id).toBe('VALIDATION_ERROR');
    }
    // A well-formed ID of a parcel the caller cannot see stays a plain not-found.
    expect((await read(seeded[0].parcelId)).status).toBe(404);

    const hostileQueries = [
      'page=1%20OR%201%3D1', 'page=1;DROP%20TABLE%20app.parcel', "pageSize=20'--", 'page=-1', 'page=0',
      'pageSize=0', 'pageSize=1e2', 'page=100001', 'page=1&page=1', 'sort=id;DROP', `page=${'9'.repeat(400)}`,
    ];
    for (const query of hostileQueries) {
      const response = await list(other.request('/seller/parcels?' + query));
      expect(response.status, query).toBe(422);
      expect((await response.json()).error.code, query).toBe('VALIDATION_ERROR');
    }
    const ownIds = async (account: 'seller.a' | 'seller.b') => (await check.query<{ id: string }>(
      'SELECT id::text AS id FROM app.parcel WHERE seller_id = $1 ORDER BY created_at DESC, id DESC',
      [database.accounts[account]])).rows.map(row => row.id);
    // An oversized numeric pageSize is clamped, and still returns exactly the caller's own rows in order.
    const clamped = await list(other.request(`/seller/parcels?pageSize=${'9'.repeat(400)}`));
    expect(clamped.status).toBe(200);
    const clampedPage = await clamped.json();
    const sellerB = await ownIds('seller.b');
    expect(sellerB.length).toBeGreaterThan(0);
    expect(clampedPage).toMatchObject({ total: sellerB.length, pageSize: 100 });
    expect(clampedPage.items.map((item: { id: string }) => item.id)).toEqual(sellerB);

    expect((await (await list(owner.request('/seller/parcels'))).json()).total).toBe((await ownIds('seller.a')).length);
    expect(await parcelCount()).toBe(before);
  });
});
