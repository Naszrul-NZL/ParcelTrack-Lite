import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseHarness, TestClock, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, origin, type AuthHandlers } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const PASSWORD = 'a-sufficiently-long-secret';
const valid = (username: string) => ({ username, displayName: 'New Seller', password: PASSWORD });
type Session = { cookie: string; csrfToken: string };
const session = (handlers: AuthHandlers) => bootstrapCsrf(handlers);

function register(handlers: AuthHandlers, s: Session, body: unknown, init: { headers?: Record<string, string> } = {}) {
  return handlers.register(apiRequest('/auth/register', { method: 'POST', cookie: s.cookie, csrfToken: s.csrfToken, body: typeof body === 'string' ? body : JSON.stringify(body), ...init }));
}
async function owner(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  return (await database.migrationClient()).query(text, values);
}
const accountCount = async (database: IsolatedDatabase) => Number((await owner(database, 'SELECT count(*) FROM app.app_user')).rows[0].count);
const detail = async (response: Response) => (await response.json()) as { error: { code: string; fieldErrors?: Record<string, string> } };

describe('M1-PH3-T03 A02 POST /auth/register', () => {
  it('TC01 rejects a 9-character password with a field error and creates nothing; 10 characters create a Seller, never signed in', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const short = await register(handlers, s, { ...valid('new.seller'), password: 'x'.repeat(9) });
      const rejected = await detail(short);
      expect([short.status, rejected.error.code]).toEqual([422, 'VALIDATION_ERROR']);
      expect(Object.keys(rejected.error.fieldErrors ?? {})).toContain('password');
      expect(await accountCount(database)).toBe(7);

      const created = await register(handlers, s, { ...valid('new.seller'), password: 'x'.repeat(10) });
      expect(created.status).toBe(201);
      expect(created.headers.get('cache-control')).toBe('no-store');
      expect(created.headers.getSetCookie()).toEqual([]);
      const body = await created.json();
      expect(Object.keys(body).sort()).toEqual(['displayName', 'id', 'mustChangePassword', 'role', 'username']);
      expect(body).toMatchObject({ username: 'new.seller', displayName: 'New Seller', role: 'SELLER', mustChangePassword: false });
      expect(JSON.stringify(body)).not.toMatch(/argon2|hash|x{10}/);
      expect((await owner(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NOT NULL')).rows[0].count).toBe('0');
    });
  });

  it('stores an Argon2id hash only, audits USER_CREATED without the password, and the new Seller can then sign in', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const response = await register(handlers, s, valid('fresh.seller'));
      const created = await response.json();
      const row = (await owner(database, 'SELECT password_hash, role, is_active, must_change_password FROM app.app_user WHERE username = $1', ['fresh.seller'])).rows[0];
      expect(row).toMatchObject({ role: 'SELLER', is_active: true, must_change_password: false });
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
      const events = (await owner(database, "SELECT actor_id, target_user_id, outcome, details::text AS details FROM app.audit_event WHERE event_type = 'USER_CREATED'")).rows;
      expect(events).toEqual([{ actor_id: created.id, target_user_id: created.id, outcome: 'SUCCESS', details: '{"role": "SELLER"}' }]);
      for (const table of ['app_user', 'audit_event', 'rate_limit_bucket', 'auth_session']) {
        expect(Number((await owner(database, `SELECT count(*) FROM app.${table} t WHERE t::text LIKE $1`, ['%' + PASSWORD + '%'])).rows[0].count), table).toBe(0);
      }
      const login = await handlers.login(apiRequest('/auth/login', { method: 'POST', ...(await session(handlers)), body: JSON.stringify({ username: 'fresh.seller', password: PASSWORD }) }));
      expect(login.status).toBe(200);
      expect(await login.json()).toMatchObject({ role: 'SELLER', mustChangePassword: false });
    });
  });

  it('TC02 rejects any field the client must not choose, and an injected role never reaches the account', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      for (const extra of [{ role: 'ADMIN' }, { role: 'RIDER' }, { isActive: false }, { mustChangePassword: true }, { id: '1' }, { version: 9 }, { sessionVersion: 9 }, { is_admin: true }]) {
        const response = await register(handlers, s, { ...valid('sneaky.user'), ...extra });
        expect([response.status, (await detail(response)).error.code], JSON.stringify(extra)).toEqual([422, 'VALIDATION_ERROR']);
      }
      const prototype = await register(handlers, s, '{"username":"proto.user","displayName":"P","password":"a-sufficiently-long-secret","__proto__":{"role":"ADMIN"}}');
      expect(prototype.status).toBe(422);
      expect(await accountCount(database)).toBe(7);
      const ok = await register(handlers, s, valid('plain.user'));
      expect((await ok.json()).role).toBe('SELLER');
    });
  });

  it('TC03 answers a different-case duplicate with 409, and lets exactly one of two simultaneous registrations win without a 500', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const clash = await register(handlers, s, valid('SELLER.A'));
      expect([clash.status, (await detail(clash)).error.code]).toEqual([409, 'USERNAME_TAKEN']);
      const results = await Promise.all([register(handlers, s, valid('race.winner')), register(handlers, s, valid('race.winner'))]);
      expect(results.map(response => response.status).sort()).toEqual([201, 409]);
      expect((await owner(database, "SELECT count(*) FROM app.app_user WHERE username = 'race.winner'")).rows[0].count).toBe('1');
      expect((await owner(database, "SELECT count(*) FROM app.audit_event WHERE event_type = 'USER_CREATED'")).rows[0].count).toBe('1');
    });
  });

  it('TC04 gives each invalid username, display name and common password its own field error and echoes no input', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const cases: [string, Record<string, unknown>, string][] = [
        ['one-character username', { username: 'a' }, 'username'], ['space in username', { username: 'a b' }, 'username'],
        ['Cyrillic homoglyph', { username: 'аlice' }, 'username'], ['51-character username', { username: 'a'.repeat(51) }, 'username'],
        ['SQL characters', { username: "a';--" }, 'username'], ['empty display name', { displayName: '' }, 'displayName'],
        ['blank display name', { displayName: '   ' }, 'displayName'], ['81-character display name', { displayName: 'x'.repeat(81) }, 'displayName'],
        ['common password', { password: 'password123' }, 'password'], ['128+ character password', { password: 'p'.repeat(129) }, 'password'],
      ];
      for (const [label, override, field] of cases) {
        const response = await register(handlers, s, { ...valid('check.user'), ...override });
        const body = await detail(response);
        expect([response.status, body.error.code], label).toEqual([422, 'VALIDATION_ERROR']);
        expect(Object.keys(body.error.fieldErrors ?? {}), label).toContain(field);
        expect(JSON.stringify(body), label).not.toMatch(/password123|a';--|select|syntax/i);
      }
      for (const [label, body] of [['missing username', { displayName: 'N', password: PASSWORD }], ['numeric username', { ...valid('x'), username: 12345 }], ['array body', []], ['null body', null], ['bad JSON', '{"username":'], ['not JSON', 'username=x']] as [string, unknown][]) {
        expect((await register(handlers, s, body)).status, label).toBe(422);
      }
      expect((await register(handlers, s, JSON.stringify({ ...valid('big.user'), displayName: 'x'.repeat(20_000) }))).status).toBe(422);
      expect(await accountCount(database)).toBe(7);
    });
  });

  it('TC05 limits registrations per source address, leaves another source alone and recovers after the hour', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Date.now());
      const first = authHandlers(database, { source: '203.0.113.50', clock: clock.now, registrationLimit: 10 });
      const other = authHandlers(database, { source: '203.0.113.60', clock: clock.now, registrationLimit: 10 });
      const s = await session(first);
      for (let i = 1; i <= 10; i++) expect((await register(first, s, valid('burst.' + i))).status, 'attempt ' + i).toBe(201);
      const limited = await register(first, s, valid('burst.11'));
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      expect((await detail(limited)).error.code).toBe('RATE_LIMITED');
      expect((await owner(database, "SELECT count(*) FROM app.app_user WHERE username = 'burst.11'")).rows[0].count).toBe('0');
      expect((await register(other, await session(other), valid('other.source'))).status).toBe(201);
      clock.advance(60 * 60 * 1000 + 1000);
      expect((await register(first, s, valid('burst.12'))).status).toBe(201);
    });
  });

  it('requires a session CSRF token and same-origin evidence, and creates nothing when refused', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const other = await session(handlers);
      const send = (headers: Record<string, string>, cookie = s.cookie) => handlers.register(new Request(origin() + '/api/v1/auth/register', {
        method: 'POST', body: JSON.stringify(valid('csrf.user')), headers: { cookie, 'content-type': 'application/json', ...headers },
      }));
      const cases: [string, Response][] = [
        ['no token', await send({ origin: origin() })], ['wrong token', await send({ origin: origin(), 'x-csrf-token': 'wrong' })],
        ["another session's token", await send({ origin: origin(), 'x-csrf-token': other.csrfToken })],
        ['foreign origin', await send({ origin: 'https://foreign.invalid', 'x-csrf-token': s.csrfToken })],
        ['no provenance', await send({ 'x-csrf-token': s.csrfToken })],
        ['no session at all', await handlers.register(new Request(origin() + '/api/v1/auth/register', { method: 'POST', body: JSON.stringify(valid('csrf.user')), headers: { origin: origin(), 'content-type': 'application/json', 'x-csrf-token': s.csrfToken } }))],
      ];
      for (const [label, response] of cases) expect([response.status, (await detail(response)).error.code], label).toEqual([403, 'CSRF_INVALID']);
      expect(await accountCount(database)).toBe(7);
      expect((await send({ referer: origin() + '/register', 'x-csrf-token': s.csrfToken })).status).toBe(201);
    });
  });

  it('is refused with 503 MAINTENANCE during maintenance, and works again afterwards', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const s = await session(handlers);
      const operator = await database.migrationClient();
      await operator.query('SET ROLE ops_fn_owner');
      await operator.query("UPDATE app.system_state SET maintenance_mode = true, set_until = now() + interval '5 minutes'");
      try {
        const blocked = await register(handlers, s, valid('maint.user'));
        expect([blocked.status, (await detail(blocked)).error.code]).toEqual([503, 'MAINTENANCE']);
        expect(await accountCount(database)).toBe(7);
      } finally {
        await operator.query('UPDATE app.system_state SET maintenance_mode = false, set_until = NULL');
        await operator.query('RESET ROLE');
      }
      expect((await register(handlers, s, valid('maint.user'))).status).toBe(201);
    });
  });
});
