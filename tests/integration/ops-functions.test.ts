import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { createPrincipalUow } from '@/server/core/authorized';
import { PasswordService } from '@/server/modules/auth/password';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { describeFailure, maintenanceState, provisionAdmin, setMaintenance } from '../../scripts/ops-commands';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, cookieFrom, loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const PASSWORD = 'first-admin-secret-1';
const hasher = new PasswordService(2);

/** Signs in to the per-case database as ops_runtime, the role of the private command line. */
async function ops(database: IsolatedDatabase) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.username = 'ops_runtime';
  url.password = encodeURIComponent(process.env.DB_PASSWORD_OPS_RUNTIME!);
  url.pathname = '/' + database.name;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  expect((await client.query('SELECT current_user')).rows[0].current_user).toBe('ops_runtime');
  return client;
}
async function withOps<T>(database: IsolatedDatabase, work: (client: Client) => Promise<T>) {
  const client = await ops(database);
  try { return await work(client); } finally { await client.end(); }
}
const owner = async (database: IsolatedDatabase, text: string, values: unknown[] = []) => (await (await database.migrationClient()).query(text, values)).rows;
const adminHandlers = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' }));
const signIn = async (database: IsolatedDatabase, username: string, password: string) => {
  const handlers = authHandlers(database);
  return handlers.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(handlers)), body: JSON.stringify({ username, password }) }));
};

