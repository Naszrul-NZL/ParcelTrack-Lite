import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
type Summary = { id: string; username: string; role: string; isActive: boolean; mustChangePassword: boolean; version: number; displayName: string };

/** A09 as `actor`; `body` is sent as given so a test can send invalid JSON or an unexpected shape. */
function patch(database: IsolatedDatabase, actor: LoginSession, userId: string, body: unknown, init: { headers?: Record<string, string> } = {}) {
  return handlers(database).updateStatus(
    actor.request(`/admin/users/${userId}/status`, { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }),
    { params: Promise.resolve({ userId }) },
  );
}
async function account(database: IsolatedDatabase, username: string) {
  const owner = await database.migrationClient();
  return (await owner.query<{ id: string; is_active: boolean; version: number; session_version: number; sessions: string }>(
    'SELECT id, is_active, version, session_version, (SELECT count(*) FROM app.auth_session s WHERE s.user_id = u.id) AS sessions FROM app.app_user u WHERE username = $1', [username])).rows[0];
}
async function audit(database: IsolatedDatabase) {
  const owner = await database.migrationClient();
  return (await owner.query<{ actor_id: string; target_user_id: string; outcome: string; details: { isActive: boolean }; request_id: string }>(
    "SELECT actor_id, target_user_id, outcome, details, request_id FROM app.audit_event WHERE event_type = 'USER_STATUS_CHANGED' ORDER BY id")).rows;
}
const errorCode = async (response: Response) => (await response.json()).error.code as string;

