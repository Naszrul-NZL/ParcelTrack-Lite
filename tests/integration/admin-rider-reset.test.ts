import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, cookieFrom, loginAs, origin, type AuthHandlers, type LoginSession } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const handlers = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));
const INITIAL = 'rider-first-secret-1';
const body = (overrides: Record<string, unknown> = {}) => ({ username: 'rider.new', displayName: 'New Rider', initialPassword: INITIAL, ...overrides });

/** A08 as `actor`; `payload` is sent as given so a test can send invalid JSON or an unexpected shape. */
const createRider = (database: IsolatedDatabase, actor: LoginSession, payload: unknown = body(), init: { headers?: Record<string, string> } = {}) =>
  handlers(database).createRider(actor.request('/admin/riders', { method: 'POST', body: typeof payload === 'string' ? payload : JSON.stringify(payload), ...init }));
/** A21 as `actor`. */
const reset = (database: IsolatedDatabase, actor: LoginSession, userId: string) =>
  handlers(database).resetPassword(actor.request(`/admin/users/${userId}/password-reset`, { method: 'POST' }), { params: Promise.resolve({ userId }) });
const signIn = async (auth: AuthHandlers, username: string, password: string) =>
  auth.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(auth)), body: JSON.stringify({ username, password }) }));
const errorCode = async (response: Response) => (await response.json()).error.code as string;

async function owner<T extends object = Record<string, unknown>>(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  const client = await database.migrationClient();
  return (await client.query<T>(text, values)).rows;
}
const account = async (database: IsolatedDatabase, username: string) => (await owner<{
  id: string; role: string; is_active: boolean; must_change_password: boolean; version: number; session_version: number; sessions: string; hours: number | null;
}>(database,
  `SELECT id, role, is_active, must_change_password, version, session_version,
     (SELECT count(*) FROM app.auth_session s WHERE s.user_id = u.id) AS sessions,
     (extract(epoch FROM credential_expires_at - now()) / 3600)::float8 AS hours
   FROM app.app_user u WHERE username = $1`, [username]))[0];
const events = (database: IsolatedDatabase, type: string) => owner<{ actor_id: string; target_user_id: string; outcome: string; details: Record<string, unknown>; request_id: string }>(database,
  'SELECT actor_id, target_user_id, outcome, details, request_id FROM app.audit_event WHERE event_type = $1 ORDER BY id', [type]);

