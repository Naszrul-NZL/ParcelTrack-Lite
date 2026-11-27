import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { createDeliveryAdminHandlers } from '@/server/modules/delivery/admin-handlers';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin, type LoginSession } from '../harness/login-as';
import { seedRiderParcels } from '../fixtures/delivery/rider-parcels';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

function authorize(database: IsolatedDatabase) {
  return createPrincipalUow(database.pool(), { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' });
}

function handlers(database: IsolatedDatabase) {
  return createDeliveryAdminHandlers(authorize(database));
}

function list(database: IsolatedDatabase, actor: LoginSession, query = '') {
  return handlers(database).list(actor.request('/admin/parcels' + query));
}

function assign(database: IsolatedDatabase, actor: LoginSession, parcelId: string, body: unknown) {
  return handlers(database).assign(
    actor.request(`/admin/parcels/${parcelId}/assignment`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ parcelId }) },
  );
}

const errorCode = async (response: Response) => (await response.json()).error.code as string;

async function assignmentState(database: IsolatedDatabase, parcelId: string) {
  const fixture = await database.fixtureClient();
  await fixture.query('BEGIN');
  await fixture.query('SET LOCAL ROLE domain_writer');
  const parcel = (await fixture.query(`
    SELECT current_status, version, assigned_rider_id FROM app.parcel WHERE id = $1
  `, [parcelId])).rows[0];
  const history = (await fixture.query(`
    SELECT status, changed_by_id FROM app.parcel_status_history WHERE parcel_id = $1 ORDER BY changed_at, id
  `, [parcelId])).rows;
  await fixture.query('ROLLBACK');
  const owner = await database.migrationClient();
  const audit = (await owner.query(`
    SELECT event_type, actor_id, target_user_id, details
    FROM app.audit_event WHERE parcel_id = $1 ORDER BY id
  `, [parcelId])).rows;
  return { ...parcel, history, audit };
}

