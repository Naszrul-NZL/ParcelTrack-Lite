import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseHarness, TestClock, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, loginAs, origin, type AuthHandlers, type LoginSession } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const NEW_PASSWORD = 'a-brand-new-long-secret';
type Failure = { error: { code: string; fieldErrors?: Record<string, string> } };

function change(handlers: AuthHandlers, session: LoginSession, body: unknown, init: { headers?: Record<string, string> } = {}) {
  return handlers.changePassword(session.request('/auth/password', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }));
}
async function owner(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  return (await database.migrationClient()).query(text, values);
}
async function account(database: IsolatedDatabase, username: string) {
  return (await owner(database, `SELECT id, password_hash, must_change_password, credential_expires_at, version, session_version,
    (SELECT count(*) FROM app.auth_session s WHERE s.user_id = u.id) AS sessions FROM app.app_user u WHERE username = $1`, [username])).rows[0];
}
const failure = async (response: Response) => (await response.json()) as Failure;
const signIn = async (handlers: AuthHandlers, username: string, password: string) =>
  handlers.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(handlers)), body: JSON.stringify({ username, password }) }));

describe('M1-PH3-T06 A06 POST /auth/password', () => {
  it('TC06 refuses a wrong current password without changing anything, limits repeated attempts per account, then accepts the right one', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Date.now());
      const handlers = authHandlers(database, { clock: clock.now });
      const good = database.loginInput('seller.a').password;
      const session = await loginAs(database, 'seller.a', { handlers });
      const before = await account(database, 'seller.a');

      const first = await change(handlers, session, { currentPassword: 'not-the-current-password', newPassword: NEW_PASSWORD });
      const rejected = await failure(first);
      expect([first.status, rejected.error.code]).toEqual([422, 'CURRENT_PASSWORD_INVALID']);
      expect(Object.keys(rejected.error.fieldErrors ?? {})).toEqual(['currentPassword']);
      expect((await signIn(handlers, 'seller.a', good)).status).toBe(200);
      expect(await account(database, 'seller.a')).toMatchObject({ password_hash: before.password_hash, version: before.version });

      for (let attempt = 2; attempt <= 5; attempt++) expect((await change(handlers, session, { currentPassword: 'wrong-' + attempt + '-password', newPassword: NEW_PASSWORD })).status, 'attempt ' + attempt).toBe(422);
      // The sixth attempt is refused outright, even with the correct password.
      const blocked = await change(handlers, session, { currentPassword: good, newPassword: NEW_PASSWORD });
      expect([blocked.status, (await failure(blocked)).error.code]).toEqual([429, 'RATE_LIMITED']);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      expect((await account(database, 'seller.a')).password_hash).toBe(before.password_hash);

      // The limit belongs to the account: another Seller is unaffected, and the window expires.
      const other = await loginAs(database, 'seller.b', { handlers });
      expect((await change(handlers, other, { currentPassword: database.loginInput('seller.b').password, newPassword: NEW_PASSWORD })).status).toBe(204);
      clock.advance(15 * 60 * 1000 + 1000);
      const accepted = await change(handlers, session, { currentPassword: good, newPassword: NEW_PASSWORD });
      expect(accepted.status).toBe(204);
    });
  });

  it('TC07 ends every session of the account, including the caller\'s, and only the new password signs in', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const good = database.loginInput('seller.a').password;
      const first = await loginAs(database, 'seller.a', { handlers });
      const second = await loginAs(database, 'seller.a', { handlers });
      const bystander = await loginAs(database, 'rider.a', { handlers });
      const before = await account(database, 'seller.a');
      expect(before.sessions).toBe('2');

      const response = await change(handlers, first, { currentPassword: good, newPassword: NEW_PASSWORD });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('set-cookie')).toMatch(/^ptl_session_dev=; .*Max-Age=0/);
      expect((await handlers.me(first.request('/auth/me'))).status).toBe(401);
      expect((await handlers.me(second.request('/auth/me'))).status).toBe(401);
      expect((await handlers.me(bystander.request('/auth/me'))).status).toBe(200);

      const after = await account(database, 'seller.a');
      expect(after).toMatchObject({ sessions: '0', version: before.version + 1, session_version: before.session_version + 1, must_change_password: false });
      expect(after.password_hash).toMatch(/^\$argon2id\$/);
      expect(after.password_hash).not.toBe(before.password_hash);
      expect((await signIn(handlers, 'seller.a', good)).status).toBe(401);
      expect((await signIn(handlers, 'seller.a', NEW_PASSWORD)).status).toBe(200);

      const events = (await owner(database, "SELECT actor_id, target_user_id, outcome, details::text AS details FROM app.audit_event WHERE event_type = 'PASSWORD_CHANGED'")).rows;
      expect(events).toEqual([{ actor_id: before.id, target_user_id: before.id, outcome: 'SUCCESS', details: '{}' }]);
      for (const table of ['app_user', 'audit_event', 'rate_limit_bucket', 'auth_session']) {
        for (const secret of [good, NEW_PASSWORD]) {
          expect(Number((await owner(database, `SELECT count(*) FROM app.${table} t WHERE t::text LIKE $1`, ['%' + secret + '%'])).rows[0].count), `${table} ${secret.length}`).toBe(0);
        }
      }
    });
  });

  it('lets an account that must change its password do so, clearing the requirement and the credential expiry', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      await owner(database, "UPDATE app.app_user SET credential_expires_at = now() + interval '1 hour' WHERE username = 'must.change'");
      const session = await loginAs(database, 'must.change', { handlers });
      expect(session.principal.mustChangePassword).toBe(true);
      const response = await change(handlers, session, { currentPassword: database.loginInput('must.change').password, newPassword: NEW_PASSWORD });
      expect(response.status).toBe(204);
      expect(await account(database, 'must.change')).toMatchObject({ must_change_password: false, credential_expires_at: null, sessions: '0' });
      const login = await signIn(handlers, 'must.change', NEW_PASSWORD);
      expect(login.status).toBe(200);
      expect(await login.json()).toMatchObject({ mustChangePassword: false });
    });
  });

  it('rejects a bad new password, an unchanged one and a malformed body with 422, changing nothing', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const good = database.loginInput('seller.a').password;
      const session = await loginAs(database, 'seller.a', { handlers });
      const before = await account(database, 'seller.a');
      const cases: [string, unknown, string?][] = [
        ['same as current', { currentPassword: good, newPassword: good }, 'newPassword'],
        ['9 characters', { currentPassword: good, newPassword: 'x'.repeat(9) }, 'newPassword'],
        ['129 characters', { currentPassword: good, newPassword: 'x'.repeat(129) }, 'newPassword'],
        ['common password', { currentPassword: good, newPassword: 'password123' }, 'newPassword'],
        ['empty current', { currentPassword: '', newPassword: NEW_PASSWORD }, 'currentPassword'],
        ['over-long current', { currentPassword: 'y'.repeat(129), newPassword: NEW_PASSWORD }, 'currentPassword'],
        ['missing new', { currentPassword: good }, 'newPassword'],
        ['extra userId field', { currentPassword: good, newPassword: NEW_PASSWORD, userId: '1' }],
        ['extra role field', { currentPassword: good, newPassword: NEW_PASSWORD, role: 'ADMIN' }],
        ['number password', { currentPassword: 12345678901, newPassword: NEW_PASSWORD }, 'currentPassword'],
        ['null body', 'null'], ['bad JSON', '{"currentPassword":'], ['not JSON', 'newPassword=x'],
        ['oversize', JSON.stringify({ currentPassword: good, newPassword: NEW_PASSWORD, pad: 'x'.repeat(20_000) })],
      ];
      for (const [label, body, field] of cases) {
        const response = await change(handlers, session, body);
        const result = await failure(response);
        expect([response.status, result.error.code], label).toEqual([422, 'VALIDATION_ERROR']);
        if (field) expect(Object.keys(result.error.fieldErrors ?? {}), label).toContain(field);
        expect(JSON.stringify(result), label).not.toMatch(/password123|argon2/i);
      }
      // A rejected request is not a wrong-password attempt, so it does not count against the limit.
      expect((await owner(database, "SELECT count(*) FROM app.rate_limit_bucket WHERE bucket_type = 'password_attempt'")).rows[0].count).toBe('0');
      expect(await account(database, 'seller.a')).toMatchObject({ password_hash: before.password_hash, sessions: '1' });
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
    });
  });

  it('requires a live user session, the CSRF token and same-origin evidence, and changes nothing when refused', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const good = database.loginInput('seller.a').password;
      const session = await loginAs(database, 'seller.a', { handlers });
      const other = await loginAs(database, 'seller.b', { handlers });
      const before = await account(database, 'seller.a');
      const body = JSON.stringify({ currentPassword: good, newPassword: NEW_PASSWORD });
      const send = (headers: Record<string, string>, cookie: string | null = session.cookie) => handlers.changePassword(new Request(origin() + '/api/v1/auth/password', {
        method: 'POST', body, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json', ...headers },
      }));
      const csrf: [string, Response][] = [
        ['no token', await send({ origin: origin() })], ['wrong token', await send({ origin: origin(), 'x-csrf-token': 'wrong' })],
        ["another account's token", await send({ origin: origin(), 'x-csrf-token': other.csrfToken })],
        ['foreign origin', await send({ origin: 'https://foreign.invalid', 'x-csrf-token': session.csrfToken })],
        ['no provenance', await send({ 'x-csrf-token': session.csrfToken })],
      ];
      for (const [label, response] of csrf) expect([response.status, (await failure(response)).error.code], label).toEqual([403, 'CSRF_INVALID']);
      const anonymous = await bootstrapCsrf(handlers);
      for (const [label, response] of [
        ['no cookie', await send({ origin: origin(), 'x-csrf-token': session.csrfToken }, null)],
        ['anonymous session', await send({ origin: origin(), 'x-csrf-token': anonymous.csrfToken }, anonymous.cookie)],
      ] as [string, Response][]) expect([response.status, (await failure(response)).error.code], label).toEqual([401, 'UNAUTHENTICATED']);
      expect(await account(database, 'seller.a')).toMatchObject({ password_hash: before.password_hash, sessions: '1' });
      expect((await send({ referer: origin() + '/account/password', 'x-csrf-token': session.csrfToken })).status).toBe(204);
    });
  });

  it('lets one of two simultaneous changes win and never leaves both passwords valid or any session alive', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const good = database.loginInput('seller.a').password;
      const first = await loginAs(database, 'seller.a', { handlers });
      const second = await loginAs(database, 'seller.a', { handlers });
      const results = await Promise.all([
        change(handlers, first, { currentPassword: good, newPassword: 'first-new-long-secret' }),
        change(handlers, second, { currentPassword: good, newPassword: 'second-new-long-secret' }),
      ]);
      const statuses = results.map(response => response.status).sort();
      expect(statuses[0]).toBe(204);
      expect([401, 409]).toContain(statuses[1]);
      expect((await account(database, 'seller.a')).sessions).toBe('0');
      const worked = [
        (await signIn(handlers, 'seller.a', 'first-new-long-secret')).status,
        (await signIn(handlers, 'seller.a', 'second-new-long-secret')).status,
      ];
      expect(worked.filter(status => status === 200)).toHaveLength(1);
      expect((await signIn(handlers, 'seller.a', good)).status).toBe(401);
    });
  });

  it('is refused with 503 MAINTENANCE during maintenance, keeping the session, and works afterwards', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const good = database.loginInput('seller.a').password;
      const session = await loginAs(database, 'seller.a', { handlers });
      const operator = await database.migrationClient();
      await operator.query('SET ROLE ops_fn_owner');
      await operator.query("UPDATE app.system_state SET maintenance_mode = true, set_until = now() + interval '5 minutes'");
      try {
        const blocked = await change(handlers, session, { currentPassword: good, newPassword: NEW_PASSWORD });
        expect([blocked.status, (await failure(blocked)).error.code]).toEqual([503, 'MAINTENANCE']);
        expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      } finally {
        await operator.query('UPDATE app.system_state SET maintenance_mode = false, set_until = NULL');
        await operator.query('RESET ROLE');
      }
      expect((await change(handlers, session, { currentPassword: good, newPassword: NEW_PASSWORD })).status).toBe(204);
    });
  });

  it('cannot be used by an account that was disabled after its session was issued', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'rider.a', { handlers });
      const operator = await database.migrationClient();
      await operator.query('SET ROLE auth_fn_owner');
      await operator.query("UPDATE app.app_user SET is_active = false WHERE username = 'rider.a'");
      await operator.query('RESET ROLE');
      const response = await change(handlers, session, { currentPassword: database.loginInput('rider.a').password, newPassword: NEW_PASSWORD });
      expect([response.status, (await failure(response)).error.code]).toEqual([401, 'UNAUTHENTICATED']);
    });
  });
});