describe('M1-PH3-T04 A08 POST /admin/riders', () => {
  it('TC10 creates a Rider who must change the initial password, never sees it echoed, and can sign in with it', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      const response = await createRider(database, admin);
      expect(response.status).toBe(201);
      const text = await response.text();
      expect(text).not.toContain(INITIAL);
      const created = JSON.parse(text);
      expect(Object.keys(created).sort()).toEqual(['displayName', 'id', 'isActive', 'mustChangePassword', 'role', 'username', 'version']);
      expect(created).toMatchObject({ username: 'rider.new', displayName: 'New Rider', role: 'RIDER', isActive: true, mustChangePassword: true, version: 1 });
      expect(JSON.stringify(created)).not.toMatch(/argon2|password_?hash|session_?version|token/i);

      const row = await account(database, 'rider.new');
      expect(row).toMatchObject({ role: 'RIDER', must_change_password: true, sessions: '0' });
      expect(row.hours).toBeGreaterThan(71.9);
      expect(row.hours).toBeLessThanOrEqual(72);
      const stored = (await owner<{ password_hash: string }>(database, "SELECT password_hash FROM app.app_user WHERE username = 'rider.new'"))[0].password_hash;
      expect(stored).toMatch(/^\$argon2id\$/);

      const [event] = await events(database, 'USER_CREATED');
      expect(event).toMatchObject({ actor_id: database.accounts.admin, target_user_id: created.id, outcome: 'SUCCESS', details: { role: 'RIDER' } });
      expect(JSON.stringify(await owner(database, 'SELECT details FROM app.audit_event'))).not.toContain(INITIAL);

      const rider = await signIn(auth, 'rider.new', INITIAL);
      expect(rider.status).toBe(200);
      expect(await rider.json()).toMatchObject({ role: 'RIDER', mustChangePassword: true });
    });
  });

  it('TC10 appears in the Admin directory as an active Rider, ready for assignment', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      expect((await createRider(database, admin)).status).toBe(201);
      const list = await handlers(database).list(admin.request('/admin/users?role=RIDER&isActive=true&pageSize=100'));
      const usernames = (await list.json()).items.map((item: { username: string }) => item.username);
      expect(usernames).toContain('rider.new');
    });
  });

  it('TC10 refuses to sign in with an initial password after 72 hours, and a changed password clears the expiry', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      await createRider(database, admin);
      await createRider(database, admin, body({ username: 'rider.late', displayName: 'Late Rider' }));
      await owner(database, "UPDATE app.app_user SET credential_expires_at = now() - interval '1 minute' WHERE username = 'rider.late'");
      const late = await signIn(auth, 'rider.late', INITIAL);
      expect([late.status, await errorCode(late)]).toEqual([401, 'AUTH_INVALID']);

      const rider = await signIn(auth, 'rider.new', INITIAL);
      const session = { cookie: cookieFrom(rider)!, csrfToken: (await rider.json()).csrfToken as string };
      const changed = await auth.changePassword(apiRequest('/auth/password', { method: 'POST', ...session, body: JSON.stringify({ currentPassword: INITIAL, newPassword: 'rider-second-secret-2' }) }));
      expect(changed.status).toBe(204);
      expect(await account(database, 'rider.new')).toMatchObject({ must_change_password: false, hours: null });
      expect((await signIn(auth, 'rider.new', 'rider-second-secret-2')).status).toBe(200);
    });
  });

  it('TC10 answers a duplicate username with 409, without changing the existing account', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const before = await account(database, 'seller.a');
      for (const username of ['seller.a', 'SELLER.A', 'rider.a']) {
        const response = await createRider(database, admin, body({ username }));
        expect([response.status, await errorCode(response)], username).toEqual([409, 'USERNAME_TAKEN']);
      }
      expect(await account(database, 'seller.a')).toEqual(before);
      expect(await events(database, 'USER_CREATED')).toEqual([]);
    });
  });

  it('TC10 rejects a role, extra fields, weak or common passwords and bad bodies with 422, creating nothing', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const bad: [string, unknown, string?, { headers?: Record<string, string> }?][] = [
        ['role field', body({ role: 'ADMIN' })],
        ['isActive field', body({ isActive: false })],
        ['mustChangePassword field', body({ mustChangePassword: false })],
        ['password instead of initialPassword', { username: 'rider.new', displayName: 'New Rider', password: INITIAL }],
        ['short password', body({ initialPassword: 'short1' }), 'initialPassword'],
        ['common password', body({ initialPassword: 'password1234' }), 'initialPassword'],
        ['missing username', { displayName: 'New Rider', initialPassword: INITIAL }],
        ['bad username', body({ username: 'a b' })],
        ['empty display name', body({ displayName: '' })],
        ['numeric password', body({ initialPassword: 1234567890 })],
        ['null body', 'null'],
        ['array body', '[]'],
        ['malformed JSON', '{"username":'],
        ['declared oversize', body(), undefined, { headers: { 'content-length': '999999' } }],
        ['actual oversize', JSON.stringify({ ...body(), pad: 'x'.repeat(20_000) })],
      ];
      for (const [label, payload, field, init] of bad) {
        const response = await createRider(database, admin, payload, init);
        const result = await response.json();
        expect([response.status, result.error?.code ?? result], label).toEqual([422, 'VALIDATION_ERROR']);
        if (field) expect(Object.keys(result.error.fieldErrors ?? {}), label).toContain(field);
        expect(JSON.stringify(result), label).not.toContain(INITIAL);
      }
      expect((await account(database, 'rider.new'))).toBeUndefined();
      expect(await events(database, 'USER_CREATED')).toEqual([]);
    });
  });

  it('TC09 is Admin only, and needs the session CSRF token and same origin', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      for (const who of ['seller.a', 'rider.a', 'must.change'] as const) {
        const actor = await loginAs(database, who, { handlers: auth });
        expect([(await createRider(database, actor)).status, who]).toEqual([403, who]);
      }
      const anonymous = await bootstrapCsrf(auth);
      const asAnonymous = await handlers(database).createRider(apiRequest('/admin/riders', { method: 'POST', ...anonymous, body: JSON.stringify(body()) }));
      expect(asAnonymous.status).toBe(401);
      const noCsrf = await handlers(database).createRider(apiRequest('/admin/riders', { method: 'POST', cookie: admin.cookie, body: JSON.stringify(body()) }));
      expect([noCsrf.status, await errorCode(noCsrf)]).toEqual([403, 'CSRF_INVALID']);
      const foreign = await createRider(database, admin, body(), { headers: { origin: 'https://evil.example' } });
      expect(foreign.status).toBe(403);
      expect((await account(database, 'rider.new'))).toBeUndefined();
    });
  });
});

