import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { transaction } from '@/server/core/db';
import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';
import { canTransition } from '@/server/modules/delivery/rules';
import { LIMITS, STATUSES } from '@/shared/constants';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';

const listPath = '/api/v1/rider/parcels';
const version = 2;
const riderA = 'rider.a';
let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
let draft: string;

beforeAll(async () => {
  draft = await readFile('db/drafts/0006_delivery_functions.sql', 'utf8');
  harness = await createDatabaseHarness();
});
afterAll(async () => { await harness?.dispose(); });

function handlers(database: IsolatedDatabase) {
  return createRiderHandlers(createPrincipalUow(database.pool(), {
    APP_ORIGIN: process.env.APP_ORIGIN!,
    SESSION_COOKIE_NAME: 'ptl_session_dev',
  }));
}

async function installDraft(database: IsolatedDatabase) {
  const migration = await database.migrationClient();
  await migration.query('BEGIN');
  await migration.query(draft);
  await migration.query('COMMIT');
  return migration;
}

function startRequest(parcelId: string, session?: { cookie: string; csrfToken: string }, status = 'OUT_FOR_DELIVERY',
  { csrf = true, proof = false, expectedVersion = version } = {}) {
  const origin = process.env.APP_ORIGIN!;
  const body = new FormData();
  body.set('status', status);
  body.set('expectedVersion', String(expectedVersion));
  if (proof) body.set('proof', new File(['synthetic'], 'photo.jpg'));
  const headers = new Headers({ origin });
  if (session) {
    headers.set('cookie', session.cookie);
    if (csrf) headers.set('X-CSRF-Token', session.csrfToken);
  }
  return new Request(origin + listPath + '/' + parcelId + '/status', { method: 'POST', headers, body });
}

it('TC06/TC11/TC14/TC15 scopes and paginates Rider summaries and seeds idempotently', async () => {
  await harness.run(async database => {
    const first = await seedRiderParcels(database);
    expect(await seedRiderParcels(database)).toEqual(first);
    expect(first.every(item => item.source === 'seeded')).toBe(true);
    const { list } = handlers(database);
    const get = async (name: Parameters<typeof database.session>[0], query = '') => {
      const session = await database.session(name);
      return list(new Request(process.env.APP_ORIGIN! + listPath + query, { headers: { cookie: session.cookie } }));
    };

    const response = await get(riderA, '?status=ASSIGNED&pageSize=1');
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      id: first[1].parcelId, trackingNumber: first[1].trackingNumber,
      currentStatus: 'ASSIGNED', weightKg: '1.250', version,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(await (await get(riderA, '?page=2&pageSize=1')).json()).toMatchObject({ items: [{ id: first[0].parcelId }] });
    expect(await (await get(riderA, '?page=3&pageSize=1')).json()).toMatchObject({ items: [], total: 2 });
    expect(await (await get(riderA, '?status=REGISTERED')).json()).toMatchObject({ items: [], total: 0 });
    expect(await (await get('rider.b')).json()).toMatchObject({ items: [{ id: first[2].parcelId }], total: 1 });
    expect((await get('inactive')).status).toBe(401);
    expect(await (await get('must.change')).json()).toMatchObject({ error: { code: 'PASSWORD_CHANGE_REQUIRED' } });
    expect((await get('admin')).status).toBe(403);
    expect((await get(riderA, '?status=' + encodeURIComponent("ASSIGNED' OR true"))).status).toBe(422);
    expect((await get(riderA, '?status=ASSIGNED&status=REGISTERED')).status).toBe(422);
    expect((await get(riderA, '?pageSize=101')).status).toBe(422);
  });
});

