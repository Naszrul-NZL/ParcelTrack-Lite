import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, loginAs, origin, type LoginSession } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const handlers = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));
type Event = { id: string; eventType: string; outcome: string; actorId: string | null; targetUserId: string | null; parcelId: string | null; occurredAt: string; requestId: string; details: Record<string, unknown> };
type Page = { items: Event[]; page: number; pageSize: number; total: number };
const audit = (database: IsolatedDatabase, actor: LoginSession, query = '') => handlers(database).audit(actor.request('/admin/audit' + query));
const read = async (database: IsolatedDatabase, actor: LoginSession, query = '') => {
  const response = await audit(database, actor, query);
  expect(response.status, query).toBe(200);
  return await response.json() as Page;
};
const errorCode = async (response: Response) => (await response.json()).error.code as string;

async function owner<T extends object = Record<string, unknown>>(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  return (await (await database.migrationClient()).query<T>(text, values)).rows;
}
async function firstParcel(database: IsolatedDatabase) {
  const client = await database.migrationClient();
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE domain_writer');
    return (await client.query<{ id: string }>('SELECT id FROM app.parcel ORDER BY id LIMIT 1')).rows[0].id;
  } finally { await client.query('ROLLBACK'); }
}
const insertEvent = (database: IsolatedDatabase, type: string, parcelId: string | null, details: unknown) => owner(database,
  "INSERT INTO app.audit_event(actor_id,parcel_id,event_type,outcome,request_id,details) VALUES($1,$2,$3,'SUCCESS',$4,$5)",
  [database.accounts.admin, parcelId, type, randomUUID(), JSON.stringify(details)]);

