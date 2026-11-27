import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseHarness, TestClock, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, cookieFrom, loginAs, origin } from '../harness/login-as';
import { createPrincipalUow } from '@/server/core/authorized';
import { RATE_RULES, RateLimiter } from '@/server/modules/auth/rate-limit';
import { touchSession, tokenDigest } from '@/server/modules/auth/sessions';

const settings = { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' };
let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

async function sql(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  // app_runtime may only INSERT into audit_event, so tests read the audit trail through the owner connection.
  if (text.includes('audit_event') && /^\s*SELECT/i.test(text)) return (await database.migrationClient()).query(text, values);
  const client = await database.pool().connect();
  try { return await client.query(text, values); } finally { client.release(); }
}
async function owner(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  const client = await database.migrationClient();
  return client.query(text, values);
}
const count = async (database: IsolatedDatabase, text: string, values: unknown[] = []) => Number((await sql(database, text, values)).rows[0].count);

async function attempt(handlers: ReturnType<typeof authHandlers>, body: unknown) {
  const anonymous = await bootstrapCsrf(handlers);
  return handlers.login(apiRequest('/auth/login', { method: 'POST', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, body: JSON.stringify(body) }));
}
const wrong = (database: IsolatedDatabase, username: 'seller.a' = 'seller.a') => ({ username, password: database.loginInput(username).password + '-wrong' });

describe('M1-PH2 login, session and CSRF services', () => {
  it('TC01 logs in as Seller A with a digest-only, HttpOnly, SameSite=Lax cookie', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const anonymous = await bootstrapCsrf(handlers);
      const response = await handlers.login(apiRequest('/auth/login', { method: 'POST', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, body: JSON.stringify(database.loginInput('seller.a')) }));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = await response.json();
      expect(body).toEqual({ id: database.accounts['seller.a'], username: 'seller.a', displayName: 'seller.a', role: 'SELLER', mustChangePassword: false, csrfToken: expect.any(String) });
      expect(JSON.stringify(body)).not.toMatch(/argon2|password_hash|session_version/i);
      const cookie = response.headers.getSetCookie().find(value => value.startsWith('ptl_session_dev='))!;
      expect(cookie).toMatch(/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
      expect(cookie).not.toMatch(/Domain=/i);
      const token = cookie.split(';')[0].split('=')[1];
      const stored = (await sql(database, 'SELECT token_digest FROM app.auth_session WHERE user_id IS NOT NULL')).rows;
      expect(stored).toEqual([{ token_digest: tokenDigest(token) }]);
      expect(stored[0].token_digest).not.toBe(token);
    });
  });

  it('TC02 rotates the session at login and rejects the old anonymous token', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const anonymous = await bootstrapCsrf(handlers);
      const login = () => handlers.login(apiRequest('/auth/login', { method: 'POST', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, body: JSON.stringify(database.loginInput('seller.a')) }));
      const first = await login();
      expect(first.status).toBe(200);
      const rotated = cookieFrom(first)!;
      expect(rotated).not.toBe(anonymous.cookie);
      expect(await count(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NULL')).toBe(0);
      expect((await handlers.me(apiRequest('/auth/me', { cookie: anonymous.cookie }))).status).toBe(401);
      expect((await handlers.me(apiRequest('/auth/me', { cookie: rotated }))).status).toBe(200);
      expect((await login()).status).toBe(403);
    });
  });

  it('TC03 answers a SQL-injection username with a generic 401, no user session and a failure audit row', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const response = await attempt(handlers, { username: "' OR '1'='1", password: 'any-password-value' });
      const text = await response.text();
      expect(response.status).toBe(401);
      expect(JSON.parse(text).error.code).toBe('AUTH_INVALID');
      expect(text).not.toMatch(/select|syntax|OR '1'/i);
      expect(await count(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NOT NULL')).toBe(0);
      expect(await count(database, "SELECT count(*) FROM app.audit_event WHERE event_type='LOGIN_FAILED'")).toBe(1);
    });
  });

  it('TC04 gives unknown user, wrong password and inactive account the same response and counts each', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const bodies = [
        { username: 'nobody.here', password: 'some-password-value' },
        wrong(database),
        database.loginInput('inactive'),
      ];
      const seen = new Set<string>();
      for (const body of bodies) {
        const response = await attempt(handlers, body);
        const parsed = await response.json();
        seen.add(JSON.stringify([response.status, parsed.error.code, parsed.error.message, parsed.error.fieldErrors]));
      }
      expect([...seen]).toHaveLength(1);
      expect(JSON.parse([...seen][0])[0]).toBe(401);
      expect(await count(database, "SELECT coalesce(sum(counter),0) AS count FROM app.rate_limit_bucket WHERE bucket_type=$1", [RATE_RULES.loginSource.type])).toBe(3);
    });
  });

  it('TC05 blocks the fifth-failure pair, isolates sources, counts only failures and recovers after the window', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Date.now());
      const a = authHandlers(database, { source: '203.0.113.10', clock: clock.now });
      const b = authHandlers(database, { source: '203.0.113.20', clock: clock.now });
      for (let i = 1; i <= 4; i++) expect((await attempt(a, wrong(database))).status).toBe(401);
      expect((await attempt(a, wrong(database))).status).toBe(401);
      const blocked = await attempt(a, database.loginInput('seller.a'));
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      expect((await blocked.json()).error.code).toBe('RATE_LIMITED');
      expect(await count(database, "SELECT count(*) FROM app.audit_event WHERE event_type='LOGIN_THROTTLED'")).toBe(1);
      await attempt(a, database.loginInput('seller.a'));
      expect(await count(database, "SELECT count(*) FROM app.audit_event WHERE event_type='LOGIN_THROTTLED'")).toBe(1);
      expect((await attempt(b, database.loginInput('seller.a'))).status).toBe(200);
      clock.advance(15 * 60 * 1000 + 1000);
      expect((await attempt(a, database.loginInput('seller.a'))).status).toBe(200);
    });
  });

  it('TC05 applies the per-source failure cap to failures only', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Date.now());
      const source = '198.51.100.7';
      const handlers = authHandlers(database, { source, clock: clock.now });
      const client = await database.pool().connect();
      try {
        const limiter = new RateLimiter(process.env.RATE_LIMIT_KEY!, clock.now);
        const normalized = '198.51.100.7';
        for (let i = 0; i < 99; i++) await limiter.increment(client, RATE_RULES.loginSource, normalized);
      } finally { client.release(); }
      expect((await attempt(handlers, { username: 'someone.else', password: 'some-password-value' })).status).toBe(401);
      const blocked = await attempt(handlers, database.loginInput('seller.b'));
      expect(blocked.status).toBe(429);
      const fresh = authHandlers(database, { source: '198.51.100.8', clock: clock.now });
      for (let i = 0; i < 50; i++) expect((await attempt(fresh, database.loginInput('seller.b'))).status).toBe(200);
      expect(await count(database, 'SELECT coalesce(sum(counter),0) AS count FROM app.rate_limit_bucket WHERE bucket_type=$1 AND expires_at>now()-interval \'1 year\'', [RATE_RULES.loginSource.type])).toBe(100);
    });
  });

  it('TC06 logout revokes the row, expires the cookie and the old cookie stops working', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'seller.a', { handlers });
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      const out = await handlers.logout(session.request('/auth/logout', { method: 'POST' }));
      expect(out.status).toBe(204);
      expect(out.headers.get('set-cookie')).toMatch(/^ptl_session_dev=; .*Max-Age=0/);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(401);
      expect(await count(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NOT NULL')).toBe(0);
      expect(await count(database, "SELECT count(*) FROM app.audit_event WHERE event_type='LOGOUT'")).toBe(1);
    });
  });

  it('TC07 rejects login and logout without matching CSRF and same-origin evidence, changing no state', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const anonymous = await bootstrapCsrf(handlers);
      const other = await bootstrapCsrf(handlers);
      const body = JSON.stringify(database.loginInput('seller.a'));
      const post = (headers: Record<string, string>, cookie = anonymous.cookie) =>
        handlers.login(new Request(origin() + '/api/v1/auth/login', { method: 'POST', body, headers: { cookie, 'content-type': 'application/json', ...headers } }));
      const denied: Record<string, string>[] = [
        { origin: origin() }, { origin: origin(), 'x-csrf-token': 'wrong' }, { origin: origin(), 'x-csrf-token': other.csrfToken },
        { origin: 'https://foreign.invalid', 'x-csrf-token': anonymous.csrfToken }, { 'x-csrf-token': anonymous.csrfToken },
      ];
      for (const headers of denied) {
        const response = await post(headers);
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('CSRF_INVALID');
      }
      expect(await count(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NOT NULL')).toBe(0);
      const session = await loginAs(database, 'seller.a', { handlers });
      for (const headers of [{ origin: origin() }, { origin: origin(), 'x-csrf-token': anonymous.csrfToken }, { 'x-csrf-token': session.csrfToken }] as Record<string, string>[]) {
        const response = await handlers.logout(new Request(origin() + '/api/v1/auth/logout', { method: 'POST', headers: { cookie: session.cookie, ...headers } }));
        expect(response.status).toBe(403);
      }
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      const referer = await handlers.logout(new Request(origin() + '/api/v1/auth/logout', { method: 'POST', headers: { cookie: session.cookie, referer: origin() + '/seller/parcels', 'x-csrf-token': session.csrfToken } }));
      expect(referer.status).toBe(204);
    });
  });

  it('TC08 enforces the role boundary on a probe route', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const service = createPrincipalUow(database.pool(), settings);
      const adminOnly = (request: Request) => service(request, { roles: ['ADMIN'] }, async () => 'ok').then(() => 200, (error: { code: string }) => ({ UNAUTHENTICATED: 401, FORBIDDEN: 403 })[error.code]);
      expect(await adminOnly(apiRequest('/probe'))).toBe(401);
      expect(await adminOnly((await loginAs(database, 'SELLER', { handlers })).request('/probe'))).toBe(403);
      expect(await adminOnly((await loginAs(database, 'ADMIN', { handlers })).request('/probe'))).toBe(200);
    });
  });

  it('TC09 denies /auth/me and a protected read after the account session version changes', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'seller.a', { handlers });
      const service = createPrincipalUow(database.pool(), settings);
      expect(await service(session.request('/parcels'), {}, async () => true)).toBe(true);
      const fixture = await database.fixtureClient();
      await fixture.query('SET ROLE auth_fn_owner');
      await fixture.query('UPDATE app.app_user SET session_version=session_version+1 WHERE id=$1', [database.accounts['seller.a']]);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(401);
      await expect(service(session.request('/parcels'), {}, async () => true)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    });
  });

  it('TC10 refuses an inactive account at login and ends an existing session when it is deactivated', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      expect((await attempt(handlers, database.loginInput('inactive'))).status).toBe(401);
      const session = await loginAs(database, 'rider.a', { handlers });
      const fixture = await database.fixtureClient();
      await fixture.query('SET ROLE auth_fn_owner');
      await fixture.query('UPDATE app.app_user SET is_active=false WHERE id=$1', [database.accounts['rider.a']]);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(401);
    });
  });

  it('M1-PH3 refuses an expired initial credential exactly like a wrong password, and accepts it again before expiry', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const signIn = async () => { const response = await attempt(handlers, database.loginInput('must.change')); return { status: response.status, body: await response.json() }; };
      await owner(database, "UPDATE app.app_user SET credential_expires_at = now() + interval '1 hour' WHERE username = 'must.change'");
      const valid = await signIn();
      expect(valid.status).toBe(200);
      expect(valid.body).toMatchObject({ username: 'must.change', mustChangePassword: true });
      await owner(database, "UPDATE app.app_user SET credential_expires_at = now() - interval '1 second' WHERE username = 'must.change'");
      const expired = await signIn();
      const wrongPassword = await attempt(handlers, { username: 'must.change', password: database.loginInput('must.change').password + '-wrong' });
      expect(expired.status).toBe(401);
      expect({ status: expired.status, error: expired.body.error }).toEqual({ status: wrongPassword.status, error: (await wrongPassword.json()).error });
      const reasons = (await sql(database, "SELECT details->>'reason' AS reason FROM app.audit_event WHERE event_type = 'LOGIN_FAILED' ORDER BY id")).rows.map(row => row.reason);
      expect(reasons).toEqual(['credential_expired', 'bad_password']);
    });
  });

  it('TC11 applies idle, absolute and anonymous expiry boundaries and never recreates a row', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'seller.a', { handlers });
      const digest = tokenDigest(session.cookie.split('=')[1]);
      const setIdle = (interval: string) => sql(database, `UPDATE app.auth_session SET last_seen_at=now()-interval '${interval}' WHERE token_digest=$1`, [digest]);
      await setIdle('29 minutes 59 seconds');
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      await setIdle('30 minutes');
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(401);
      const second = await loginAs(database, 'seller.a', { handlers });
      const secondDigest = tokenDigest(second.cookie.split('=')[1]);
      // Continuous activity near the 8 hour limit: a touch extends the idle expiry only up to the absolute expiry.
      await sql(database, "UPDATE app.auth_session SET created_at=now()-interval '7 hours 55 minutes',last_seen_at=now()-interval '2 minutes',expires_at=now()+interval '4 minutes',absolute_expires_at=now()+interval '5 minutes' WHERE token_digest=$1", [secondDigest]);
      expect((await handlers.me(second.request('/auth/me'))).status).toBe(200);
      expect((await sql(database, 'SELECT expires_at=absolute_expires_at AS capped FROM app.auth_session WHERE token_digest=$1', [secondDigest])).rows[0].capped).toBe(true);
      await sql(database, "UPDATE app.auth_session SET expires_at=now()-interval '1 second',absolute_expires_at=now()-interval '1 second' WHERE token_digest=$1", [secondDigest]);
      expect((await handlers.me(second.request('/auth/me'))).status).toBe(401);
      const client = await database.pool().connect();
      try {
        await client.query('BEGIN');
        expect(await touchSession(client, 'f'.repeat(64))).toBe(false);
        await client.query('COMMIT');
      } finally { client.release(); }
      expect(await count(database, "SELECT count(*) FROM app.auth_session WHERE token_digest=$1", ['f'.repeat(64)])).toBe(0);
      const anonymous = await bootstrapCsrf(handlers);
      await sql(database, "UPDATE app.auth_session SET created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute',absolute_expires_at=now()-interval '1 minute' WHERE user_id IS NULL");
      const expired = await handlers.login(apiRequest('/auth/login', { method: 'POST', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, body: JSON.stringify(database.loginInput('seller.a')) }));
      expect(expired.status).toBe(403);
      expect(cookieFrom(await handlers.csrf(apiRequest('/auth/csrf', { cookie: anonymous.cookie })))).not.toBe(anonymous.cookie);
    });
  });

  it('TC11 keeps an active session alive with touches but never past the absolute lifetime', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'seller.a', { handlers });
      const digest = tokenDigest(session.cookie.split('=')[1]);
      await sql(database, "UPDATE app.auth_session SET last_seen_at=now()-interval '5 minutes',expires_at=now()+interval '25 minutes' WHERE token_digest=$1", [digest]);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      const row = (await sql(database, 'SELECT expires_at<=absolute_expires_at AS bounded, last_seen_at>now()-interval \'1 minute\' AS touched FROM app.auth_session WHERE token_digest=$1', [digest])).rows[0];
      expect(row).toEqual({ bounded: true, touched: true });
    });
  });

  it('TC12 writes one audit event for a failed and a successful login with no secrets', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const password = database.loginInput('seller.a').password;
      await attempt(handlers, wrong(database));
      const session = await loginAs(database, 'seller.a', { handlers });
      const events = (await sql(database, 'SELECT event_type,outcome,actor_id,target_user_id,request_id,details FROM app.audit_event ORDER BY id')).rows;
      expect(events.map(event => event.event_type)).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCEEDED']);
      const text = JSON.stringify(events);
      for (const secret of [password, session.csrfToken, session.cookie.split('=')[1], 'seller.a-wrong']) expect(text).not.toContain(secret);
      expect(events[0].details).toEqual({ reason: 'bad_password', usernameDigest: expect.stringMatching(/^[0-9a-f]{64}$/), usernameLength: 8 });
      expect(events[1].actor_id).toBe(database.accounts['seller.a']);
    });
  });

  it('TC12 issues no session when the success audit cannot be written', async () => {
    await harness.run(async database => {
      await owner(database, `CREATE FUNCTION app.fail_success_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$`);
      await owner(database, "CREATE TRIGGER fail_success_audit BEFORE INSERT ON app.audit_event FOR EACH ROW WHEN (NEW.event_type='LOGIN_SUCCEEDED') EXECUTE FUNCTION app.fail_success_audit()");
      const handlers = authHandlers(database);
      const response = await attempt(handlers, database.loginInput('seller.a'));
      expect(response.status).toBe(500);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await count(database, 'SELECT count(*) FROM app.auth_session WHERE user_id IS NOT NULL')).toBe(0);
    });
  });

  it('TC17 stores Argon2id hashes and no plaintext seed password anywhere in the database', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      await attempt(handlers, wrong(database));
      await loginAs(database, 'seller.a', { handlers });
      const hashes = (await owner(database, 'SELECT password_hash FROM app.app_user')).rows;
      expect(hashes).toHaveLength(7);
      for (const row of hashes) expect(row.password_hash).toMatch(/^\$argon2id\$/);
      const password = database.loginInput('seller.a').password;
      for (const table of ['app_user', 'auth_session', 'audit_event', 'rate_limit_bucket']) {
        expect(Number((await owner(database, `SELECT count(*) FROM app.${table} t WHERE t::text LIKE $1`, ['%' + password + '%'])).rows[0].count)).toBe(0);
      }
    });
  });

  it('TC19 reuses an existing session for repeated CSRF calls and limits cookie-less creation to 60 a minute', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Math.ceil(Date.now() / 60_000) * 60_000);
      const handlers = authHandlers(database, { source: '192.0.2.44', clock: clock.now });
      const first = await bootstrapCsrf(handlers);
      for (let i = 0; i < 3; i++) expect((await bootstrapCsrf(handlers, first.cookie)).csrfToken).toBe(first.csrfToken);
      expect(await count(database, 'SELECT count(*) FROM app.auth_session')).toBe(1);
      for (let i = 1; i < 60; i++) expect((await handlers.csrf(apiRequest('/auth/csrf'))).status).toBe(200);
      const limited = await handlers.csrf(apiRequest('/auth/csrf'));
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      expect(await count(database, 'SELECT count(*) FROM app.auth_session')).toBe(60);
      expect((await bootstrapCsrf(handlers, first.cookie)).csrfToken).toBe(first.csrfToken);
    });
  });

  it('TC20 lets the victim sign in from source A while source B is blocked, and alerts at 20 username failures', async () => {
    await harness.run(async database => {
      const clock = new TestClock(Date.now());
      const b = authHandlers(database, { source: '203.0.113.99', clock: clock.now });
      for (let i = 0; i < 5; i++) expect((await attempt(b, wrong(database))).status).toBe(401);
      expect((await attempt(b, database.loginInput('seller.a'))).status).toBe(429);
      const a = authHandlers(database, { source: '203.0.113.1', clock: clock.now });
      expect((await attempt(a, database.loginInput('seller.a'))).status).toBe(200);
      for (let i = 0; i < 15; i++) {
        const other = authHandlers(database, { source: `203.0.114.${i + 1}`, clock: clock.now });
        expect((await attempt(other, wrong(database))).status).toBe(401);
      }
      const alerts = (await sql(database, "SELECT details FROM app.audit_event WHERE event_type='LOGIN_THROTTLED' AND details->>'scope'='username'")).rows;
      expect(alerts).toHaveLength(1);
      const later = authHandlers(database, { source: '203.0.115.1', clock: clock.now });
      expect((await attempt(later, database.loginInput('seller.a'))).status).toBe(200);
    });
  });

  it('TC22 lets a must-change account use only the allowlisted account endpoints', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'must.change', { handlers });
      expect(session.principal.mustChangePassword).toBe(true);
      const me = await handlers.me(session.request('/auth/me'));
      expect(me.status).toBe(200);
      const service = createPrincipalUow(database.pool(), settings);
      await expect(service(session.request('/parcels'), {}, async () => true)).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      expect((await handlers.logout(session.request('/auth/logout', { method: 'POST' }))).status).toBe(204);
    });
  });
});