describe('M1-PH3-T04 provision-admin (0012_ops_functions)', () => {
  it('creates a named Admin who must change the first password, and audits it without the password', async () => {
    await harness.run(async database => {
      const result = await withOps(database, client => provisionAdmin(client, { username: 'staff.one', displayName: 'Staff One', password: PASSWORD }, hasher));
      expect(result).toEqual({ created: true });
      const [row] = await owner(database, "SELECT id, role, is_active, must_change_password, credential_expires_at, password_hash, display_name FROM app.app_user WHERE username = 'staff.one'");
      expect(row).toMatchObject({ role: 'ADMIN', is_active: true, must_change_password: true, credential_expires_at: null, display_name: 'Staff One' });
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
      const [event] = await owner(database, "SELECT actor_id, target_user_id, outcome, details FROM app.audit_event WHERE event_type = 'USER_CREATED' AND target_user_id = $1", [row.id]);
      expect(event).toMatchObject({ actor_id: null, target_user_id: row.id, outcome: 'SUCCESS', details: { role: 'ADMIN' } });
      expect(JSON.stringify(await owner(database, 'SELECT details FROM app.audit_event'))).not.toContain(PASSWORD);
    });
  });

  it('signs in as an Admin held on the password change, then works normally after changing it', async () => {
    await harness.run(async database => {
      await withOps(database, client => provisionAdmin(client, { username: 'staff.one', displayName: 'Staff One', password: PASSWORD }, hasher));
      const handlers = authHandlers(database);
      const login = await signIn(database, 'staff.one', PASSWORD);
      expect(login.status).toBe(200);
      expect(await login.json()).toMatchObject({ role: 'ADMIN', mustChangePassword: true });

      const flagged = await handlers.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(handlers)), body: JSON.stringify({ username: 'staff.one', password: PASSWORD }) }));
      const session = { cookie: cookieFrom(flagged)!, csrfToken: (await flagged.json()).csrfToken as string };
      const blocked = await adminHandlers(database).list(apiRequest('/admin/users', session));
      expect([blocked.status, (await blocked.json()).error.code]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
      const changed = await handlers.changePassword(apiRequest('/auth/password', { method: 'POST', ...session, body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'second-admin-secret-2' }) }));
      expect(changed.status).toBe(204);

      const again = await signIn(database, 'staff.one', 'second-admin-secret-2');
      const second = { cookie: cookieFrom(again)!, csrfToken: (await again.json()).csrfToken as string };
      expect((await adminHandlers(database).list(apiRequest('/admin/users', second))).status).toBe(200);
    });
  });

  it('changes nothing when run again for an existing Admin, even with another password or name', async () => {
    await harness.run(async database => {
      await withOps(database, client => provisionAdmin(client, { username: 'staff.one', displayName: 'Staff One', password: PASSWORD }, hasher));
      const before = await owner(database, "SELECT id, password_hash, display_name, version FROM app.app_user WHERE username = 'staff.one'");
      const events = await owner(database, "SELECT count(*) AS n FROM app.audit_event WHERE event_type = 'USER_CREATED'");
      const rerun = await withOps(database, client => provisionAdmin(client, { username: 'staff.one', displayName: 'Someone Else', password: 'another-secret-value-9' }, hasher));
      expect(rerun).toEqual({ created: false });
      expect(await owner(database, "SELECT id, password_hash, display_name, version FROM app.app_user WHERE username = 'staff.one'")).toEqual(before);
      expect(await owner(database, "SELECT count(*) AS n FROM app.audit_event WHERE event_type = 'USER_CREATED'")).toEqual(events);
      expect((await signIn(database, 'staff.one', PASSWORD)).status).toBe(200);
      expect((await signIn(database, 'staff.one', 'another-secret-value-9')).status).toBe(401);
    });
  });

  it('supports the two Admins of the case study and refuses to convert a Seller or Rider', async () => {
    await harness.run(async database => {
      await withOps(database, async client => {
        expect(await provisionAdmin(client, { username: 'staff.one', displayName: 'Staff One', password: PASSWORD }, hasher)).toEqual({ created: true });
        expect(await provisionAdmin(client, { username: 'staff.two', displayName: 'Staff Two', password: 'second-staff-secret-2' }, hasher)).toEqual({ created: true });
        const before = await owner(database, "SELECT role, password_hash FROM app.app_user WHERE username IN ('seller.a', 'rider.a') ORDER BY username");
        for (const username of ['seller.a', 'rider.a']) {
          const error = await provisionAdmin(client, { username, displayName: 'Takeover', password: 'takeover-secret-123' }, hasher).catch(failure => failure);
          expect(error).toMatchObject({ code: 'PT007' });
          expect(describeFailure(error)).toBe('That username already belongs to a Seller or Rider. Admin accounts are never converted.');
        }
        expect(await owner(database, "SELECT role, password_hash FROM app.app_user WHERE username IN ('seller.a', 'rider.a') ORDER BY username")).toEqual(before);
      });
      expect(await owner(database, "SELECT count(*)::int AS n FROM app.app_user WHERE role = 'ADMIN' AND username LIKE 'staff.%'")).toEqual([{ n: 2 }]);
    });
  });

  it('rejects bad details before any database call', async () => {
    const client = { query: vi.fn() };
    for (const input of [
      { username: 'AB', displayName: 'Staff', password: PASSWORD }, { username: 'a b c', displayName: 'Staff', password: PASSWORD },
      { username: 'staff.one', displayName: '', password: PASSWORD }, { username: 'staff.one', displayName: 'x'.repeat(81), password: PASSWORD },
      { username: 'staff.one', displayName: 'Staff', password: 'short' },
    ]) {
      const result = await provisionAdmin(client as never, input as never, hasher);
      expect(result, JSON.stringify(input)).toHaveProperty('error');
    }
    expect(client.query).not.toHaveBeenCalled();
  });

  it('refuses a malformed hash or details at the database even for ops_runtime', async () => {
    await harness.run(async database => {
      await withOps(database, async client => {
        for (const args of [['ok.name', 'Name', 'plain-text-secret'], ['BAD NAME', 'Name', '$argon2id$x'], ['ok.name', '   ', '$argon2id$x']]) {
          await expect(client.query('SELECT * FROM app.provision_admin($1, $2, $3, gen_random_uuid())', args)).rejects.toMatchObject({ code: '22023' });
        }
      });
      expect(await owner(database, "SELECT count(*)::int AS n FROM app.app_user WHERE username = 'ok.name'")).toEqual([{ n: 0 }]);
    });
  });

  it('keeps the commands to ops_runtime: the web role and the other private roles cannot call them, and ops_runtime reads no account data', async () => {
    await harness.run(async database => {
      const privileges = await owner(database, `SELECT p.proname, pg_get_userbyid(p.proowner) AS owner,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec, has_function_privilege('app_runtime', p.oid, 'EXECUTE') AS app,
        has_function_privilege('tracking_runtime', p.oid, 'EXECUTE') AS tracking, has_function_privilege('maintenance_runtime', p.oid, 'EXECUTE') AS maintenance,
        has_function_privilege('ops_runtime', p.oid, 'EXECUTE') AS ops
        FROM pg_proc p WHERE p.proname IN ('provision_admin', 'set_maintenance_mode', 'get_maintenance_state') ORDER BY 1`);
      expect(privileges).toHaveLength(3);
      for (const row of privileges) expect(row, row.proname).toMatchObject({ owner: 'ops_fn_owner', public_exec: false, app: false, tracking: false, maintenance: false, ops: true });
      await withOps(database, async client => {
        await expect(client.query('SELECT * FROM app.app_user')).rejects.toMatchObject({ code: '42501' });
        await expect(client.query('SELECT * FROM app.audit_event')).rejects.toMatchObject({ code: '42501' });
        await expect(client.query("UPDATE app.system_state SET maintenance_mode = true")).rejects.toMatchObject({ code: '42501' });
      });
    });
  });
});

