import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { createPrincipalUow } from '@/server/core/authorized';
import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';
import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';
import { lookupTracking } from '@/server/modules/parcels/tracking';
import { createDatabaseHarness, type AccountName, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

/**
 * Signs in to the per-case database as maintenance_runtime, the role of the private PH4 retention job, using the
 * generated local password from the private operator settings. The caller must end the client before the case ends.
 */
async function maintenance(database: IsolatedDatabase) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.username = 'maintenance_runtime';
  url.password = encodeURIComponent(process.env.DB_PASSWORD_MAINTENANCE_RUNTIME!);
  url.pathname = '/' + database.name;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    expect((await client.query('SELECT current_user')).rows[0].current_user).toBe('maintenance_runtime');
  } catch (error) { await client.end(); throw error; }
  return client;
}

type Seed = { key: string; status: string; terminalAt?: string; lastChange: string; anonymized?: boolean };

/** TMP-06 test-only DML: parcels whose terminal time or last status change lies at chosen instants. */
async function seed(database: IsolatedDatabase, parcels: Seed[]) {
  const client = await database.fixtureClient();
  const ids: Record<string, string> = {};
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE domain_writer');
  for (const parcel of parcels) {
    const anonymized = parcel.anonymized ?? false;
    const first = '2024-01-01T00:00:00Z';
    const { rows: [row] } = await client.query<{ id: string }>(`
      INSERT INTO app.parcel (tracking_number, seller_id, recipient_name, recipient_phone, recipient_address, weight_kg,
        current_status, client_request_id, creation_fingerprint, created_at, terminal_at, delivered_at, anonymized_at)
      VALUES ('PTL-' || upper(replace(gen_random_uuid()::text, '-', '')), $1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id::text`, [
      database.accounts['seller.a'], anonymized ? null : 'Retention Recipient', anonymized ? null : '+60123456789',
      anonymized ? null : 'Retention address', parcel.status, randomUUID(), anonymized ? null : 'e'.repeat(64), first,
      parcel.terminalAt ?? null, parcel.status === 'DELIVERED' ? parcel.terminalAt : null, anonymized ? parcel.lastChange : null,
    ]);
    await client.query("INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, 'REGISTERED', $3)",
      [row.id, database.accounts['seller.a'], first]);
    if (parcel.status !== 'REGISTERED' || parcel.lastChange !== first) {
      await client.query('INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, $3, $4)',
        [row.id, database.accounts[(parcel.status === 'ASSIGNED' ? 'admin' : 'seller.a') as AccountName], parcel.status, parcel.lastChange]);
    }
    ids[parcel.key] = row.id;
  }
  await client.query('COMMIT');
  return ids;
}

const second = 1000;
const at = (iso: string, offset = 0) => new Date(Date.parse(iso) + offset).toISOString();