describe('M1-PH3-T07 A20 GET /admin/audit', () => {
  it('TC13 shows login, creation and disablement events with safe fields, newest first, and filters by type', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      await loginAs(database, 'rider.b', { handlers: auth });
      const created = await handlers(database).createRider(admin.request('/admin/riders', {
        method: 'POST', body: JSON.stringify({ username: 'rider.audit', displayName: 'Audit Rider', initialPassword: 'rider-audit-secret-1' }),
      }));
      const rider = await created.json();
      await handlers(database).updateStatus(admin.request(`/admin/users/${rider.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }) }),
        { params: Promise.resolve({ userId: rider.id }) });

      const all = await read(database, admin, '?pageSize=100');
      const types = all.items.map(item => item.eventType);
      expect(types).toEqual(expect.arrayContaining(['LOGIN_SUCCEEDED', 'USER_CREATED', 'USER_STATUS_CHANGED']));
      expect(all.total).toBe(all.items.length);
      for (const item of all.items) {
        expect(Object.keys(item).sort()).toEqual(['actorId', 'details', 'eventType', 'id', 'occurredAt', 'outcome', 'parcelId', 'requestId', 'targetUserId']);
        expect(item.id).toMatch(/^[1-9]\d*$/);
        expect(item.occurredAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      }
      const times = all.items.map(item => item.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);
      expect(JSON.stringify(all)).not.toMatch(/argon2|password|hash|token|csrf|cookie|rider-audit-secret/i);

      const status = await read(database, admin, '?eventType=USER_STATUS_CHANGED');
      expect(status.items).toHaveLength(1);
      expect(status.items[0]).toMatchObject({ actorId: database.accounts.admin, targetUserId: rider.id, outcome: 'SUCCESS', details: { isActive: false } });
      const made = await read(database, admin, '?eventType=USER_CREATED');
      expect(made.items[0]).toMatchObject({ targetUserId: rider.id, details: { role: 'RIDER' } });
      expect(await read(database, admin, '?eventType=PROOF_PURGED')).toMatchObject({ items: [], total: 0 });
    });
  });

  it('TC13 includes events written by other modules and filters them by parcel', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const parcel = await firstParcel(database);
      await insertEvent(database, 'PARCEL_REASSIGNED', parcel, { oldRiderId: '11', newRiderId: '12', status: 'ASSIGNED' });
      const page = await read(database, admin, `?parcelId=${parcel}`);
      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({ eventType: 'PARCEL_REASSIGNED', parcelId: parcel, details: { oldRiderId: '11', newRiderId: '12', status: 'ASSIGNED' } });
      expect((await read(database, admin, '?parcelId=999999999')).total).toBe(0);
    });
  });

  it('TC13 never returns a detail the allowlist does not name, a nested value or an oversized string', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      await insertEvent(database, 'LOGIN_FAILED', null, {
        reason: 'bad_password', usernameLength: 9, password: 'CANARY-PASSWORD', token: 'CANARY-TOKEN', body: { password: 'CANARY-NESTED' },
        scope: 'x'.repeat(129), retryAfter: { n: 1 }, requestBody: 'CANARY-BODY',
      });
      const page = await read(database, admin, '?eventType=LOGIN_FAILED');
      expect(page.items[0].details).toEqual({ reason: 'bad_password', usernameLength: 9 });
      expect(JSON.stringify(page)).not.toContain('CANARY');
    });
  });

  it('TC13 paginates with a total, caps the page size at 100 and returns an empty page past the end', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      for (let i = 0; i < 7; i++) await insertEvent(database, 'LOGOUT', null, { reason: 'n' + i });
      const first = await read(database, admin, '?eventType=LOGOUT&pageSize=3&page=1');
      const second = await read(database, admin, '?eventType=LOGOUT&pageSize=3&page=2');
      const third = await read(database, admin, '?eventType=LOGOUT&pageSize=3&page=3');
      expect([first.total, first.items.length, second.items.length, third.items.length]).toEqual([7, 3, 3, 1]);
      const ids = [...first.items, ...second.items, ...third.items].map(item => item.id);
      expect(new Set(ids).size).toBe(7);
      expect([...ids].sort((a, b) => Number(b) - Number(a))).toEqual(ids);
      expect(await read(database, admin, '?eventType=LOGOUT&pageSize=3&page=50')).toMatchObject({ items: [], total: 7, page: 50 });
      expect((await read(database, admin, '?pageSize=5000')).pageSize).toBe(100);
      expect((await read(database, admin)).pageSize).toBe(20);
    });
  });

  it('TC02 rejects unknown, repeated or malformed parameters with 422', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      for (const query of [
        '?eventType=NOPE', '?eventType=login_failed', '?eventType=LOGOUT&eventType=LOGIN_FAILED', '?parcelId=abc', '?parcelId=0', '?parcelId=1%20OR%201=1',
        '?parcelId=99999999999999999999', '?page=0', '?page=100001', '?page=x', '?pageSize=0', '?pageSize=-1', '?actorId=1', '?details=1', "?eventType=LOGOUT'--",
      ]) {
        const response = await audit(database, admin, query);
        expect([response.status, await errorCode(response)], query).toEqual([422, 'VALIDATION_ERROR']);
      }
    });
  });

  it('TC09 is Admin only and the runtime role cannot read the audit table or call the function without an Admin', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      for (const who of ['seller.a', 'rider.a', 'must.change'] as const) {
        const actor = await loginAs(database, who, { handlers: auth });
        const response = await audit(database, actor);
        expect([response.status, who]).toEqual([403, who]);
        expect(JSON.stringify(await response.json())).not.toContain('eventType');
      }
      const anonymous = await bootstrapCsrf(auth);
      const unauthenticated = await handlers(database).audit(apiRequest('/admin/audit', { cookie: anonymous.cookie }));
      expect(unauthenticated.status).toBe(401);

      const client = await database.pool().connect();
      try {
        await expect(client.query('SELECT * FROM app.audit_event')).rejects.toMatchObject({ code: '42501' });
        await expect(client.query('SELECT app.list_audit_events(NULL,NULL,1,20)')).rejects.toMatchObject({ code: 'PT012' });
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.session_version','1',true)", [database.accounts['seller.a']]);
        await expect(client.query('SELECT app.list_audit_events(NULL,NULL,1,20)')).rejects.toMatchObject({ code: 'PT001' });
      } finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    });
  });

  it('TC11 refuses a disabled Admin session at once', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      await owner(database, "UPDATE app.app_user SET session_version = session_version + 1 WHERE username = 'admin'");
      const response = await audit(database, admin);
      expect(response.status).toBe(401);
    });
  });
});