describe('M1-PH3-T10 maintenance mode switch (0012_ops_functions)', () => {
  it('blocks business writes with 503 MAINTENANCE while reads, sign-in and sign-out continue, and lifts when switched off', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers });
      const target = database.accounts['seller.b'];
      const disable = () => adminHandlers(database).updateStatus(
        admin.request(`/admin/users/${target}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }) }), { params: Promise.resolve({ userId: target }) });

      const state = await withOps(database, client => setMaintenance(client, 30));
      expect(state).toMatchObject({ enabled: true, active: true });
      const blocked = await disable();
      expect([blocked.status, (await blocked.json()).error.code]).toEqual([503, 'MAINTENANCE']);
      expect((await adminHandlers(database).list(admin.request('/admin/users'))).status).toBe(200);
      expect((await handlers.me(admin.request('/auth/me'))).status).toBe(200);
      expect((await signIn(database, 'seller.a', database.loginInput('seller.a').password)).status).toBe(200);
      expect((await handlers.logout(admin.request('/auth/logout', { method: 'POST' }))).status).toBe(204);
      expect((await owner(database, "SELECT is_active FROM app.app_user WHERE username = 'seller.b'"))[0].is_active).toBe(true);

      const fresh = await loginAs(database, 'ADMIN', { handlers });
      const off = await withOps(database, client => setMaintenance(client, null));
      expect(off).toMatchObject({ enabled: false, until: null, active: false });
      const allowed = await adminHandlers(database).updateStatus(
        fresh.request(`/admin/users/${target}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }) }), { params: Promise.resolve({ userId: target }) });
      expect(allowed.status).toBe(200);
    });
  });

  it('lifts on its own when the expiry passes, even if nobody switches it off', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers });
      await withOps(database, client => setMaintenance(client, 30));
      await owner(database, "UPDATE app.system_state SET set_until = now() - interval '1 second' WHERE id = 1");
      const target = database.accounts['seller.b'];
      const response = await adminHandlers(database).updateStatus(
        admin.request(`/admin/users/${target}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }) }), { params: Promise.resolve({ userId: target }) });
      expect(response.status).toBe(200);
      expect(await withOps(database, client => maintenanceState(client))).toMatchObject({ enabled: true, active: false });
    });
  });

  it('refuses an expiry in the past, missing, or beyond 24 hours, and bad minutes before any call', async () => {
    await harness.run(async database => {
      await withOps(database, async client => {
        for (const args of [[true, null], [true, new Date(Date.now() - 1000)], [true, new Date(Date.now() + 25 * 3600_000)]] as unknown[][]) {
          await expect(client.query('SELECT app.set_maintenance_mode($1, $2)', args)).rejects.toMatchObject({ code: '22023' });
        }
        expect(await maintenanceState(client)).toMatchObject({ enabled: false, active: false });
      });
    });
    const client = { query: vi.fn() };
    for (const minutes of [0, -5, 1441, 2.5, Number.NaN]) expect(await setMaintenance(client as never, minutes), String(minutes)).toHaveProperty('error');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('has no public maintenance endpoint', async () => {
    const { implementedEndpoints } = await import('../../scripts/contract-inventory');
    expect(implementedEndpoints().filter(endpoint => /maint|ops|provision/i.test(endpoint.path))).toEqual([]);
  });
});
