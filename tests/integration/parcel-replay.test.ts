import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const input = (patch = {}) => ({
  recipientName: 'Replay Recipient', recipientPhone: '012-345 6789', recipientAddress: '12 Replay Road',
  weightKg: '1.5', clientRequestId: randomUUID(), ...patch,
});
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const registration = (database: IsolatedDatabase) => createRegistrationHandler(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}), () => process.env.FINGERPRINT_KEY!);

async function counts(database: IsolatedDatabase, sellerId: string, clientRequestId: string) {
  const client = await database.fixtureClient();
  await client.query('SET ROLE domain_writer');
  const { rows: [row] } = await client.query<{ parcels: number; history: number }>(`
    SELECT count(DISTINCT p.id)::int AS parcels, count(h.id)::int AS history
    FROM app.parcel p LEFT JOIN app.parcel_status_history h ON h.parcel_id = p.id
    WHERE p.seller_id = $1 AND p.client_request_id = $2
  `, [sellerId, clientRequestId]);
  await client.query('RESET ROLE');
  return row;
}

it('M2-PH3-TC01 replays the same request, refuses changed data and keeps each Seller’s keys apart', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const other = await loginAs(database, 'seller.b');
    const register = registration(database);
    const body = input();

    const created = await register(seller.request('/parcels', post(body)));
    expect(created.status).toBe(201);
    const original = await created.json();

    // Equivalent input after normalization (spacing, phone format, weight places) is the same request.
    const equivalent = await register(seller.request('/parcels', post({
      ...body, recipientName: '  Replay Recipient ', recipientPhone: '+60 12-345 6789', weightKg: '1.500',
    })));
    expect(equivalent.status).toBe(200);
    expect(await equivalent.json()).toEqual(original);

    for (const change of [{ recipientName: 'Someone Else' }, { recipientPhone: '0123456780' }, { recipientAddress: '13 Replay Road' }, { weightKg: '1.501' }]) {
      const conflict = await register(seller.request('/parcels', post({ ...body, ...change })));
      expect(conflict.status, JSON.stringify(change)).toBe(409);
      const envelope = await conflict.json();
      expect(envelope.error.code).toBe('IDEMPOTENCY_CONFLICT');
      // The conflict reveals nothing about the stored parcel.
      expect(JSON.stringify(envelope)).not.toContain(original.trackingNumber);
    }
    expect(await counts(database, seller.principal.id, body.clientRequestId)).toEqual({ parcels: 1, history: 1 });

    // The same key from another Seller is an independent registration.
    const independent = await register(other.request('/parcels', post(body)));
    expect(independent.status).toBe(201);
    expect((await independent.json()).id).not.toBe(original.id);
    expect(await counts(database, other.principal.id, body.clientRequestId)).toEqual({ parcels: 1, history: 1 });
  });
});

it('M2-PH3-TC01 gives both of two simultaneous identical requests the one parcel', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const register = registration(database);
    const body = input();
    const responses = await Promise.all([
      register(seller.request('/parcels', post(body))),
      register(seller.request('/parcels', post(body))),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const [first, second] = await Promise.all(responses.map(response => response.json()));
    expect(first.id).toBe(second.id);
    expect(first.trackingNumber).toBe(second.trackingNumber);
    expect(await counts(database, seller.principal.id, body.clientRequestId)).toEqual({ parcels: 1, history: 1 });
  });
});

it('M2-PH3-TC01 answers a key whose parcel was anonymized with REQUEST_EXPIRED and recreates nothing', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const register = registration(database);
    const body = input();
    const created = await (await register(seller.request('/parcels', post(body)))).json();

    // TMP-06 test-only DML standing in for anonymize_parcel (M2-PH3-T08) on this one row.
    const client = await database.fixtureClient();
    await client.query('SET ROLE domain_writer');
    await client.query(`UPDATE app.parcel SET recipient_name = NULL, recipient_phone = NULL, recipient_address = NULL,
      creation_fingerprint = NULL, anonymized_at = now(), version = version + 1 WHERE id = $1`, [created.id]);
    await client.query('RESET ROLE');

    for (const attempt of [body, { ...body, recipientName: 'Changed' }]) {
      const expired = await register(seller.request('/parcels', post(attempt)));
      expect(expired.status).toBe(409);
      expect((await expired.json()).error.code).toBe('REQUEST_EXPIRED');
    }
    expect(await counts(database, seller.principal.id, body.clientRequestId)).toEqual({ parcels: 1, history: 1 });
    await client.query('SET ROLE domain_writer');
    expect((await client.query('SELECT recipient_name, creation_fingerprint FROM app.parcel WHERE id = $1', [created.id])).rows)
      .toEqual([{ recipient_name: null, creation_fingerprint: null }]);
  });
});
