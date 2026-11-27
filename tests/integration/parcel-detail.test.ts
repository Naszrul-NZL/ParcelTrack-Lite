import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPrincipalUow } from '@/server/core/authorized';
import { transaction } from '@/server/core/db';
import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';
import { createDatabaseHarness, type AccountName, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, loginAs, origin, type LoginSession } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const readers = (database: IsolatedDatabase) => createParcelReadHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

// The exact A12 field allowlist (M2-PH3-T03). A new top-level field must be added here on purpose.
const DETAIL_KEYS = ['anonymized', 'assignedRider', 'createdAt', 'currentStatus', 'hasProof', 'history', 'id',
  'recipient', 'terminalAt', 'trackingNumber', 'version', 'weightKg'];

type Event = { status: string; at: string; by: AccountName };
type SeedOptions = {
  seller?: AccountName; rider?: AccountName | null; status: string; history: Event[];
  terminalAt?: string; proof?: boolean; anonymized?: boolean;
};

/** TMP-06 test-only DML for states that real flows reach slowly (final outcome with proof, anonymized). */
async function seedParcel(client: Client, database: IsolatedDatabase, options: SeedOptions) {
  const { accounts } = database;
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE domain_writer');
    const anonymized = options.anonymized ?? false;
    const { rows: [parcel] } = await client.query<{ id: string; tracking_number: string }>(`
      INSERT INTO app.parcel (tracking_number, seller_id, assigned_rider_id, recipient_name, recipient_phone,
        recipient_address, weight_kg, current_status, version, client_request_id, creation_fingerprint, created_at,
        terminal_at, delivered_at, anonymized_at)
      VALUES ($1, $2, $3, $4, $5, $6, 2.500, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id::text, tracking_number
    `, [
      'PTL-' + randomBytes(16).toString('hex').toUpperCase(), accounts[options.seller ?? 'seller.a'],
      options.rider ? accounts[options.rider] : null,
      anonymized ? null : 'Detail Recipient', anonymized ? null : '+60123456789', anonymized ? null : 'Detail address',
      options.status, options.history.length, randomUUID(), anonymized ? null : 'b'.repeat(64), options.history[0].at,
      options.terminalAt ?? null, options.status === 'DELIVERED' ? options.terminalAt : null,
      anonymized ? options.terminalAt ?? options.history.at(-1)!.at : null,
    ]);
    for (const event of options.history) {
      await client.query('INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, $3, $4)',
        [parcel.id, accounts[event.by], event.status, event.at]);
    }
    if (options.proof) {
      await client.query(`INSERT INTO app.delivery_proof (parcel_id, uploaded_by_id, storage_key, media_type, size_bytes)
        VALUES ($1, $2, $3, 'image/jpeg', 2048)`, [parcel.id, accounts[options.rider!], `${parcel.id}/${randomBytes(16).toString('hex')}.jpg`]);
    }
    await client.query('COMMIT');
    return { parcelId: parcel.id, trackingNumber: parcel.tracking_number };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function reader(database: IsolatedDatabase) {
  const { detail } = readers(database);
  return async (actor: LoginSession | null, parcelId: string) => {
    const request = actor ? actor.request('/parcels/' + parcelId) : apiRequest('/parcels/' + parcelId);
    const response = await detail(request, { params: Promise.resolve({ parcelId }) });
    return { status: response.status, body: await response.json() };
  };
}

const deliveredHistory: Event[] = [
  { status: 'REGISTERED', at: '2026-03-01T01:00:00.000Z', by: 'seller.a' },
  { status: 'ASSIGNED', at: '2026-03-01T02:00:00.000Z', by: 'admin' },
  { status: 'OUT_FOR_DELIVERY', at: '2026-03-01T03:00:00.000Z', by: 'rider.a' },
  { status: 'DELIVERED', at: '2026-03-01T04:00:00.000Z', by: 'rider.a' },
];

it('M2-PH3-TC05 serves registered, assigned, final and anonymized parcels with the contract fields to each reader', async () => {
  await harness.run(async database => {
    const client = await database.fixtureClient();
    const [assigned, , , registered] = await seedRiderParcels(database);
    const delivered = await seedParcel(client, database, {
      rider: 'rider.a', status: 'DELIVERED', history: deliveredHistory, terminalAt: '2026-03-01T04:00:00.000Z', proof: true,
    });
    const anonymized = await seedParcel(client, database, {
      rider: 'rider.a', status: 'FAILED', terminalAt: '2025-01-01T04:00:00.000Z', anonymized: true, history: [
        { status: 'REGISTERED', at: '2025-01-01T01:00:00.000Z', by: 'seller.a' },
        { status: 'ASSIGNED', at: '2025-01-01T02:00:00.000Z', by: 'admin' },
        { status: 'OUT_FOR_DELIVERY', at: '2025-01-01T03:00:00.000Z', by: 'rider.a' },
        { status: 'FAILED', at: '2025-01-01T04:00:00.000Z', by: 'rider.a' },
      ],
    });
    const read = reader(database);
    const seller = await loginAs(database, 'seller.a');
    const rider = await loginAs(database, 'rider.a');
    const admin = await loginAs(database, 'admin');
    const riderSummary = { id: rider.principal.id, displayName: rider.principal.displayName, isActive: true };

    for (const actor of [seller, admin]) {
      const { status, body } = await read(actor, registered.parcelId);
      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(DETAIL_KEYS);
      expect(body).toMatchObject({
        id: registered.parcelId, trackingNumber: registered.trackingNumber, currentStatus: 'REGISTERED',
        assignedRider: null, hasProof: false, anonymized: false, terminalAt: null,
        recipient: { name: 'Synthetic Recipient', phone: '+60000000000', address: 'Fictional test address' },
      });
      expect(body.history).toHaveLength(1);
    }
    // An unassigned Rider cannot read a parcel that has no Rider yet.
    expect((await read(rider, registered.parcelId)).status).toBe(404);

    for (const actor of [seller, rider, admin]) {
      const { status, body } = await read(actor, assigned.parcelId);
      expect(status).toBe(200);
      expect(body).toMatchObject({ currentStatus: 'ASSIGNED', assignedRider: riderSummary, hasProof: false, terminalAt: null });
    }

    for (const actor of [seller, rider, admin]) {
      const { status, body } = await read(actor, delivered.parcelId);
      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(DETAIL_KEYS);
      expect(body).toMatchObject({
        currentStatus: 'DELIVERED', hasProof: true, anonymized: false, terminalAt: '2026-03-01T04:00:00.000Z',
        assignedRider: riderSummary, version: 4,
      });
      expect(body.history.map((event: { status: string; changedAt: string }) => [event.status, event.changedAt]))
        .toEqual(deliveredHistory.map(event => [event.status, event.at]));
    }

    for (const actor of [seller, rider, admin]) {
      const { status, body } = await read(actor, anonymized.parcelId);
      expect(status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(DETAIL_KEYS);
      expect(body).toMatchObject({
        currentStatus: 'FAILED', anonymized: true, hasProof: false, terminalAt: '2025-01-01T04:00:00.000Z',
        recipient: { name: null, phone: null, address: null },
      });
      // Anonymization removes recipient data only; the delivery history stays whole.
      expect(body.history.map((event: { status: string }) => event.status)).toEqual(['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'FAILED']);
    }
  });
});

it('M2-PH3-TC05 hides a reassigned parcel from the old Rider with the uniform 404 and shows it to the new one', async () => {
  await harness.run(async database => {
    const [assigned] = await seedRiderParcels(database);
    const read = reader(database);
    const oldRider = await loginAs(database, 'rider.a');
    const newRider = await loginAs(database, 'rider.b');
    expect((await read(oldRider, assigned.parcelId)).status).toBe(200);
    const unknown = await read(oldRider, '999999999999999999');

    // A real reassignment through M3's assign_parcel (version 2 after the seeded assignment).
    await transaction(database.pool(), { actor: { userId: database.accounts.admin, sessionVersion: 1 }, write: true },
      client => client.query('SELECT app.assign_parcel($1, $2, $3)', [assigned.parcelId, database.accounts['rider.b'], 2]));

    const hidden = await read(oldRider, assigned.parcelId);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toEqual(unknown.body.error);
    const shown = await read(newRider, assigned.parcelId);
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({
      currentStatus: 'ASSIGNED', version: 3,
      assignedRider: { id: newRider.principal.id, displayName: newRider.principal.displayName, isActive: true },
    });
  });
});

it('M2-PH3-TC20 gives changedBy to the Admin only and orders history by time, then id', async () => {
  await harness.run(async database => {
    const client = await database.fixtureClient();
    // Two events share a timestamp, so their order must come from the id tie-break.
    const parcel = await seedParcel(client, database, {
      rider: 'rider.a', status: 'OUT_FOR_DELIVERY', history: [
        { status: 'REGISTERED', at: '2026-04-01T01:00:00.000Z', by: 'seller.a' },
        { status: 'ASSIGNED', at: '2026-04-01T02:00:00.000Z', by: 'admin' },
        { status: 'OUT_FOR_DELIVERY', at: '2026-04-01T02:00:00.000Z', by: 'rider.a' },
      ],
    });
    const read = reader(database);
    const seller = await loginAs(database, 'seller.a');
    const rider = await loginAs(database, 'rider.a');
    const admin = await loginAs(database, 'admin');

    const adminView = await read(admin, parcel.parcelId);
    expect(adminView.status).toBe(200);
    expect(adminView.body.history).toEqual([
      { status: 'REGISTERED', changedAt: '2026-04-01T01:00:00.000Z', changedBy: { id: seller.principal.id, displayName: seller.principal.displayName } },
      { status: 'ASSIGNED', changedAt: '2026-04-01T02:00:00.000Z', changedBy: { id: admin.principal.id, displayName: admin.principal.displayName } },
      { status: 'OUT_FOR_DELIVERY', changedAt: '2026-04-01T02:00:00.000Z', changedBy: { id: rider.principal.id, displayName: rider.principal.displayName } },
    ]);
    for (const actor of [seller, rider]) {
      const view = await read(actor, parcel.parcelId);
      expect(view.status).toBe(200);
      // Same events, same order, and no actor on any of them.
      expect(view.body.history).toEqual(adminView.body.history.map(({ status, changedAt }: { status: string; changedAt: string }) => ({ status, changedAt })));
      expect(JSON.stringify(view.body)).not.toContain('changedBy');
    }
    const anonymous = await read(null, parcel.parcelId);
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toContain('changedBy');
  });
});
