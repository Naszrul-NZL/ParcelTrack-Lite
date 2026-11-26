import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const handlers = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));
type Item = { id: string; username: string; isActive: boolean; role: string; mustChangePassword: boolean; version: number };
const usernames = (items: Item[]) => items.map(item => item.username);
const SUMMARY_FIELDS = ['displayName', 'id', 'isActive', 'mustChangePassword', 'role', 'username', 'version'];

/** The account directory in the order the contract promises: newest first, id as the tie-breaker. */
async function expectedOrder(database: IsolatedDatabase, where = 'true') {
  const owner = await database.migrationClient();
  return (await owner.query<{ username: string }>(`SELECT username FROM app.app_user WHERE ${where} ORDER BY created_at DESC, id DESC`)).rows.map(row => row.username);
}

describe('M1-PH3-T01 A07 GET /admin/users', () => {
  it('TC12 returns exactly the UserSummary fields, never a secret, newest first with a stable tie-break', async () => {
    await harness.run(async database => {
      const owner = await database.migrationClient();
      // Distinct creation times for some accounts; the rest tie and fall back to the id.
      await owner.query("UPDATE app.app_user SET created_at = now() + interval '1 day' WHERE username = 'seller.b'");
      await owner.query("UPDATE app.app_user SET created_at = now() - interval '1 day' WHERE username = 'rider.a'");
      const admin = await loginAs(database, 'ADMIN');
      const response = await handlers(database).list(admin.request('/admin/users'));
      expect(response.status).toBe(200);
      const text = await response.text();
      // mustChangePassword is a real summary field; what must never appear is a hash, a version used for sessions or a token.
      expect(text).not.toMatch(/argon2|password_?hash|session_?version|csrf|token|digest/i);
      const body = JSON.parse(text) as { items: Item[]; total: number; page: number; pageSize: number };
      expect(body).toMatchObject({ total: 7, page: 1, pageSize: 20 });
      for (const item of body.items) expect(Object.keys(item).sort()).toEqual(SUMMARY_FIELDS);
      expect(usernames(body.items)).toEqual(await expectedOrder(database));
      expect(body.items[0].username).toBe('seller.b');
      expect(body.items.at(-1)!.username).toBe('rider.a');
      expect(body.items.find(item => item.username === 'must.change')).toMatchObject({ role: 'RIDER', mustChangePassword: true, isActive: true, version: 1 });
      expect(body.items.find(item => item.username === 'inactive')).toMatchObject({ isActive: false });
    });
  });

  it('filters by role and active state, and the Rider picker query returns active Riders only', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const { list } = handlers(database);
      const query = async (search: string) => (await (await list(admin.request('/admin/users' + search))).json()) as { items: Item[]; total: number };
      expect(usernames((await query('?role=RIDER')).items).sort()).toEqual(['inactive', 'must.change', 'rider.a', 'rider.b']);
      const picker = await query('?role=RIDER&isActive=true');
      expect(usernames(picker.items).sort()).toEqual(['must.change', 'rider.a', 'rider.b']);
      expect(picker.total).toBe(3);
      expect(usernames((await query('?isActive=false')).items)).toEqual(['inactive']);
      expect(usernames((await query('?role=ADMIN')).items)).toEqual(['admin']);
      expect(await query('?role=SELLER&isActive=false')).toMatchObject({ items: [], total: 0 });
    });
  });

  it('pages without gaps or overlap, caps oversized pages at 100 and returns an empty page past the end', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const { list } = handlers(database);
      const page = async (search: string) => (await (await list(admin.request('/admin/users' + search))).json()) as { items: Item[]; total: number; page: number; pageSize: number };
      const pages = [await page('?pageSize=3'), await page('?pageSize=3&page=2'), await page('?pageSize=3&page=3')];
      expect(pages.map(result => result.items.length)).toEqual([3, 3, 1]);
      expect(pages.every(result => result.total === 7)).toBe(true);
      expect(pages.flatMap(result => usernames(result.items))).toEqual(await expectedOrder(database));
      expect(await page('?pageSize=500')).toMatchObject({ pageSize: 100, total: 7 });
      expect(await page('?page=2&pageSize=100')).toMatchObject({ items: [], page: 2, total: 7 });
    });
  });

  it('rejects unknown filters, bad values, repeated keys and injection text without touching the data', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const { list } = handlers(database);
      const bad = ['?role=ROOT', '?role=rider', '?isActive=yes', '?isActive=1', '?page=0', '?page=abc', '?pageSize=0', '?sort=password', '?password_hash=x',
        '?role=RIDER&role=SELLER', '?isActive=true&isActive=false', "?role=RIDER'%20OR%20'1'='1", '?role=%27%3B%20DROP%20TABLE%20app.app_user%3B--'];
      for (const search of bad) {
        const response = await list(admin.request('/admin/users' + search));
        expect(response.status, search).toBe(422);
        const body = await response.json();
        expect(body.error.code, search).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(body), search).not.toMatch(/select|syntax|app_user|DROP/i);
      }
      const owner = await database.migrationClient();
      expect((await owner.query('SELECT count(*) FROM app.app_user')).rows[0].count).toBe('7');
      expect((await list(admin.request('/admin/users'))).status).toBe(200);
    });
  });

  it('TC09 is Admin only: anonymous, Sellers, Riders, a must-change Rider and an inactive session are refused', async () => {
    await harness.run(async database => {
      const { list } = handlers(database);
      expect((await list(new Request(origin() + '/api/v1/admin/users'))).status).toBe(401);
      for (const who of ['seller.a', 'seller.b', 'rider.a', 'rider.b', 'must.change'] as const) {
        const session = await loginAs(database, who);
        const response = await list(session.request('/admin/users'));
        expect(response.status, who).toBe(403);
        expect(JSON.stringify(await response.json()), who).not.toContain('seller.a');
      }
      const stale = await database.session('inactive');
      expect((await list(new Request(origin() + '/api/v1/admin/users', { headers: { cookie: stale.cookie } }))).status).toBe(401);
    });
  });

  it('reflects an account change on the next request and ends for an Admin whose session was revoked', async () => {
    await harness.run(async database => {
      const admin = await loginAs(database, 'ADMIN');
      const { list } = handlers(database);
      const owner = await database.migrationClient();
      await owner.query('SET ROLE auth_fn_owner');
      await owner.query("UPDATE app.app_user SET is_active = false, version = version + 1 WHERE username = 'rider.b'");
      await owner.query('RESET ROLE');
      const picker = await (await list(admin.request('/admin/users?role=RIDER&isActive=true'))).json() as { items: Item[] };
      expect(usernames(picker.items)).not.toContain('rider.b');
      await owner.query('DELETE FROM app.auth_session');
      expect((await list(admin.request('/admin/users'))).status).toBe(401);
    });
  });
});
