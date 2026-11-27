import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { lookupTracking } from '@/server/modules/parcels/tracking';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const TOKEN = 'PTL-' + 'C0FFEE'.padEnd(32, '1');
const NEIGHBOUR = 'PTL-' + 'C0FFEE'.padEnd(32, '2');

/** A parcel with three history events, two of them at the same instant (order then comes from the history id). */
async function seed(database: IsolatedDatabase) {
  const client = await database.fixtureClient();
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE domain_writer');
  const { rows: [parcel] } = await client.query<{ id: string }>(`
    INSERT INTO app.parcel (tracking_number, seller_id, assigned_rider_id, recipient_name, recipient_phone, recipient_address,
      weight_kg, current_status, version, client_request_id, creation_fingerprint, created_at)
    VALUES ($1, $2, $3, 'Private Recipient', '+60123456789', 'Private address', 1, 'OUT_FOR_DELIVERY', 3, $4, repeat('d', 64), '2026-05-01T01:00:00Z')
    RETURNING id::text`, [TOKEN, database.accounts['seller.a'], database.accounts['rider.a'], randomUUID()]);
  for (const [status, at, by] of [['REGISTERED', '2026-05-01T01:00:00Z', 'seller.a'], ['ASSIGNED', '2026-05-01T02:00:00Z', 'admin'], ['OUT_FOR_DELIVERY', '2026-05-01T02:00:00Z', 'rider.a']] as const) {
    await client.query('INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, $3, $4)', [parcel.id, database.accounts[by], status, at]);
  }
  await client.query('COMMIT');
  return parcel.id;
}

const expected = { history: [
  { status: 'REGISTERED', changedAt: '2026-05-01T01:00:00.000Z' },
  { status: 'ASSIGNED', changedAt: '2026-05-01T02:00:00.000Z' },
  { status: 'OUT_FOR_DELIVERY', changedAt: '2026-05-01T02:00:00.000Z' },
] };

async function errorCode(work: Promise<unknown>) {
  try { await work; return 'none'; } catch (error) { return (error as { code?: string }).code; }
}

it('M2-PH3-TC06 lets tracking_runtime read status and time for one exact token, and nothing else', async () => {
  await harness.run(async database => {
    const parcelId = await seed(database);
    const pool = database.pool('tracking_runtime');
    expect(await lookupTracking(TOKEN, pool)).toEqual(expected);
    // Exact match only: no prefix, pattern, case variant, neighbour or malformed value finds anything.
    for (const token of [NEIGHBOUR, TOKEN.toLowerCase(), TOKEN.slice(0, -1), TOKEN + '1', 'PTL-%', 'PTL-' + '_'.repeat(32),
      "' OR '1'='1", 'PTL-' + '0'.repeat(32), '']) {
      expect(await lookupTracking(token, pool), token).toBeNull();
    }

    const client = await pool.connect();
    try {
      // The raw function result has only the two public columns.
      const raw = await client.query('SELECT * FROM app.lookup_tracking($1)', [TOKEN]);
      expect(raw.fields.map(field => field.name)).toEqual(['status', 'changed_at']);
      // No table access, no writes, and no other function.
      for (const sql of [
        'SELECT * FROM app.parcel', 'SELECT id, tracking_number FROM app.parcel', 'SELECT * FROM app.parcel_status_history',
        'SELECT * FROM app.app_user', 'SELECT * FROM app.delivery_proof', 'SELECT * FROM app.audit_event',
        `UPDATE app.parcel SET current_status = 'DELIVERED' WHERE id = ${Number(parcelId)}`,
        "SELECT * FROM app.get_login_snapshot('seller.a')",
      ]) {
        expect(await errorCode(client.query(sql)), sql).toBe('42501');
      }
    } finally { client.release(true); }
  });
});

it('M2-PH3-TC06 has a hardened owner, a fixed search path and execute for tracking_runtime only', async () => {
  await harness.run(async database => {
    const owner: Client = await database.migrationClient();
    const { rows: [fn] } = await owner.query(`
      SELECT r.rolname AS owner, p.prosecdef, p.proconfig, p.provolatile,
        has_function_privilege('tracking_runtime', p.oid, 'EXECUTE') AS tracking,
        has_function_privilege('app_runtime', p.oid, 'EXECUTE') AS app,
        has_function_privilege('maintenance_runtime', p.oid, 'EXECUTE') AS maintenance,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'app' AND p.proname = 'lookup_tracking'`);
    expect(fn).toEqual({
      owner: 'lookup_fn_owner', prosecdef: true, proconfig: ['search_path=pg_catalog, app, pg_temp'], provolatile: 's',
      tracking: true, app: false, maintenance: false, anon: false, authenticated: false, public_execute: false,
    });
    // tracking_runtime can execute exactly one function in the app schema.
    const { rows } = await owner.query(`
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND has_function_privilege('tracking_runtime', p.oid, 'EXECUTE') ORDER BY p.proname`);
    expect(rows.map(row => row.proname)).toEqual(['lookup_tracking']);
    // The owner reads only the token and the public history columns.
    const { rows: columns } = await owner.query(`
      SELECT table_name, column_name FROM information_schema.column_privileges
      WHERE grantee = 'lookup_fn_owner' AND privilege_type = 'SELECT' AND table_schema = 'app' ORDER BY table_name, column_name`);
    expect(columns).toEqual([
      { table_name: 'parcel', column_name: 'id' }, { table_name: 'parcel', column_name: 'tracking_number' },
      { table_name: 'parcel_status_history', column_name: 'changed_at' }, { table_name: 'parcel_status_history', column_name: 'id' },
      { table_name: 'parcel_status_history', column_name: 'parcel_id' }, { table_name: 'parcel_status_history', column_name: 'status' },
    ]);
  });
});

it('M2-PH3-TC06 ignores hostile temporary objects that shadow the tables it reads', async () => {
  await harness.run(async database => {
    await seed(database);
    const client = await database.pool('tracking_runtime').connect();
    try {
      // tracking_runtime may create temporary objects; pg_temp is last on the function's search path.
      await client.query('CREATE TEMP TABLE parcel (id bigint, tracking_number text)');
      await client.query('CREATE TEMP TABLE parcel_status_history (id bigint, parcel_id bigint, status text, changed_at timestamptz)');
      await client.query(`INSERT INTO pg_temp.parcel VALUES (1, '${NEIGHBOUR}')`);
      await client.query("INSERT INTO pg_temp.parcel_status_history VALUES (1, 1, 'DELIVERED', now())");
      const shadowed = await client.query('SELECT status, changed_at FROM app.lookup_tracking($1)', [TOKEN]);
      expect(shadowed.rows.map(row => row.status)).toEqual(['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY']);
      expect((await client.query('SELECT * FROM app.lookup_tracking($1)', [NEIGHBOUR])).rows).toEqual([]);
    } finally { client.release(true); }
  });
});