it('TC01–TC04/TC07/TC13 records exactly one committed Start delivery with safe audit and history', async () => {
  await harness.run(async database => {
    const migration = await installDraft(database);
    const [parcel] = await seedRiderParcels(database);
    const { updateStatus } = handlers(database);
    const a = await database.session(riderA);
    const b = await database.session('rider.b');
    const admin = await database.session('admin');
    const seller = await database.session('seller.a');
    const path = { params: Promise.resolve({ parcelId: parcel.parcelId }) };
    const oversized = startRequest(parcel.parcelId, a);
    oversized.headers.set('content-length', String(LIMITS.multipartBytes + 1));
    const buffered = new FormData();
    buffered.set('status', 'OUT_FOR_DELIVERY');
    buffered.set('expectedVersion', '2'.repeat(LIMITS.multipartBytes));
    const oversizedWithoutLength = new Request(oversized.url, {
      method: 'POST',
      headers: { cookie: a.cookie, origin: process.env.APP_ORIGIN!, 'X-CSRF-Token': a.csrfToken },
      body: buffered,
    });
    const noCsrf = startRequest(parcel.parcelId, a, 'OUT_FOR_DELIVERY', { csrf: false });
    const cases = [
      [startRequest(parcel.parcelId), 401, 'UNAUTHENTICATED'],
      [startRequest(parcel.parcelId, b), 404, 'NOT_FOUND'],
      [startRequest(parcel.parcelId, admin), 403, 'FORBIDDEN'],
      [startRequest(parcel.parcelId, seller), 403, 'FORBIDDEN'],
      [noCsrf, 403, 'CSRF_INVALID'],
      [startRequest(parcel.parcelId, a, 'SHIPPED'), 422, 'VALIDATION_ERROR'],
      [startRequest(parcel.parcelId, a, 'DELIVERED'), 409, 'INVALID_TRANSITION'],
      [startRequest(parcel.parcelId, a, 'OUT_FOR_DELIVERY', { proof: true }), 422, 'PROOF_NOT_ALLOWED'],
      [oversized, 413, 'PROOF_TOO_LARGE'],
      [oversizedWithoutLength, 413, 'PROOF_TOO_LARGE'],
    ] as const;
    for (const [request, status, code] of cases) {
      const denied = await updateStatus(request, path);
      expect(denied.status).toBe(status);
      expect(await denied.json()).toMatchObject({ error: { code } });
    }

    expect(noCsrf.bodyUsed).toBe(false);

    const competing = await Promise.all([
      updateStatus(startRequest(parcel.parcelId, a), path),
      updateStatus(startRequest(parcel.parcelId, a), path),
    ]);
    const [response, replay] = competing.sort((left, right) => left.status - right.status);
    expect(competing.map(item => item.status)).toEqual([200, 409]);
    const result = await response.json();
    expect(result).toMatchObject({ id: parcel.parcelId, currentStatus: 'OUT_FOR_DELIVERY', version: 3, hasProof: false });
    expect(result.history.map((event: { status: string }) => event.status)).toEqual(['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY']);
    expect(Object.keys(result.history[2]).sort()).toEqual(['changedAt', 'status']);
    expect(await replay.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
    const final = await updateStatus(startRequest(parcel.parcelId, a, 'DELIVERED', { expectedVersion: 3 }), path);
    expect(final.status).toBe(422);
    expect(await final.json()).toMatchObject({ error: { code: 'PROOF_REQUIRED' } });

    await migration.query('SET ROLE domain_writer');
    const history = await migration.query(`
      SELECT status, changed_by_id, changed_at FROM app.parcel_status_history WHERE parcel_id = $1 ORDER BY changed_at, id
    `, [parcel.parcelId]);
    await migration.query('RESET ROLE');
    expect(history.rows).toHaveLength(3);
    expect(history.rows[2]).toMatchObject({ status: 'OUT_FOR_DELIVERY', changed_by_id: a.userId });
    expect(history.rows[2].changed_at.toISOString()).toBe(result.history[2].changedAt);
    expect(history.rows[2].changed_at.getTime()).toBeGreaterThanOrEqual(history.rows[1].changed_at.getTime());
    const audit = await migration.query(`
      SELECT actor_id, event_type, outcome, request_id, details, occurred_at FROM app.audit_event WHERE parcel_id = $1
    `, [parcel.parcelId]);
    expect(audit.rows).toEqual([{
      actor_id: a.userId, event_type: 'STATUS_CHANGED', outcome: 'SUCCESS',
      request_id: response.headers.get('X-Request-Id'), occurred_at: history.rows[2].changed_at,
      details: { oldStatus: 'ASSIGNED', newStatus: 'OUT_FOR_DELIVERY' },
    }]);
  });
});

it('TC14 refuses an existing Rider cookie after account disablement', async () => {
  await harness.run(async database => {
    const migration = await installDraft(database);
    const [parcel] = await seedRiderParcels(database);
    const { list, updateStatus } = handlers(database);
    const a = await database.session(riderA);
    const listRequest = () => new Request(process.env.APP_ORIGIN! + listPath, { headers: { cookie: a.cookie } });
    expect((await list(listRequest())).status).toBe(200);
    await migration.query('SET ROLE auth_fn_owner');
    await migration.query('UPDATE app.app_user SET is_active = false WHERE id = $1', [a.userId]);
    await migration.query('RESET ROLE');

    expect((await list(listRequest())).status).toBe(401);
    const response = await updateStatus(startRequest(parcel.parcelId, a), {
      params: Promise.resolve({ parcelId: parcel.parcelId }),
    });
    expect(response.status).toBe(401);
    await migration.query('SET ROLE domain_writer');
    const result = await migration.query('SELECT current_status, version FROM app.parcel WHERE id = $1', [parcel.parcelId]);
    expect(result.rows).toEqual([{ current_status: 'ASSIGNED', version }]);
  });
});

it('TC05/TC12 checks SQL transitions and rejected direct writes with the restricted runtime role', async () => {
  await harness.run(async database => {
    const migration = await installDraft(database);
    const [parcel] = await seedRiderParcels(database);
    const pool = database.pool();
    const riderId = database.accounts[riderA];
    const actor = { userId: riderId, sessionVersion: 1 };
    const update = 'SELECT app.update_delivery_status($1, $2, $3)';
    const context = { role: 'RIDER', assigned: true, active: true } as const;
    for (const from of STATUSES) {
      await migration.query('SET ROLE domain_writer');
      await migration.query('UPDATE app.parcel SET current_status = $1, version = $2 WHERE id = $3', [from, version, parcel.parcelId]);
      await migration.query('RESET ROLE');
      for (const to of STATUSES) {
        const decision = canTransition(context, from, to, false);
        const attempt = transaction(pool, { actor, write: true }, client => client.query(update, [parcel.parcelId, version, to]));
        if (decision.allowed) await expect(attempt).resolves.toBeDefined();
        else await expect(attempt).rejects.toMatchObject({ code: decision.code });
        if (decision.allowed) {
          await migration.query('SET ROLE domain_writer');
          await migration.query('UPDATE app.parcel SET current_status = $1, version = $2 WHERE id = $3', [from, version, parcel.parcelId]);
          await migration.query('RESET ROLE');
        }
      }
    }

    const other = { userId: database.accounts['rider.b'], sessionVersion: 1 };
    const otherParcel = (await seedRiderParcels(database))[2];
    await transaction(pool, { actor: other }, async client => {
      expect((await client.query('SELECT id FROM app.parcel')).rows).toEqual([{ id: otherParcel.parcelId }]);
    });
    await expect(transaction(pool, { actor: other, write: true }, client =>
      client.query(update, [parcel.parcelId, version, 'OUT_FOR_DELIVERY']),
    )).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const runtime = await pool.connect();
    try {
      await expect(runtime.query('UPDATE app.parcel SET version = version + 1 WHERE id = $1', [parcel.parcelId]))
        .rejects.toMatchObject({ code: '42501' });
    } finally { runtime.release(); }
    await migration.query('SET ROLE auth_fn_owner');
    await migration.query('UPDATE app.app_user SET is_active = false WHERE id = $1', [riderId]);
    await migration.query('RESET ROLE');
    await expect(transaction(pool, { actor, write: true }, client =>
      client.query(update, [parcel.parcelId, version, 'OUT_FOR_DELIVERY']),
    )).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