describe('M1-PH3-T04 A21 POST /admin/users/{userId}/password-reset', () => {
  it('TC23 returns a one-time password once, ends the sessions, forces a change and expires in 72 hours', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      const seller = await loginAs(database, 'seller.a', { handlers: auth });
      const before = await account(database, 'seller.a');
      const oldPassword = database.loginInput('seller.a').password;

      const response = await reset(database, admin, before.id);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const text = await response.text();
      const { temporaryPassword, ...rest } = JSON.parse(text);
      expect(rest).toEqual({});
      expect(temporaryPassword).toMatch(/^[A-Za-z0-9_-]{24}$/);

      expect((await auth.me(seller.request('/auth/me'))).status).toBe(401);
      expect(await account(database, 'seller.a')).toMatchObject({ must_change_password: true, sessions: '0', version: before.version + 1, session_version: before.session_version + 1 });
      expect((await account(database, 'seller.a')).hours).toBeGreaterThan(71.9);
      expect((await signIn(auth, 'seller.a', oldPassword)).status).toBe(401);
      const fresh = await signIn(auth, 'seller.a', temporaryPassword);
      expect(fresh.status).toBe(200);
      expect(await fresh.json()).toMatchObject({ mustChangePassword: true });

      const [event] = await events(database, 'PASSWORD_RESET');
      expect(event).toMatchObject({ actor_id: database.accounts.admin, target_user_id: before.id, outcome: 'SUCCESS', details: {} });
      expect(JSON.stringify(await owner(database, 'SELECT * FROM app.audit_event'))).not.toContain(temporaryPassword);
      expect(JSON.stringify(await owner(database, 'SELECT * FROM app.rate_limit_bucket'))).not.toContain(temporaryPassword);
    });
  });

  it('TC23 generates a different password every time, and an unused one stops working after 72 hours', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      const rider = await account(database, 'rider.b');
      const first = (await (await reset(database, admin, rider.id)).json()).temporaryPassword as string;
      const second = (await (await reset(database, admin, rider.id)).json()).temporaryPassword as string;
      expect(second).not.toBe(first);
      expect((await signIn(auth, 'rider.b', first)).status).toBe(401);
      await owner(database, "UPDATE app.app_user SET credential_expires_at = now() - interval '1 minute' WHERE username = 'rider.b'");
      const expired = await signIn(auth, 'rider.b', second);
      expect([expired.status, await errorCode(expired)]).toEqual([401, 'AUTH_INVALID']);
      expect((await events(database, 'PASSWORD_RESET')).length).toBe(2);
    });
  });

  it('TC23 refuses Admin and self targets and reports unknown or malformed ones as not found, changing nothing', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const before = await account(database, 'admin');
      const refused = await reset(database, admin, database.accounts.admin);
      expect([refused.status, await errorCode(refused)]).toEqual([403, 'TARGET_NOT_ALLOWED']);
      const missing = await reset(database, admin, '999999999');
      expect([missing.status, await errorCode(missing)]).toEqual([404, 'NOT_FOUND']);
      for (const malformed of ['abc', '0', '-1', '01', '1%20OR%201=1', '99999999999999999999']) {
        const response = await reset(database, admin, malformed);
        expect([response.status, await errorCode(response)], malformed).toEqual([404, 'NOT_FOUND']);
      }
      expect(await account(database, 'admin')).toEqual(before);
      expect(await events(database, 'PASSWORD_RESET')).toEqual([]);
    });
  });

  it('TC09 is Admin only, and needs the session CSRF token and same origin', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers: auth });
      const target = await account(database, 'seller.b');
      for (const who of ['seller.a', 'rider.a', 'must.change'] as const) {
        const actor = await loginAs(database, who, { handlers: auth });
        expect([(await reset(database, actor, target.id)).status, who]).toEqual([403, who]);
      }
      const noCsrf = await handlers(database).resetPassword(
        apiRequest(`/admin/users/${target.id}/password-reset`, { method: 'POST', cookie: admin.cookie }), { params: Promise.resolve({ userId: target.id }) });
      expect([noCsrf.status, await errorCode(noCsrf)]).toEqual([403, 'CSRF_INVALID']);
      const foreign = await handlers(database).resetPassword(
        admin.request(`/admin/users/${target.id}/password-reset`, { method: 'POST', headers: { origin: 'https://evil.example' } }), { params: Promise.resolve({ userId: target.id }) });
      expect(foreign.status).toBe(403);
      expect(await account(database, 'seller.b')).toEqual(target);
      expect(await events(database, 'PASSWORD_RESET')).toEqual([]);
    });
  });
});
