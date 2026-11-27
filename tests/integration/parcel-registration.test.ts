import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';
import { makeTracking } from '@/server/modules/parcels/tokens';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const input = (patch = {}) => ({
  recipientName: 'Synthetic Recipient', recipientPhone: '012-345 6789', recipientAddress: '<script> stays text',
  weightKg: '1.25', clientRequestId: randomUUID(), ...patch,
});
const init = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const registration = (database: IsolatedDatabase, tracking = makeTracking) =>
  createRegistrationHandler(createPrincipalUow(database.pool(), {
    APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
  }), () => process.env.FINGERPRINT_KEY!, tracking);

it('commits a Seller parcel, first history and redacted audit together and replays a repeated request', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const register = registration(database);
    const body = input();
    const created = await register(seller.request('/parcels', init(body)));
    expect(created.status).toBe(201);
    const parcel = await created.json();
    expect(parcel).toMatchObject({
      trackingNumber: expect.stringMatching(/^PTL-[A-F0-9]{32}$/), currentStatus: 'REGISTERED', version: 1,
      weightKg: '1.250', recipient: { name: body.recipientName, phone: '+60123456789', address: body.recipientAddress },
      history: [{ status: 'REGISTERED', changedAt: parcel.createdAt }],
    });
    const owner = await database.migrationClient();
    const parcels = await database.fixtureClient();
    await parcels.query('SET ROLE domain_writer');
    expect((await parcels.query('SELECT seller_id FROM app.parcel WHERE id = $1', [parcel.id])).rows)
      .toEqual([{ seller_id: seller.principal.id }]);
    expect((await parcels.query('SELECT changed_by_id, status FROM app.parcel_status_history WHERE parcel_id = $1', [parcel.id])).rows)
      .toEqual([{ changed_by_id: seller.principal.id, status: 'REGISTERED' }]);
    expect((await owner.query("SELECT actor_id, details, request_id FROM app.audit_event WHERE parcel_id = $1 AND event_type = 'PARCEL_REGISTERED'", [parcel.id])).rows)
      .toEqual([{ actor_id: seller.principal.id, details: {}, request_id: created.headers.get('x-request-id') }]);
    // M2-PH3-T01: the same request again returns the original parcel without writing anything new.
    const duplicate = await register(seller.request('/parcels', init(body)));
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(parcel);
    expect((await owner.query("SELECT count(*)::int AS count FROM app.audit_event WHERE parcel_id = $1 AND event_type = 'PARCEL_REGISTERED'", [parcel.id])).rows)
      .toEqual([{ count: 1 }]);
    expect((await parcels.query('SELECT id FROM app.parcel WHERE seller_id = $1 AND client_request_id = $2', [seller.principal.id, body.clientRequestId])).rows)
      .toEqual([{ id: parcel.id }]);
  });
});

it('rejects forged fields, malformed values and missing or other-session CSRF without a write', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const other = await loginAs(database, 'seller.b');
    const register = registration(database);
    for (const patch of [
      { sellerId: other.principal.id, assignedRiderId: '5', currentStatus: 'DELIVERED', trackingNumber: makeTracking() },
      { recipientPhone: '0123' }, ...['0','-5','abc','1e2','NaN'].map(weightKg => ({ weightKg })),
      { recipientName: '' }, { recipientName: 'a'.repeat(121) },
    ]) {
      const response = await register(seller.request('/parcels', init(input(patch))));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
    for (const csrfToken of [undefined, other.csrfToken]) {
      const response = await register(apiRequest('/parcels', { ...init(input()), cookie: seller.cookie, csrfToken }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'CSRF_INVALID' } });
    }
    const owner = await database.migrationClient();
    const parcels = await database.fixtureClient();
    await parcels.query('SET ROLE domain_writer');
    expect((await owner.query("SELECT id FROM app.audit_event WHERE event_type = 'PARCEL_REGISTERED'")).rowCount).toBe(0);
    expect((await parcels.query('SELECT id FROM app.parcel')).rowCount).toBe(2);
  });
});

it('retries a tracking collision but rolls back the parcel and history when audit insertion fails', async () => {
  await harness.run(async database => {
    const seller = await loginAs(database, 'seller.a');
    const owner = await database.migrationClient();
    const parcels = await database.fixtureClient();
    await parcels.query('SET ROLE domain_writer');
    const existing = (await parcels.query<{ tracking_number: string }>('SELECT tracking_number FROM app.parcel LIMIT 1')).rows[0].tracking_number;
    const tracking = vi.fn(() => makeTracking()).mockReturnValueOnce(existing);
    const register = registration(database, tracking);
    expect((await register(seller.request('/parcels', init(input())))).status).toBe(201);
    expect(tracking).toHaveBeenCalledTimes(2);

    await owner.query(`CREATE FUNCTION app.reject_test_registration() RETURNS trigger LANGUAGE plpgsql
      SET search_path = pg_catalog, app, pg_temp AS $$
      BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END;
      $$;
      CREATE TRIGGER reject_test_registration BEFORE INSERT ON app.audit_event FOR EACH ROW
      WHEN (NEW.event_type = 'PARCEL_REGISTERED') EXECUTE FUNCTION app.reject_test_registration();`);
    const before = await parcels.query('SELECT (SELECT count(*) FROM app.parcel) AS parcels, (SELECT count(*) FROM app.parcel_status_history) AS history');
    const failed = await register(seller.request('/parcels', init(input())));
    expect(failed.status).toBe(500);
    expect(tracking).toHaveBeenCalledTimes(3);
    expect((await parcels.query('SELECT (SELECT count(*) FROM app.parcel) AS parcels, (SELECT count(*) FROM app.parcel_status_history) AS history')).rows).toEqual(before.rows);
  });
});

it('keeps direct writes and unapproved function callers denied', async () => {
  await harness.run(async database => {
    const call = 'SELECT id FROM app.create_parcel($1,$2,$3,$4,$5,$6,$7,$8)';
    const values = ['Synthetic', '+60123456789', 'Synthetic address', '1.000', randomUUID(), 'a'.repeat(64), makeTracking(), randomUUID()];
    const app = await database.pool().connect();
    const tracking = await database.pool('tracking_runtime').connect();
    try {
      await expect(tracking.query(call, values)).rejects.toMatchObject({ code: '42501' });
      for (const query of [
        'INSERT INTO app.parcel DEFAULT VALUES', 'UPDATE app.parcel SET version = 3', 'DELETE FROM app.parcel',
        'INSERT INTO app.parcel_status_history DEFAULT VALUES', "UPDATE app.parcel_status_history SET status = 'FAILED'",
        'DELETE FROM app.parcel_status_history',
      ]) await expect(app.query(query)).rejects.toMatchObject({ code: '42501' });
      await expect(app.query(call, values)).rejects.toMatchObject({ code: 'PT012' });
      await app.query("SELECT set_config('app.user_id', $1, false), set_config('app.session_version', '1', false)", [database.accounts['rider.a']]);
      await expect(app.query(call, values)).rejects.toMatchObject({ code: 'PT001' });
      await app.query("SELECT set_config('app.user_id', $1, false)", [database.accounts['seller.a']]);
      await expect(app.query(call, [...values.slice(0, 3), '0', ...values.slice(4)])).rejects.toMatchObject({ code: '23514' });
    } finally {
      app.release();
      tracking.release();
    }
  });
});