it('M2-PH3-TC12 selects parcels due 12 months after terminal_at or the last status change, at the exact boundary', async () => {
  await harness.run(async database => {
    const ids = await seed(database, [
      { key: 'delivered', status: 'DELIVERED', terminalAt: '2025-03-15T10:00:00Z', lastChange: '2025-03-15T10:00:00Z' },
      { key: 'failed', status: 'FAILED', terminalAt: '2025-03-15T10:00:00Z', lastChange: '2025-03-15T10:00:00Z' },
      { key: 'leap', status: 'DELIVERED', terminalAt: '2028-02-29T12:00:00Z', lastChange: '2028-02-29T12:00:00Z' },
      // 04:00 on 29 February in Malaysia, 20:00 on the 28th in UTC: the rule counts months in UTC.
      { key: 'zone', status: 'FAILED', terminalAt: '2028-02-28T20:00:00Z', lastChange: '2028-02-28T20:00:00Z' },
      { key: 'monthEnd', status: 'DELIVERED', terminalAt: '2025-12-31T23:30:00Z', lastChange: '2025-12-31T23:30:00Z' },
      // D-31: never terminal. Stalled since March 2025, or created long ago but moved recently.
      { key: 'stalled', status: 'REGISTERED', lastChange: '2025-03-15T10:00:00Z' },
      { key: 'moving', status: 'ASSIGNED', lastChange: '2026-03-01T00:00:00Z' },
      { key: 'done', status: 'DELIVERED', terminalAt: '2024-06-01T00:00:00Z', lastChange: '2024-06-01T00:00:00Z', anonymized: true },
    ]);
    const known = new Map(Object.entries(ids).map(([key, id]) => [id, key]));
    const client = await maintenance(database);
    try {
      // The harness template also holds recent parcels; compare only the ones seeded here.
      const due = async (asOf: string, batch = 1000) => (await client.query<{ parcel_id: string }>(
        'SELECT parcel_id::text FROM app.list_retention_candidates($1, $2)', [batch, asOf])).rows
        .map(row => known.get(row.parcel_id)).filter(Boolean).sort();

      const boundary = '2026-03-15T10:00:00Z';
      expect(await due(at(boundary, -second))).toEqual([]);
      expect(await due(boundary)).toEqual(['delivered', 'failed', 'stalled']);
      expect(await due(at(boundary, second))).toEqual(['delivered', 'failed', 'stalled']);
      // The parcel that changed status in March 2026 is due a year after that change, not after its creation.
      expect(await due('2027-02-28T23:59:59Z')).not.toContain('moving');
      expect(await due('2027-03-01T00:00:00Z')).toContain('moving');
      expect(await due('2026-12-31T23:29:59Z')).not.toContain('monthEnd');
      expect(await due('2026-12-31T23:30:00Z')).toContain('monthEnd');
      // 29 February 2028 plus 12 months is 28 February 2029.
      expect(await due('2029-02-28T11:59:59Z')).not.toContain('leap');
      expect(await due('2029-02-28T12:00:00Z')).toContain('leap');
      // The session time zone changes nothing.
      await client.query("SET TIME ZONE 'Asia/Kuala_Lumpur'");
      expect(await due('2029-02-28T19:59:59Z')).not.toContain('zone');
      expect(await due('2029-02-28T20:00:00Z')).toContain('zone');
      expect(await due('2029-12-31T00:00:00Z')).not.toContain('done');

      expect((await client.query('SELECT * FROM app.list_retention_candidates(1, $1)', [boundary])).rows).toHaveLength(1);
      for (const [batch, asOf] of [[0, boundary], [1001, boundary], [null, boundary], [10, null], [10, 'infinity']]) {
        await expect(client.query('SELECT * FROM app.list_retention_candidates($1, $2)', [batch, asOf]), `${batch} ${asOf}`)
          .rejects.toMatchObject({ code: '22023' });
      }
    } finally { await client.end(); }
  });
});

it('M2-PH3-TC12 cannot be called by any web or tracking role, so no request path can set as_of', async () => {
  await harness.run(async database => {
    const { old: parcelId } = await seed(database, [{ key: 'old', status: 'FAILED', terminalAt: '2024-01-01T00:00:00Z', lastChange: '2024-01-01T00:00:00Z' }]);
    for (const role of ['app_runtime', 'tracking_runtime'] as const) {
      const client = await database.pool(role).connect();
      try {
        await expect(client.query("SELECT * FROM app.list_retention_candidates(10, now() + interval '5 years')")).rejects.toMatchObject({ code: '42501' });
        await expect(client.query("SELECT app.anonymize_parcel($1, now() + interval '5 years')", [parcelId])).rejects.toMatchObject({ code: '42501' });
      } finally { client.release(true); }
    }
    const owner = await database.migrationClient();
    const { rows } = await owner.query(`
      SELECT p.proname, r.rolname AS owner, p.prosecdef, p.proconfig,
        array(SELECT role FROM unnest(ARRAY['app_runtime','tracking_runtime','maintenance_runtime','ops_runtime','anon','authenticated']) role
          WHERE has_function_privilege(role, p.oid, 'EXECUTE') ORDER BY role) AS callers,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'app' AND p.proname IN ('list_retention_candidates', 'anonymize_parcel') ORDER BY p.proname`);
    expect(rows).toEqual(['anonymize_parcel', 'list_retention_candidates'].map(proname => ({
      proname, owner: 'maintenance_fn_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, app, pg_temp'],
      callers: ['maintenance_runtime'], public_execute: false,
    })));
  });
});