describe('M1-PH3-T02 A09 PATCH /admin/users/{userId}/status', () => {
  it('TC11 disables a Rider so the old cookie fails at once, keeps it failing after reactivation, and a fresh login works again', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      const rider = await loginAs(database, 'rider.a', { handlers: auth });
      const before = await account(database, 'rider.a');
      expect((await auth.me(rider.request('/auth/me'))).status).toBe(200);

      const off = await patch(database, admin, before.id, { isActive: false, expectedVersion: before.version });
      expect(off.status).toBe(200);
      const disabled = await off.json() as Summary;
      expect(Object.keys(disabled).sort()).toEqual(['displayName', 'id', 'isActive', 'mustChangePassword', 'role', 'username', 'version']);
      expect(disabled).toMatchObject({ username: 'rider.a', role: 'RIDER', isActive: false, version: before.version + 1 });
      expect(JSON.stringify(disabled)).not.toMatch(/argon2|password_?hash|session_?version|token/i);
      expect(await account(database, 'rider.a')).toMatchObject({ is_active: false, sessions: '0', session_version: before.session_version + 1 });
      expect((await auth.me(rider.request('/auth/me'))).status).toBe(401);
      const refused = await auth.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(auth)), body: JSON.stringify(database.loginInput('rider.a')) }));
      expect(refused.status).toBe(401);
      expect(await errorCode(refused)).toBe('AUTH_INVALID');

      const on = await patch(database, admin, before.id, { isActive: true, expectedVersion: disabled.version });
      expect(on.status).toBe(200);
      expect(await on.json()).toMatchObject({ isActive: true, version: before.version + 2 });
      expect((await auth.me(rider.request('/auth/me'))).status).toBe(401);
      expect((await loginAs(database, 'rider.a', { handlers: auth })).principal.username).toBe('rider.a');

      const events = await audit(database);
      expect(events.map(event => event.details)).toEqual([{ isActive: false }, { isActive: true }]);
      expect(events.every(event => event.actor_id === database.accounts.admin && event.target_user_id === before.id && event.outcome === 'SUCCESS')).toBe(true);
      expect(new Set(events.map(event => event.request_id)).size).toBe(2);
    });
  });

  it('disables a Seller the same way', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const seller = await account(database, 'seller.b');
      const response = await patch(database, admin, seller.id, { isActive: false, expectedVersion: seller.version });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ role: 'SELLER', isActive: false });
    });
  });

  it('answers a stale version with 409, and rejects Admin, self, unknown and malformed targets without changing anything', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const rider = await account(database, 'rider.b');
      const stale = await patch(database, admin, rider.id, { isActive: false, expectedVersion: rider.version + 1 });
      expect([stale.status, await errorCode(stale)]).toEqual([409, 'VERSION_CONFLICT']);
      for (const target of [database.accounts.admin]) {
        const response = await patch(database, admin, target, { isActive: false, expectedVersion: 1 });
        expect([response.status, await errorCode(response)], 'admin and self').toEqual([403, 'TARGET_NOT_ALLOWED']);
      }
      const missing = await patch(database, admin, '999999999', { isActive: false, expectedVersion: 1 });
      expect([missing.status, await errorCode(missing)]).toEqual([404, 'NOT_FOUND']);
      for (const malformed of ['abc', '0', '-1', '01', "1%20OR%201=1", '99999999999999999999']) {
        const response = await patch(database, admin, malformed, { isActive: false, expectedVersion: 1 });
        expect([response.status, await errorCode(response)], malformed).toEqual([404, 'NOT_FOUND']);
      }
      expect(await account(database, 'rider.b')).toMatchObject({ is_active: true, version: rider.version, sessions: '0' });
      expect(await audit(database)).toEqual([]);
    });
  });

  it('rejects an invalid body with 422 before any change: extra fields, wrong types, missing or huge version, bad JSON, oversize', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const rider = await account(database, 'rider.a');
      const bad: [string, unknown, { headers?: Record<string, string> }?][] = [
        ['extra role field', { isActive: false, expectedVersion: rider.version, role: 'ADMIN' }],
        ['extra userId field', { isActive: false, expectedVersion: rider.version, userId: '1' }],
        ['string isActive', { isActive: 'false', expectedVersion: rider.version }],
        ['missing expectedVersion', { isActive: false }],
        ['missing isActive', { expectedVersion: rider.version }],
        ['zero version', { isActive: false, expectedVersion: 0 }],
        ['fractional version', { isActive: false, expectedVersion: 1.5 }],
        ['version beyond a database integer', { isActive: false, expectedVersion: 2147483648 }],
        ['null body', 'null'],
        ['array body', '[]'],
        ['malformed JSON', '{"isActive":'],
        ['not JSON', 'isActive=false'],
        ['declared oversize', { isActive: false, expectedVersion: 1 }, { headers: { 'content-length': '999999' } }],
        ['actual oversize', JSON.stringify({ isActive: false, expectedVersion: 1, pad: 'x'.repeat(20_000) })],
      ];
      for (const [label, body, init] of bad) {
        const response = await patch(database, admin, rider.id, body, init);
        expect([response.status, await errorCode(response)], label).toEqual([422, 'VALIDATION_ERROR']);
      }
      const wrongType = await handlers(database).updateStatus(
        admin.request(`/admin/users/${rider.id}/status`, { method: 'PATCH', body: 'isActive=false', headers: { 'content-type': 'text/plain' } }),
        { params: Promise.resolve({ userId: rider.id }) },
      );
      expect(wrongType.status).toBe(422);
      expect(await account(database, 'rider.a')).toMatchObject({ is_active: true, version: rider.version });
      expect(await audit(database)).toEqual([]);
    });
  });

  it('TC09 is Admin only, requires the CSRF token and same-origin evidence, and changes nothing when refused', async () => {
    await harness.run(async database => {
      const rider = await account(database, 'rider.a');
      const body = { isActive: false, expectedVersion: rider.version };
      const anonymous = await handlers(database).updateStatus(new Request(origin() + `/api/v1/admin/users/${rider.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify(body) }), { params: Promise.resolve({ userId: rider.id }) });
      expect(anonymous.status).toBe(401);
      for (const who of ['seller.a', 'seller.b', 'rider.b', 'must.change'] as const) {
        const response = await patch(database, await loginAs(database, who), rider.id, body);
        expect([response.status, await errorCode(response)], who).toEqual([403, expect.stringMatching(/FORBIDDEN|PASSWORD_CHANGE_REQUIRED/)]);
      }
      const admin = await loginAs(database, 'ADMIN');
      const send = (headers: Record<string, string>) => handlers(database).updateStatus(
        new Request(origin() + `/api/v1/admin/users/${rider.id}/status`, { method: 'PATCH', body: JSON.stringify(body), headers: { cookie: admin.cookie, 'content-type': 'application/json', ...headers } }),
        { params: Promise.resolve({ userId: rider.id }) });
      for (const [label, headers] of [
        ['no token', { origin: origin() }], ['wrong token', { origin: origin(), 'x-csrf-token': 'wrong' }],
        ['foreign origin', { origin: 'https://foreign.invalid', 'x-csrf-token': admin.csrfToken }], ['no provenance', { 'x-csrf-token': admin.csrfToken }],
      ] as [string, Record<string, string>][]) {
        const response = await send(headers);
        expect([response.status, await errorCode(response)], label).toEqual([403, 'CSRF_INVALID']);
      }
      expect(await account(database, 'rider.a')).toMatchObject({ is_active: true, version: rider.version });
      expect(await audit(database)).toEqual([]);
    });
  });

  it('TC22 lets one of two simultaneous Admin requests with the same expected version win, with one audit event', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const [first, second] = [await loginAs(database, 'ADMIN', { handlers: auth }), await loginAs(database, 'ADMIN', { handlers: auth })];
      const rider = await account(database, 'rider.b');
      const body = { isActive: false, expectedVersion: rider.version };
      const results = await Promise.all([patch(database, first, rider.id, body), patch(database, second, rider.id, body)]);
      expect(results.map(response => response.status).sort()).toEqual([200, 409]);
      expect((await audit(database)).length).toBe(1);
      expect(await account(database, 'rider.b')).toMatchObject({ is_active: false, version: rider.version + 1 });
    });
  });

  it('is refused with 503 MAINTENANCE during maintenance while reads keep working, and works again afterwards', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const rider = await account(database, 'rider.a');
      const operator = await database.migrationClient();
      await operator.query('SET ROLE ops_fn_owner');
      await operator.query("UPDATE app.system_state SET maintenance_mode = true, set_until = now() + interval '5 minutes'");
      try {
        const blocked = await patch(database, admin, rider.id, { isActive: false, expectedVersion: rider.version });
        expect([blocked.status, await errorCode(blocked)]).toEqual([503, 'MAINTENANCE']);
        expect((await handlers(database).list(admin.request('/admin/users'))).status).toBe(200);
        expect(await account(database, 'rider.a')).toMatchObject({ is_active: true, version: rider.version });
      } finally {
        await operator.query('UPDATE app.system_state SET maintenance_mode = false, set_until = NULL');
        await operator.query('RESET ROLE');
      }
      expect((await patch(database, admin, rider.id, { isActive: false, expectedVersion: rider.version })).status).toBe(200);
    });
  });

  it('is reflected by the A07 list, so the Rider picker no longer offers a disabled Rider', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const rider = await account(database, 'rider.a');
      await patch(database, admin, rider.id, { isActive: false, expectedVersion: rider.version });
      const picker = await (await handlers(database).list(admin.request('/admin/users?role=RIDER&isActive=true'))).json() as { items: Summary[] };
      expect(picker.items.map(item => item.username)).not.toContain('rider.a');
      expect(picker.items.map(item => item.username)).toContain('rider.b');
    });
  });
});
