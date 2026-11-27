import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Client, PoolClient } from 'pg';
import { transaction } from '@/server/core/db';
import { AppError } from '@/server/core/errors';
import { canAssign, canTransition, type Decision } from '@/server/modules/delivery/rules';
import { STATUSES } from '@/shared/constants';
import { createDatabaseHarness, type AccountName, type IsolatedDatabase } from '../harness/isolated-database';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const assign = 'SELECT app.assign_parcel($1, $2, $3)';
const lock = 'SELECT * FROM app.lock_delivery_target($1, $2)';
const update = 'SELECT app.update_delivery_status($1, $2, $3, $4, $5, $6)';

function as(database: IsolatedDatabase, name: AccountName | null) {
  const actor = name ? { userId: database.accounts[name], sessionVersion: 1 } : undefined;
  return <T>(work: (client: PoolClient) => Promise<T>) => transaction(database.pool(), { actor, write: true }, work);
}

async function asOwner<T>(migration: Client, role: string, work: () => Promise<T>) {
  await migration.query('SET ROLE ' + role);
  try { return await work(); } finally { await migration.query('RESET ROLE'); }
}

async function parcelState(migration: Client, parcelId: string) {
  const state = await asOwner(migration, 'domain_writer', async () => {
    const parcel = (await migration.query(`
      SELECT current_status, version, assigned_rider_id, terminal_at, delivered_at FROM app.parcel WHERE id = $1
    `, [parcelId])).rows[0];
    const history = (await migration.query(`
      SELECT status, changed_by_id FROM app.parcel_status_history WHERE parcel_id = $1 ORDER BY changed_at, id
    `, [parcelId])).rows;
    const proof = (await migration.query(`
      SELECT uploaded_by_id, storage_key, media_type, size_bytes FROM app.delivery_proof WHERE parcel_id = $1
    `, [parcelId])).rows;
    return { ...parcel, history, proof };
  });
  // audit_event is insert-only for domain_writer, so the migration owner reads it.
  const audit = (await migration.query(`
    SELECT actor_id, target_user_id, event_type, details FROM app.audit_event WHERE parcel_id = $1 ORDER BY id
  `, [parcelId])).rows;
  return { ...state, audit };
}

function proofKey(parcelId: string, extension: 'jpg' | 'png' = 'jpg') {
  return parcelId + '/' + 'b'.repeat(32) + '.' + extension;
}