describe('M3-PH3 A14/A15 Admin parcel assignment', () => {
  it('TC10 lists only allowlisted summary fields and filters inactive-Rider work with stable pagination', async () => {
    await harness.run(async database => {
      const parcels = await seedRiderParcels(database);
      const admin = await loginAs(database, 'ADMIN');

      const assigned = await list(database, admin, '?status=ASSIGNED&pageSize=100');
      expect(assigned.status).toBe(200);
      const assignedPage = await assigned.json();
      expect(assignedPage).toMatchObject({ page: 1, pageSize: 100, total: 3 });
      expect(assignedPage.items.every((item: { currentStatus: string }) => item.currentStatus === 'ASSIGNED')).toBe(true);
      expect(Object.keys(assignedPage.items[0]).sort()).toEqual([
        'assignedRider', 'createdAt', 'currentStatus', 'id', 'trackingNumber', 'version', 'weightKg',
      ]);
      expect(JSON.stringify(assignedPage)).not.toMatch(/recipient|address|phone/i);

      const users = createUserAdminHandlers(authorize(database));
      const disabled = await users.updateStatus(
        admin.request(`/admin/users/${database.accounts['rider.a']}/status`, {
          method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }),
        }),
        { params: Promise.resolve({ userId: database.accounts['rider.a'] }) },
      );
      expect(disabled.status).toBe(200);

      const needs = await (await list(database, admin, '?needsReassignment=true&pageSize=100')).json();
      expect(needs.total).toBe(2);
      expect(needs.items.map((item: { id: string }) => item.id).sort()).toEqual(
        parcels.filter(item => item.rider === 'rider.a').map(item => item.parcelId).sort(),
      );
      expect(needs.items.every((item: { assignedRider: { isActive: boolean } }) => !item.assignedRider.isActive)).toBe(true);

      const first = await (await list(database, admin,
        `?status=ASSIGNED&riderId=${database.accounts['rider.a']}&pageSize=1`)).json();
      expect(first).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(first.items).toHaveLength(1);
      const excluded = await (await list(database, admin, '?needsReassignment=false&pageSize=100')).json();
      expect(excluded.total).toBe(4);
      expect(excluded.items.some((item: { id: string }) => needs.items.some((candidate: { id: string }) => candidate.id === item.id))).toBe(false);
    });
  });

  it('TC10 rejects non-Admins, repeated or unlisted parameters, malformed filters and injection text', async () => {
    await harness.run(async database => {
      await seedRiderParcels(database);
      for (const who of ['seller.a', 'rider.a'] as const) {
        const response = await list(database, await loginAs(database, who));
        expect([response.status, await errorCode(response)], who).toEqual([403, 'FORBIDDEN']);
      }
      const anonymous = await handlers(database).list(new Request(origin() + '/api/v1/admin/parcels'));
      expect([anonymous.status, await errorCode(anonymous)]).toEqual([401, 'UNAUTHENTICATED']);

      const admin = await loginAs(database, 'ADMIN');
      for (const query of [
        '?status=ASSIGNED&status=REGISTERED',
        '?status=' + encodeURIComponent("ASSIGNED' OR true"),
        '?riderId=0',
        '?riderId=' + encodeURIComponent('1 OR 1=1'),
        '?needsReassignment=yes',
        '?page=0',
        '?pageSize=0',
        '?sort=createdAt',
      ]) {
        const response = await list(database, admin, query);
        expect([response.status, await errorCode(response)], query).toEqual([422, 'VALIDATION_ERROR']);
      }
    });
  });

  it('TC01/TC03 assigns, no-ops and reassigns through A15 without adding a duplicate status event', async () => {
    await harness.run(async database => {
      const parcels = await seedRiderParcels(database);
      const parcelId = parcels.find(item => item.key === 'registered')!.parcelId;
      const admin = await loginAs(database, 'ADMIN');

      const first = await assign(database, admin, parcelId, {
        riderId: database.accounts['rider.a'], expectedVersion: 1,
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({
        id: parcelId, currentStatus: 'ASSIGNED', version: 2,
        assignedRider: { id: database.accounts['rider.a'], displayName: 'rider.a', isActive: true },
      });
      const assigned = await assignmentState(database, parcelId);
      expect(assigned).toMatchObject({ current_status: 'ASSIGNED', version: 2, assigned_rider_id: database.accounts['rider.a'] });
      expect(assigned.history).toEqual([
        { status: 'REGISTERED', changed_by_id: database.accounts['seller.a'] },
        { status: 'ASSIGNED', changed_by_id: database.accounts.admin },
      ]);
      expect(assigned.audit).toEqual([{
        event_type: 'PARCEL_ASSIGNED', actor_id: database.accounts.admin,
        target_user_id: database.accounts['rider.a'], details: { newRiderId: database.accounts['rider.a'] },
      }]);

      const noOp = await assign(database, admin, parcelId, {
        riderId: database.accounts['rider.a'], expectedVersion: 2,
      });
      expect(noOp.status).toBe(200);
      expect(await assignmentState(database, parcelId)).toEqual(assigned);

      const moved = await assign(database, admin, parcelId, {
        riderId: database.accounts['rider.b'], expectedVersion: 2,
      });
      expect(moved.status).toBe(200);
      expect(await moved.json()).toMatchObject({
        currentStatus: 'ASSIGNED', version: 3,
        assignedRider: { id: database.accounts['rider.b'], isActive: true },
      });
      const reassigned = await assignmentState(database, parcelId);
      expect(reassigned.history).toEqual(assigned.history);
      expect(reassigned.audit.at(-1)).toEqual({
        event_type: 'PARCEL_REASSIGNED', actor_id: database.accounts.admin,
        target_user_id: database.accounts['rider.b'],
        details: {
          oldRiderId: database.accounts['rider.a'], newRiderId: database.accounts['rider.b'], status: 'ASSIGNED',
        },
      });
    });
  });

  it('TC02 returns defined errors for bad targets, stale versions, malformed paths and invalid bodies', async () => {
    await harness.run(async database => {
      const parcels = await seedRiderParcels(database);
      const parcelId = parcels.find(item => item.key === 'registered')!.parcelId;
      const admin = await loginAs(database, 'ADMIN');

      for (const riderId of [database.accounts.inactive, database.accounts['seller.a'], database.accounts.admin, '999999999']) {
        const response = await assign(database, admin, parcelId, { riderId, expectedVersion: 1 });
        expect([response.status, await errorCode(response)], riderId).toEqual([422, 'INVALID_ASSIGNEE']);
      }
      const stale = await assign(database, admin, parcelId, {
        riderId: database.accounts['rider.a'], expectedVersion: 2,
      });
      expect([stale.status, await errorCode(stale)]).toEqual([409, 'VERSION_CONFLICT']);

      for (const malformed of ['abc', '0', '01', '1%20OR%201=1']) {
        const response = await assign(database, admin, malformed, {
          riderId: database.accounts['rider.a'], expectedVersion: 1,
        });
        expect([response.status, await errorCode(response)], malformed).toEqual([404, 'NOT_FOUND']);
      }
      for (const body of [
        { riderId: database.accounts['rider.a'] },
        { riderId: database.accounts['rider.a'], expectedVersion: 0 },
        { riderId: database.accounts['rider.a'], expectedVersion: 2_147_483_648 },
        { riderId: database.accounts['rider.a'], expectedVersion: 1, status: 'ASSIGNED' },
        { riderId: '0', expectedVersion: 1 },
      ]) {
        const response = await assign(database, admin, parcelId, body);
        expect([response.status, await errorCode(response)], JSON.stringify(body)).toEqual([422, 'VALIDATION_ERROR']);
      }
      expect(await assignmentState(database, parcelId)).toMatchObject({ current_status: 'REGISTERED', version: 1, audit: [] });
    });
  });

  it('TC02 enforces role, CSRF and origin before A15 changes state', async () => {
    await harness.run(async database => {
      const parcels = await seedRiderParcels(database);
      const parcelId = parcels.find(item => item.key === 'registered')!.parcelId;
      const body = { riderId: database.accounts['rider.a'], expectedVersion: 1 };

      for (const who of ['seller.a', 'rider.a'] as const) {
        const response = await assign(database, await loginAs(database, who), parcelId, body);
        expect([response.status, await errorCode(response)], who).toEqual([403, 'FORBIDDEN']);
      }
      const anonymous = await handlers(database).assign(new Request(
        origin() + `/api/v1/admin/parcels/${parcelId}/assignment`, {
          method: 'PATCH', headers: { origin: origin(), 'content-type': 'application/json' }, body: JSON.stringify(body),
        }), { params: Promise.resolve({ parcelId }) });
      expect([anonymous.status, await errorCode(anonymous)]).toEqual([401, 'UNAUTHENTICATED']);

      const admin = await loginAs(database, 'ADMIN');
      const refusedHeaders: Array<Record<string, string>> = [
        { origin: origin() },
        { origin: origin(), 'x-csrf-token': 'wrong' },
        { origin: 'https://foreign.invalid', 'x-csrf-token': admin.csrfToken },
      ];
      for (const headers of refusedHeaders) {
        const response = await handlers(database).assign(new Request(
          origin() + `/api/v1/admin/parcels/${parcelId}/assignment`, {
            method: 'PATCH', headers: { cookie: admin.cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
          }), { params: Promise.resolve({ parcelId }) });
        expect([response.status, await errorCode(response)]).toEqual([403, 'CSRF_INVALID']);
      }
      expect(await assignmentState(database, parcelId)).toMatchObject({ current_status: 'REGISTERED', version: 1, audit: [] });
    });
  });
});
