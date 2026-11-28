import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, cookieFrom, loginAs, type AuthHandlers } from '../harness/login-as';
import { implementedEndpoints } from '../../scripts/contract-inventory';
import { IDENTITIES, assertRowsCoverEndpoints, type Actor, type Identity, type MatrixRow } from './authz_matrix/matrix';
import { authRows } from './authz_matrix/auth.rows';
import { adminRows } from './authz_matrix/admin.rows';
import { deliveryAdminRows } from './authz_matrix/delivery-admin.rows';
import { parcelRows } from './authz_matrix/parcel.rows';
import { riderRows } from './authz_matrix/rider.rows';

// M1-PH3-T05 / TC08: the must-change-password gate, proven for every protected endpoint with an account of the role that
// endpoint is meant for. The authorization matrix cannot show this by itself: its `must.change` identity is a Rider, so on
// most rows it is refused for its role before the gate is reached.

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const rows: MatrixRow[] = [...authRows, ...parcelRows, ...adminRows, ...deliveryAdminRows, ...riderRows];
// The documented allow-list for a must-change session is A01, A04, A05 and A06. A02 and A03 run before an account is
// signed in, A13 is public tracking and HEALTH is the liveness probe: none of them depends on the session's password state.
const ALLOWED = new Set(['HEALTH', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A13']);
const gated = rows.filter(row => !ALLOWED.has(row.endpoint));
const SIGNED_IN = IDENTITIES.filter(identity => !['anonymous', 'inactive', 'must.change'].includes(identity));
const owner = async (database: IsolatedDatabase, text: string, values: unknown[] = []) => (await (await database.migrationClient()).query(text, values)).rows;
const auditCount = async (database: IsolatedDatabase) => Number((await owner(database, 'SELECT count(*) AS n FROM app.audit_event'))[0].n);
const setMustChange = (database: IsolatedDatabase, identity: Identity, value: boolean) =>
  owner(database, 'UPDATE app.app_user SET must_change_password = $2 WHERE id = $1', [database.accounts[identity as keyof typeof database.accounts], value]);

async function actorFor(database: IsolatedDatabase, handlers: AuthHandlers, identity: Identity): Promise<Actor> {
  const session = await loginAs(database, identity as never, { handlers });
  return { identity, cookie: session.cookie, csrfToken: session.csrfToken, credentials: database.loginInput(identity as never), request: session.request };
}

describe('M1-PH3-TC08 the gate covers every implemented endpoint', () => {
  it('has a row for every implemented endpoint, and a gated row for every endpoint outside the allow-list', () => {
    assertRowsCoverEndpoints(implementedEndpoints(), rows);
    const implemented = new Set(implementedEndpoints().map(endpoint => endpoint.id));
    expect(new Set(gated.map(row => row.endpoint))).toEqual(new Set([...implemented].filter(id => !ALLOWED.has(id))));
  });

  for (const row of gated) {
    const identity = SIGNED_IN.find(candidate => row.expected[candidate] >= 200 && row.expected[candidate] < 300);
    it(`${row.endpoint} ${row.label}: refused with PASSWORD_CHANGE_REQUIRED for a must-change ${identity ?? '?'}, and unchanged`, async () => {
      expect(identity, 'a row needs one signed-in identity that succeeds').toBeDefined();
      await harness.run(async database => {
        const handlers = authHandlers(database);
        const actor = await actorFor(database, handlers, identity!);
        // The session was issued while the password was fine; the flag is raised afterwards, as an Admin reset would.
        await setMustChange(database, identity!, true);
        const before = await auditCount(database);
        const blocked = await row.call(actor, handlers, database);
        expect([blocked.status, (await blocked.json()).error?.code], 'direct call while the password must change').toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
        expect(await auditCount(database), 'a refused call writes no audit event').toBe(before);

        // Control: the same call, same session, succeeds once the flag is cleared, so the refusal was the gate.
        await setMustChange(database, identity!, false);
        const allowed = await row.call(actor, handlers, database);
        expect(allowed.status, 'after the password is no longer flagged').toBe(row.expected[identity!]);
      });
    });
  }
});

describe('M1-PH3-TC08 the allow-list and the exceptions', () => {
  it('lets a must-change session read who it is, fetch a CSRF token and change its password, and nothing else', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'must.change', { handlers });
      expect(session.principal.mustChangePassword).toBe(true);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(200);
      expect((await handlers.csrf(session.request('/auth/csrf'))).status).toBe(200);
      expect((await handlers.changePassword(session.request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: database.loginInput('must.change').password, newPassword: 'a-brand-new-secret-1' }) }))).status).toBe(204);
    });
  });

  it('lets a must-change session sign out (A04)', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const session = await loginAs(database, 'must.change', { handlers });
      expect((await handlers.logout(session.request('/auth/logout', { method: 'POST' }))).status).toBe(204);
      expect((await handlers.me(session.request('/auth/me'))).status).toBe(401);
    });
  });

  it('unlocks the gate end to end: blocked, change the password, sign in again, allowed', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      await setMustChange(database, 'seller.a', true);
      const flagged = await loginAs(database, 'seller.a', { handlers });
      expect(flagged.principal.mustChangePassword).toBe(true);
      const parcelRow = rows.find(row => row.endpoint === 'A11')!;
      const actor = { identity: 'seller.a' as const, cookie: flagged.cookie, csrfToken: flagged.csrfToken, credentials: database.loginInput('seller.a'), request: flagged.request };
      const blocked = await parcelRow.call(actor, handlers, database);
      expect([blocked.status, (await blocked.json()).error.code]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);

      const changed = await handlers.changePassword(flagged.request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: database.loginInput('seller.a').password, newPassword: 'a-brand-new-secret-1' }) }));
      expect(changed.status).toBe(204);
      // The old session ended with the change; the new one comes from signing in with the new password.
      expect((await handlers.me(flagged.request('/auth/me'))).status).toBe(401);
      const anonymous = await bootstrapCsrf(handlers);
      const login = await handlers.login(apiRequest('/auth/login', { method: 'POST', ...anonymous, body: JSON.stringify({ username: 'seller.a', password: 'a-brand-new-secret-1' }) }));
      expect(login.status).toBe(200);
      const fresh = { ...actor, cookie: cookieFrom(login)!, csrfToken: (await login.json()).csrfToken as string };
      const next = await parcelRow.call({ ...fresh, request: (path, init) => apiRequest(path, { ...init, cookie: fresh.cookie, csrfToken: fresh.csrfToken }) }, handlers, database);
      expect(next.status).toBe(200);
    });
  });

  it('leaves public tracking (A13) unaffected by a must-change session and by no session', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const row = rows.find(candidate => candidate.endpoint === 'A13')!;
      const flagged = await actorFor(database, handlers, 'must.change');
      expect((await row.call(flagged, handlers, database)).status).toBe(200);
      const anonymous = await bootstrapCsrf(handlers);
      const visitor: Actor = { identity: 'anonymous', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, credentials: { username: 'nobody', password: 'nothing' }, request: (path, init) => apiRequest(path, { ...init, cookie: anonymous.cookie, csrfToken: anonymous.csrfToken }) };
      expect((await row.call(visitor, handlers, database)).status).toBe(200);
    });
  });

  it('also refuses a must-change Admin on every Admin endpoint, including the account endpoints it owns', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const admin = await actorFor(database, handlers, 'admin');
      await setMustChange(database, 'admin', true);
      for (const row of gated.filter(candidate => candidate.expected.admin >= 200 && candidate.expected.admin < 300)) {
        const response = await row.call(admin, handlers, database);
        expect([response.status, (await response.json()).error?.code], row.endpoint).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);
      }
    });
  });
});
