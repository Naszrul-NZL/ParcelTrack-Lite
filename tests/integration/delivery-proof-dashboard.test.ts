import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createPrincipalUow } from '@/server/core/authorized';
import { createDashboardHandler } from '@/server/modules/delivery/dashboard-handler';
import { createProofHandler } from '@/server/modules/delivery/proof-handler';
import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';
import { SupabaseProofStore, type ProofStore } from '@/server/modules/delivery/storage';
import { LIMITS } from '@/shared/constants';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin, type LoginSession } from '../harness/login-as';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

function authorize(database: IsolatedDatabase) {
  return createPrincipalUow(database.pool(), { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' });
}

function statusRequest(
  parcelId: string,
  session: LoginSession,
  status: string,
  expectedVersion: number,
  proofs: File[] = [],
) {
  const body = new FormData();
  body.set('status', status);
  body.set('expectedVersion', String(expectedVersion));
  for (const proof of proofs) body.append('proof', proof);
  return session.request(`/rider/parcels/${parcelId}/status`, { method: 'POST', body });
}

function trackedStore() {
  const inner = new SupabaseProofStore(
    process.env.SUPABASE_INTERNAL_URL!, process.env.STORAGE_SERVICE_KEY!, process.env.PROOF_BUCKET,
  );
  const keys = new Set<string>();
  const store: ProofStore = {
    async publish(key, bytes, mediaType) { await inner.publish(key, bytes, mediaType); keys.add(key); },
    open: key => inner.open(key),
    async delete(key) { await inner.delete(key); keys.delete(key); },
    exists: key => inner.exists(key),
    listOld: (parcelId, before) => inner.listOld(parcelId, before),
  };
  return {
    store,
    keys,
    async cleanup() { await Promise.all([...keys].map(key => inner.delete(key))); keys.clear(); },
  };
}

async function parcelState(database: IsolatedDatabase, parcelId: string) {
  const fixture = await database.fixtureClient();
  await fixture.query('BEGIN');
  await fixture.query('SET LOCAL ROLE domain_writer');
  const parcel = (await fixture.query(`
    SELECT current_status, version, terminal_at, delivered_at, anonymized_at
    FROM app.parcel WHERE id = $1
  `, [parcelId])).rows[0];
  const proofs = (await fixture.query(`
    SELECT storage_key, media_type, size_bytes, uploaded_by_id
    FROM app.delivery_proof WHERE parcel_id = $1
  `, [parcelId])).rows;
  const history = (await fixture.query(`
    SELECT status, changed_by_id FROM app.parcel_status_history WHERE parcel_id = $1 ORDER BY changed_at, id
  `, [parcelId])).rows;
  await fixture.query('ROLLBACK');
  return { ...parcel, proofs, history };
}

async function readProof(
  database: IsolatedDatabase,
  store: ProofStore,
  session: LoginSession | undefined,
  parcelId: string,
) {
  const request = session
    ? session.request(`/parcels/${parcelId}/proof`)
    : new Request(origin() + `/api/v1/parcels/${parcelId}/proof`);
  return createProofHandler(authorize(database), store)(request, { params: Promise.resolve({ parcelId }) });
}

describe('M3-PH3 proof finalization, private reads and dashboard', () => {
  it('TC04/TC05 finalizes Delivered and Failed with sanitized private proofs and coherent history', async () => {
    await harness.run(async database => {
      const tracked = trackedStore();
      try {
        const parcels = await seedRiderParcels(database);
        const rider = await loginAs(database, 'rider.a');
        const handlers = createRiderHandlers(authorize(database), tracked.store);
        const deliveredId = parcels.find(parcel => parcel.key === 'riderAFirst')!.parcelId;
        const failedId = parcels.find(parcel => parcel.key === 'riderASecond')!.parcelId;
        const context = (parcelId: string) => ({ params: Promise.resolve({ parcelId }) });

        expect((await handlers.updateStatus(
          statusRequest(deliveredId, rider, 'OUT_FOR_DELIVERY', 2), context(deliveredId),
        )).status).toBe(200);
        const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#152e48' } })
          .withMetadata({ exif: { IFD0: { Artist: 'CANARY' } } }).jpeg().toBuffer();
        const delivered = await handlers.updateStatus(statusRequest(
          deliveredId, rider, 'DELIVERED', 3,
          [new File([Buffer.concat([jpeg, Buffer.from('<script>CANARY</script>')])], 'proof.jpg', { type: 'image/jpeg' })],
        ), context(deliveredId));
        expect(delivered.status).toBe(200);
        expect(await delivered.json()).toMatchObject({ id: deliveredId, currentStatus: 'DELIVERED', version: 4, hasProof: true });

        expect((await handlers.updateStatus(
          statusRequest(failedId, rider, 'OUT_FOR_DELIVERY', 2), context(failedId),
        )).status).toBe(200);
        const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#386bd9' } }).png().toBuffer();
        const failed = await handlers.updateStatus(statusRequest(
          failedId, rider, 'FAILED', 3, [new File([png], 'proof.png', { type: 'image/png' })],
        ), context(failedId));
        expect(failed.status).toBe(200);
        expect(await failed.json()).toMatchObject({ id: failedId, currentStatus: 'FAILED', version: 4, hasProof: true });

        const deliveredState = await parcelState(database, deliveredId);
        expect(deliveredState).toMatchObject({ current_status: 'DELIVERED', version: 4 });
        expect(deliveredState.terminal_at).toBeInstanceOf(Date);
        expect(deliveredState.delivered_at).toEqual(deliveredState.terminal_at);
        expect(deliveredState.proofs).toHaveLength(1);
        expect(deliveredState.proofs[0]).toMatchObject({ media_type: 'image/jpeg', uploaded_by_id: rider.principal.id });
        expect(deliveredState.history.map((entry: { status: string }) => entry.status)).toEqual([
          'REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED',
        ]);
        const storedJpeg = Buffer.from(await tracked.store.open(deliveredState.proofs[0].storage_key));
        expect(storedJpeg.length).toBe(deliveredState.proofs[0].size_bytes);
        expect((await sharp(storedJpeg).metadata()).exif).toBeUndefined();
        expect(storedJpeg.includes(Buffer.from('CANARY'))).toBe(false);

        const failedState = await parcelState(database, failedId);
        expect(failedState).toMatchObject({ current_status: 'FAILED', version: 4, delivered_at: null });
        expect(failedState.terminal_at).toBeInstanceOf(Date);
        expect(failedState.proofs[0]).toMatchObject({ media_type: 'image/png', uploaded_by_id: rider.principal.id });
      } finally { await tracked.cleanup(); }
    });
  });

  it('TC06/TC07 rejects missing, duplicate, malformed, disguised and oversized proofs without state changes', async () => {
    await harness.run(async database => {
      const tracked = trackedStore();
      try {
        const [parcel] = await seedRiderParcels(database);
        const rider = await loginAs(database, 'rider.a');
        const other = await loginAs(database, 'rider.b');
        const handlers = createRiderHandlers(authorize(database), tracked.store);
        const context = { params: Promise.resolve({ parcelId: parcel.parcelId }) };
        expect((await handlers.updateStatus(
          statusRequest(parcel.parcelId, rider, 'OUT_FOR_DELIVERY', 2), context,
        )).status).toBe(200);
        const valid = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#152e48' } }).jpeg().toBuffer();
        const cases: Array<[Request, number, string]> = [
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3), 422, 'PROOF_REQUIRED'],
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [
            new File([valid], 'one.jpg'), new File([valid], 'two.jpg'),
          ]), 422, 'PROOF_COUNT'],
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [new File(['not an image'], 'proof.jpg')]), 415, 'PROOF_INVALID'],
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [new File([valid], 'proof.php')]), 415, 'PROOF_INVALID'],
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [new File([valid], 'shell.php.jpg')]), 415, 'PROOF_INVALID'],
          [statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [new File(['<svg><script/></svg>'], 'proof.png')]), 415, 'PROOF_INVALID'],
        ];
        const declaredOversize = statusRequest(parcel.parcelId, rider, 'DELIVERED', 3, [new File([valid], 'proof.jpg')]);
        declaredOversize.headers.set('content-length', String(LIMITS.multipartBytes + 1));
        cases.push([declaredOversize, 413, 'PROOF_TOO_LARGE']);
        for (const [request, status, code] of cases) {
          const response = await handlers.updateStatus(request, context);
          expect([response.status, (await response.json()).error.code]).toEqual([status, code]);
        }

        const unauthorized = statusRequest(parcel.parcelId, other, 'DELIVERED', 3, [new File([valid], 'proof.jpg')]);
        const denied = await handlers.updateStatus(unauthorized, context);
        expect(denied.status).toBe(404);
        expect(unauthorized.bodyUsed).toBe(false);
        expect(await parcelState(database, parcel.parcelId)).toMatchObject({
          current_status: 'OUT_FOR_DELIVERY', version: 3, proofs: [],
        });
        expect(tracked.keys.size).toBe(0);
      } finally { await tracked.cleanup(); }
    });
  });

  it('TC21 removes a newly published object after a confirmed database rollback', async () => {
    await harness.run(async database => {
      const [parcel] = await seedRiderParcels(database);
      const rider = await loginAs(database, 'rider.a');
      const published: string[] = [];
      const deleted: string[] = [];
      const fakeStore: ProofStore = {
        async publish(key) { published.push(key); },
        async open() { return new Uint8Array(); },
        async delete(key) { deleted.push(key); },
        async exists() { return false; },
        async *listOld() {},
      };
      const handlers = createRiderHandlers(authorize(database), fakeStore);
      const context = { params: Promise.resolve({ parcelId: parcel.parcelId }) };
      expect((await handlers.updateStatus(
        statusRequest(parcel.parcelId, rider, 'OUT_FOR_DELIVERY', 2), context,
      )).status).toBe(200);

      const fixture = await database.fixtureClient();
      await fixture.query('BEGIN');
      await fixture.query('SET LOCAL ROLE domain_writer');
      await fixture.query(`
        INSERT INTO app.delivery_proof(parcel_id, uploaded_by_id, storage_key, media_type, size_bytes)
        VALUES ($1, $2, $3, 'image/jpeg', 1)
      `, [parcel.parcelId, rider.principal.id, `${parcel.parcelId}/${'a'.repeat(32)}.jpg`]);
      await fixture.query('COMMIT');

      const valid = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#152e48' } }).jpeg().toBuffer();
      const response = await handlers.updateStatus(statusRequest(
        parcel.parcelId, rider, 'DELIVERED', 3, [new File([valid], 'proof.jpg')],
      ), context);
      expect(response.status).toBe(500);
      expect(published).toHaveLength(1);
      expect(deleted).toEqual(published);
      expect(await parcelState(database, parcel.parcelId)).toMatchObject({ current_status: 'OUT_FOR_DELIVERY', version: 3 });
    });
  });

  it('TC08 serves verified private bytes only to current authorized readers and denies anonymized parcels', async () => {
    await harness.run(async database => {
      const tracked = trackedStore();
      try {
        const [parcel] = await seedRiderParcels(database);
        const rider = await loginAs(database, 'rider.a');
        const handlers = createRiderHandlers(authorize(database), tracked.store);
        const context = { params: Promise.resolve({ parcelId: parcel.parcelId }) };
        expect((await handlers.updateStatus(statusRequest(
          parcel.parcelId, rider, 'OUT_FOR_DELIVERY', 2,
        ), context)).status).toBe(200);
        const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#152e48' } }).jpeg().toBuffer();
        expect((await handlers.updateStatus(statusRequest(
          parcel.parcelId, rider, 'DELIVERED', 3, [new File([jpeg], 'proof.jpg')],
        ), context)).status).toBe(200);

        const seller = await loginAs(database, 'seller.a');
        const admin = await loginAs(database, 'admin');
        for (const session of [seller, rider, admin]) {
          const response = await readProof(database, tracked.store, session, parcel.parcelId);
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toBe('image/jpeg');
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(response.headers.get('x-content-type-options')).toBe('nosniff');
          expect(response.headers.get('content-disposition')).toBe('inline; filename="delivery-proof.jpg"');
          expect(Number(response.headers.get('content-length'))).toBe((await response.arrayBuffer()).byteLength);
        }
        for (const who of ['seller.b', 'rider.b'] as const) {
          expect((await readProof(database, tracked.store, await loginAs(database, who), parcel.parcelId)).status).toBe(404);
        }
        expect((await readProof(database, tracked.store, undefined, parcel.parcelId)).status).toBe(401);
        expect((await readProof(database, tracked.store, admin, '../private')).status).toBe(404);
        const owner = await database.migrationClient();
        const views = await owner.query(`
          SELECT actor_id, event_type, outcome FROM app.audit_event
          WHERE parcel_id = $1 AND event_type = 'PROOF_VIEWED' ORDER BY id
        `, [parcel.parcelId]);
        expect(views.rows).toEqual([
          { actor_id: seller.principal.id, event_type: 'PROOF_VIEWED', outcome: 'SUCCESS' },
          { actor_id: rider.principal.id, event_type: 'PROOF_VIEWED', outcome: 'SUCCESS' },
          { actor_id: admin.principal.id, event_type: 'PROOF_VIEWED', outcome: 'SUCCESS' },
        ]);

        const fixture = await database.fixtureClient();
        await fixture.query('BEGIN');
        await fixture.query('SET LOCAL ROLE domain_writer');
        await fixture.query(`
          UPDATE app.parcel SET anonymized_at = now(), recipient_name = NULL, recipient_phone = NULL,
            recipient_address = NULL, creation_fingerprint = NULL WHERE id = $1
        `, [parcel.parcelId]);
        await fixture.query('COMMIT');
        expect((await readProof(database, tracked.store, seller, parcel.parcelId)).status).toBe(404);
      } finally { await tracked.cleanup(); }
    });
  });

  it('TC09 returns one coherent dashboard snapshot to Admin only', async () => {
    await harness.run(async database => {
      await seedRiderParcels(database);
      const dashboard = createDashboardHandler(authorize(database));
      const admin = await loginAs(database, 'admin');
      const response = await dashboard(admin.request('/admin/dashboard'));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        counts: { REGISTERED: 3, ASSIGNED: 3, OUT_FOR_DELIVERY: 0, DELIVERED: 0, FAILED: 0 },
        total: 6,
      });
      expect(Object.values(body.counts).reduce((sum: number, value) => sum + Number(value), 0)).toBe(body.total);
      expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/recipient|phone|address/i);

      for (const who of ['seller.a', 'rider.a'] as const) {
        expect((await dashboard((await loginAs(database, who)).request('/admin/dashboard'))).status).toBe(403);
      }
      expect((await dashboard(new Request(origin() + '/api/v1/admin/dashboard'))).status).toBe(401);
    });
  });
});