it('TC01/TC02/TC03 assigns, no-ops and reassigns only through an active Admin and an active Rider target', async () => {
  await harness.run(async database => {
    const migration = await database.migrationClient();
    const parcels = await seedRiderParcels(database);
    const registered = parcels.find(item => item.key === 'registered')!.parcelId;
    const { accounts } = database;
    const admin = as(database, 'admin');

    for (const [caller, code] of [['rider.a', 'FORBIDDEN'], ['seller.a', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      await expect(as(database, caller)(client => client.query(assign, [registered, accounts['rider.a'], 1])))
        .rejects.toMatchObject({ code });
    }
    for (const target of [accounts.inactive, accounts['seller.a'], accounts.admin, '999999999']) {
      await expect(admin(client => client.query(assign, [registered, target, 1])))
        .rejects.toMatchObject({ code: 'INVALID_ASSIGNEE' });
    }
    await expect(admin(client => client.query(assign, ['999999999', accounts['rider.a'], 1])))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(admin(client => client.query(assign, [registered, accounts['rider.a'], 2])))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await parcelState(migration, registered)).toMatchObject({ current_status: 'REGISTERED', version: 1, audit: [] });

    await admin(client => client.query(assign, [registered, accounts['rider.a'], 1]));
    const assigned = await parcelState(migration, registered);
    expect(assigned).toMatchObject({ current_status: 'ASSIGNED', version: 2, assigned_rider_id: accounts['rider.a'] });
    expect(assigned.history).toEqual([
      { status: 'REGISTERED', changed_by_id: accounts['seller.a'] },
      { status: 'ASSIGNED', changed_by_id: accounts.admin },
    ]);
    expect(assigned.audit).toEqual([{
      actor_id: accounts.admin, target_user_id: accounts['rider.a'], event_type: 'PARCEL_ASSIGNED',
      details: { newRiderId: accounts['rider.a'] },
    }]);

    await admin(client => client.query(assign, [registered, accounts['rider.a'], 2]));
    expect(await parcelState(migration, registered)).toEqual(assigned);
    await expect(admin(client => client.query(assign, [registered, accounts['rider.b'], 1])))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    await admin(client => client.query(assign, [registered, accounts['rider.b'], 2]));
    const reassigned = await parcelState(migration, registered);
    expect(reassigned).toMatchObject({ current_status: 'ASSIGNED', version: 3, assigned_rider_id: accounts['rider.b'] });
    expect(reassigned.history).toEqual(assigned.history);
    expect(reassigned.audit[1]).toEqual({
      actor_id: accounts.admin, target_user_id: accounts['rider.b'], event_type: 'PARCEL_REASSIGNED',
      details: { oldRiderId: accounts['rider.a'], newRiderId: accounts['rider.b'], status: 'ASSIGNED' },
    });
    await expect(as(database, 'rider.a')(client => client.query(update, [registered, 3, 'OUT_FOR_DELIVERY', null, null, null])))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

it('TC11 holds the finalization lock until commit and lets only the assigned Rider finalize with proof metadata', async () => {
  await harness.run(async database => {
    const migration = await database.migrationClient();
    const parcels = await seedRiderParcels(database);
    const first = parcels.find(item => item.key === 'riderAFirst')!.parcelId;
    const second = parcels.find(item => item.key === 'riderASecond')!.parcelId;
    const { accounts } = database;
    const riderA = as(database, 'rider.a');

    await expect(riderA(client => client.query(lock, [second, 2]))).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await riderA(client => client.query(update, [first, 2, 'OUT_FOR_DELIVERY', null, null, null]));
    await expect(as(database, 'rider.b')(client => client.query(lock, [first, 3]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(as(database, 'admin')(client => client.query(lock, [first, 3]))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(riderA(client => client.query(lock, [first, 2]))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(riderA(client => client.query(update, [first, 3, 'DELIVERED', null, null, null])))
      .rejects.toMatchObject({ code: 'PROOF_REQUIRED' });
    for (const [key, media] of [
      [proofKey(second), 'image/jpeg'], [proofKey(first, 'png'), 'image/jpeg'], [proofKey(first), 'image/png'],
      ['../' + proofKey(first), 'image/jpeg'],
    ]) {
      await expect(riderA(client => client.query(update, [first, 3, 'DELIVERED', key, media, 10])))
        .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    }

    let reassignment: Promise<unknown> | undefined;
    let settled = false;
    await riderA(async client => {
      expect((await client.query(lock, [first, 3])).rows).toEqual([{ parcel_id: first, current_status: 'OUT_FOR_DELIVERY', version: 3 }]);
      reassignment = as(database, 'admin')(other => other.query(assign, [first, accounts['rider.b'], 3]))
        .finally(() => { settled = true; });
      reassignment.catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(settled).toBe(false);
      await client.query("SELECT set_config('app.request_id', $1, true)", ['00000000-0000-4000-8000-0000000000aa']);
      await client.query(update, [first, 3, 'DELIVERED', proofKey(first), 'image/jpeg', 2048]);
    });
    await expect(reassignment).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const delivered = await parcelState(migration, first);
    expect(delivered).toMatchObject({ current_status: 'DELIVERED', version: 4, assigned_rider_id: accounts['rider.a'] });
    expect(delivered.terminal_at).toBeInstanceOf(Date);
    expect(delivered.delivered_at).toEqual(delivered.terminal_at);
    expect(delivered.history.at(-1)).toEqual({ status: 'DELIVERED', changed_by_id: accounts['rider.a'] });
    expect(delivered.proof).toEqual([{ uploaded_by_id: accounts['rider.a'], storage_key: proofKey(first), media_type: 'image/jpeg', size_bytes: 2048 }]);
    expect(delivered.audit.slice(-2)).toEqual([
      { actor_id: accounts['rider.a'], target_user_id: null, event_type: 'STATUS_CHANGED', details: { oldStatus: 'OUT_FOR_DELIVERY', newStatus: 'DELIVERED' } },
      { actor_id: accounts['rider.a'], target_user_id: null, event_type: 'PROOF_UPLOADED', details: { mediaType: 'image/jpeg', sizeBytes: 2048 } },
    ]);
    await expect(riderA(client => client.query(update, [first, 4, 'FAILED', proofKey(first, 'png'), 'image/png', 10])))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(as(database, 'admin')(client => client.query(assign, [first, accounts['rider.b'], 4])))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

it('TC03/TC05 lets a new Rider fail a reassigned Out for delivery parcel and keeps the original actors', async () => {
  await harness.run(async database => {
    const migration = await database.migrationClient();
    const parcels = await seedRiderParcels(database);
    const parcel = parcels.find(item => item.key === 'riderASecond')!.parcelId;
    const { accounts } = database;

    await as(database, 'rider.a')(client => client.query(update, [parcel, 2, 'OUT_FOR_DELIVERY', null, null, null]));
    await as(database, 'admin')(client => client.query(assign, [parcel, accounts['rider.b'], 3]));
    const moved = await parcelState(migration, parcel);
    expect(moved).toMatchObject({ current_status: 'OUT_FOR_DELIVERY', version: 4, assigned_rider_id: accounts['rider.b'] });
    expect(moved.audit.at(-1)).toMatchObject({ event_type: 'PARCEL_REASSIGNED', details: { status: 'OUT_FOR_DELIVERY' } });
    await expect(as(database, 'rider.a')(client => client.query(lock, [parcel, 4]))).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await as(database, 'rider.b')(async client => {
      await client.query(lock, [parcel, 4]);
      await client.query(update, [parcel, 4, 'FAILED', proofKey(parcel, 'png'), 'image/png', 4096]);
    });
    const failed = await parcelState(migration, parcel);
    expect(failed).toMatchObject({ current_status: 'FAILED', version: 5, delivered_at: null });
    expect(failed.terminal_at).toBeInstanceOf(Date);
    expect(failed.history.map((row: { changed_by_id: string }) => row.changed_by_id)).toEqual([
      accounts['seller.a'], accounts.admin, accounts['rider.a'], accounts['rider.b'],
    ]);
    expect(failed.proof).toEqual([{ uploaded_by_id: accounts['rider.b'], storage_key: proofKey(parcel, 'png'), media_type: 'image/png', size_bytes: 4096 }]);
  });
});

it('TC05/TC12 matches rules.ts for every Rider transition with proof and every Admin assignment status', async () => {
  await harness.run(async database => {
    const migration = await database.migrationClient();
    const parcels = await seedRiderParcels(database);
    const parcel = parcels.find(item => item.key === 'riderAFirst')!.parcelId;
    const { accounts } = database;
    const reset = (status: string) => asOwner(migration, 'domain_writer', () => migration.query(
      'UPDATE app.parcel SET current_status = $1, version = 2, assigned_rider_id = $2 WHERE id = $3',
      [status, accounts['rider.a'], parcel],
    ));
    // Allowed attempts roll back through this sentinel, so every case starts from the same row.
    const rollback = new AppError('MAINTENANCE');
    const probe = (name: AccountName, sql: string, values: unknown[]) =>
      as(database, name)(async client => { await client.query(sql, values); throw rollback; });
    // The SQL layer has no PROOF_NOT_ALLOWED state; the A17 handler rejects a file on Start delivery first.
    const expected = (decision: Decision) => decision.allowed ? 'MAINTENANCE'
      : decision.code === 'PROOF_NOT_ALLOWED' ? 'INVALID_TRANSITION' : decision.code;
    const context = { role: 'RIDER', assigned: true, active: true } as const;
    for (const from of STATUSES) {
      await reset(from);
      for (const to of STATUSES) {
        await expect(probe('rider.a', update, [parcel, 2, to, proofKey(parcel), 'image/jpeg', 10]))
          .rejects.toMatchObject({ code: expected(canTransition(context, from, to, true)) });
      }
      await expect(probe('admin', assign, [parcel, accounts['rider.b'], 2]))
        .rejects.toMatchObject({ code: expected(canAssign({ role: 'ADMIN', active: true }, { role: 'RIDER', active: true }, from)) });
    }
  });
});

it('TC11 keeps the new functions hardened and the runtime without direct writes or the target helper', async () => {
  await harness.run(async database => {
    const migration = await database.migrationClient();
    const catalog = await migration.query(`
      SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig,
        has_function_privilege('app_runtime', p.oid, 'EXECUTE') AS runtime,
        has_function_privilege('domain_writer', p.oid, 'EXECUTE') AS writer,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname IN ('assign_parcel', 'lock_delivery_target', 'update_delivery_status', 'lock_assignee')
      ORDER BY p.proname
    `);
    const searchPath = ['search_path=pg_catalog, app, pg_temp'];
    expect(catalog.rows).toEqual([
      { proname: 'assign_parcel', owner: 'domain_writer', prosecdef: true, proconfig: searchPath, runtime: true, writer: true, anon: false },
      { proname: 'lock_assignee', owner: 'auth_fn_owner', prosecdef: true, proconfig: searchPath, runtime: false, writer: true, anon: false },
      { proname: 'lock_delivery_target', owner: 'domain_writer', prosecdef: true, proconfig: searchPath, runtime: true, writer: true, anon: false },
      { proname: 'update_delivery_status', owner: 'domain_writer', prosecdef: true, proconfig: searchPath, runtime: true, writer: true, anon: false },
    ]);
    const runtime = await database.pool().connect();
    try {
      for (const statement of [
        'SELECT id FROM app.parcel FOR UPDATE',
        "INSERT INTO app.delivery_proof(parcel_id, uploaded_by_id, storage_key, media_type, size_bytes) VALUES (1, 1, '1/' || repeat('a', 32) || '.jpg', 'image/jpeg', 1)",
        'SELECT app.lock_assignee(1)',
      ]) {
        await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' });
      }
    } finally { runtime.release(); }
  });
});