it('M2-PH3-TC13 anonymizes once, keeps history and tracking, and expires the old creation key', async () => {
  await harness.run(async database => {
    const settings = { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' };
    const register = createRegistrationHandler(createPrincipalUow(database.pool(), settings), () => process.env.FINGERPRINT_KEY!);
    const { detail } = createParcelReadHandlers(createPrincipalUow(database.pool(), settings));
    const seller = await loginAs(database, 'seller.a');
    const body = { recipientName: 'Retention Person', recipientPhone: '0123456789', recipientAddress: '9 Retention Lane', weightKg: '2', clientRequestId: randomUUID() };
    const created = await (await register(seller.request('/parcels', { method: 'POST', body: JSON.stringify(body) }))).json();

    // Fail the parcel a minute after it was registered (TMP-06 test-only DML stands in for the delivery flow); the
    // job's as_of is then placed 12 months after that.
    const failedAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000);
    const dueAt = new Date(failedAt); dueAt.setUTCFullYear(dueAt.getUTCFullYear() + 1);
    const writer = await database.fixtureClient();
    await writer.query('BEGIN');
    await writer.query('SET LOCAL ROLE domain_writer');
    await writer.query(`UPDATE app.parcel SET current_status = 'FAILED', terminal_at = $2, version = 2 WHERE id = $1`, [created.id, failedAt]);
    await writer.query("INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, 'FAILED', $3)", [created.id, database.accounts['seller.a'], failedAt]);
    await writer.query('COMMIT');
    const historyBefore = await lookupTracking(created.trackingNumber, database.pool('tracking_runtime'));
    expect(historyBefore?.history.map(event => event.status)).toEqual(['REGISTERED', 'FAILED']);

    const client = await maintenance(database);
    try {
      // Not yet due one second before the boundary; unknown parcels are not found.
      await expect(client.query('SELECT app.anonymize_parcel($1, $2)', [created.id, new Date(dueAt.getTime() - second)])).rejects.toMatchObject({ code: 'PT004' });
      await expect(client.query('SELECT app.anonymize_parcel($1, $2)', ['999999999', dueAt])).rejects.toMatchObject({ code: 'PT002' });

      const first = await client.query('SELECT app.anonymize_parcel($1, $2) AS done', [created.id, dueAt]);
      expect(first.rows[0].done).toBe(true);
      const again = await client.query('SELECT app.anonymize_parcel($1, $2) AS done', [created.id, new Date(dueAt.getTime() + 86_400_000)]);
      expect(again.rows[0].done).toBe(false);
    } finally { await client.end(); }

    await writer.query('SET ROLE domain_writer');
    const { rows: [row] } = await writer.query(`SELECT recipient_name, recipient_phone, recipient_address, creation_fingerprint,
      anonymized_at IS NOT NULL AS anonymized, version, current_status, tracking_number FROM app.parcel WHERE id = $1`, [created.id]);
    expect(row).toEqual({
      recipient_name: null, recipient_phone: null, recipient_address: null, creation_fingerprint: null,
      anonymized: true, version: 3, current_status: 'FAILED', tracking_number: created.trackingNumber,
    });
    await writer.query('RESET ROLE');
    const owner = await database.migrationClient();
    expect((await owner.query("SELECT actor_id, outcome, details FROM app.audit_event WHERE parcel_id = $1 AND event_type = 'RETENTION_ANONYMIZED'", [created.id])).rows)
      .toEqual([{ actor_id: null, outcome: 'SUCCESS', details: { status: 'FAILED' } }]);

    // Public tracking is unchanged; the private detail shows the anonymized record; the old key has expired.
    expect(await lookupTracking(created.trackingNumber, database.pool('tracking_runtime'))).toEqual(historyBefore);
    const view = await detail(seller.request('/parcels/' + created.id), { params: Promise.resolve({ parcelId: created.id }) });
    expect(await view.json()).toMatchObject({
      anonymized: true, recipient: { name: null, phone: null, address: null }, version: 3,
      history: [{ status: 'REGISTERED' }, { status: 'FAILED' }],
    });
    const replay = await register(seller.request('/parcels', { method: 'POST', body: JSON.stringify(body) }));
    expect(replay.status).toBe(409);
    expect((await replay.json()).error.code).toBe('REQUEST_EXPIRED');
  });
});
