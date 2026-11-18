import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';

type AccountName = keyof IsolatedDatabase['accounts'];

const draft = fs.readFileSync('db/drafts/account_functions.sql', 'utf8');
const hash = '$argon2id$v=19$m=19456,t=2,p=1$' + 'c2FsdHNhbHQ$' + 'x'.repeat(43);
const otherHash = '$argon2id$v=19$m=19456,t=2,p=1$' + 'c2FsdHNhbHQ$' + 'y'.repeat(43);

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

/** The draft is applied exactly as a revision would be: one transaction as the migration owner. */
async function applyDraft(database: IsolatedDatabase) {
  const client = await database.migrationClient();
  await client.query('BEGIN');
  try { await client.query(draft); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  return client;
}
async function owner(database: IsolatedDatabase, text: string, values: unknown[] = []) {
  return (await database.migrationClient()).query(text, values);
}
type Actor = { name: AccountName; version?: number } | null;
/** Runs `work` as the restricted runtime role with the same transaction-local context a protected request has. */
async function runtime<T>(database: IsolatedDatabase, actor: Actor, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.session_version',$2,true)", [actor ? database.accounts[actor.name] : '', actor ? String(actor.version ?? 1) : '']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
// seller, rider and admin have forced row security with a policy for auth_fn_owner only, so read them as that role.
async function members(database: IsolatedDatabase, table: 'seller' | 'rider' | 'admin', userId: string) {
  const client = await database.migrationClient();
  await client.query('SET ROLE auth_fn_owner');
  try { return Number((await client.query(`SELECT count(*) FROM app.${table} WHERE user_id=$1`, [userId])).rows[0].count); } finally { await client.query('RESET ROLE'); }
}
const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'error');
const register = (client: PoolClient, username: string, role: string, password = hash) =>
  client.query('SELECT * FROM app.register_account($1,$2,$3,$4,$5)', [username, username, password, role, randomUUID()]);
const session = (database: IsolatedDatabase, name: AccountName) =>
  owner(database, `INSERT INTO app.auth_session(token_digest,user_id,user_session_version,csrf_token,expires_at,absolute_expires_at)
    SELECT repeat(substr(md5(random()::text),1,1),64),id,session_version,'c',now()+interval '30 minutes',now()+interval '8 hours' FROM app.app_user WHERE username=$1`, [name]);
const state = async (database: IsolatedDatabase, name: string) =>
  (await owner(database, 'SELECT id,is_active,must_change_password,session_version,version,password_hash,credential_expires_at,(SELECT count(*) FROM app.auth_session s WHERE s.user_id=u.id) AS sessions FROM app.app_user u WHERE username=$1', [name])).rows[0];
const audit = async (database: IsolatedDatabase, type: string) =>
  (await owner(database, 'SELECT actor_id,target_user_id,outcome,details::text AS details FROM app.audit_event WHERE event_type=$1 ORDER BY id', [type])).rows;

describe('account_functions draft', () => {
  it('applies as one migration-owner transaction and keeps the hash unreadable by the runtime role', async () => {
    await harness.run(async database => {
      await applyDraft(database);
      await expect(runtime(database, null, client => client.query('SELECT password_hash FROM app.app_user'))).rejects.toMatchObject({ code: '42501' });
      await expect(runtime(database, null, client => client.query('SELECT credential_expires_at FROM app.app_user'))).rejects.toMatchObject({ code: '42501' });
      const snapshot = await runtime(database, null, client => client.query("SELECT * FROM app.get_login_snapshot('seller.a')"));
      expect(snapshot.rows[0]).toMatchObject({ is_active: true, must_change_password: false, credential_expired: false });
      await owner(database, "UPDATE app.app_user SET credential_expires_at=now()-interval '1 second' WHERE username='rider.a'");
      expect((await runtime(database, null, client => client.query("SELECT credential_expired FROM app.get_login_snapshot('rider.a')"))).rows[0].credential_expired).toBe(true);
    });
  });

  describe('register_account (A02, A08)', () => {
    it('creates a Seller with no actor, forces must_change false, adds the subclass row and audits USER_CREATED', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const created = (await runtime(database, null, client => register(client, 'new.seller', 'SELLER'))).rows[0];
        expect(created).toMatchObject({ username: 'new.seller', role: 'SELLER', is_active: true, must_change_password: false, version: 1 });
        expect(Object.keys(created)).not.toContain('password_hash');
        expect(await members(database, 'seller', created.id)).toBe(1);
        expect(await members(database, 'rider', created.id)).toBe(0);
        expect((await state(database, 'new.seller')).credential_expires_at).toBeNull();
        expect(await audit(database, 'USER_CREATED')).toEqual([{ actor_id: created.id, target_user_id: created.id, outcome: 'SUCCESS', details: '{"role": "SELLER"}' }]);
      });
    });

    it('lets only a verified Admin create a Rider, who must change an initial password that expires in 72 hours', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const created = (await runtime(database, { name: 'admin' }, client => register(client, 'new.rider', 'RIDER'))).rows[0];
        expect(created).toMatchObject({ role: 'RIDER', must_change_password: true });
        const row = (await owner(database, "SELECT credential_expires_at-now() BETWEEN interval '71 hours 59 minutes' AND interval '72 hours' AS window FROM app.app_user WHERE username='new.rider'")).rows[0];
        expect(row.window).toBe(true);
        expect(await members(database, 'rider', created.id)).toBe(1);
        expect(await members(database, 'seller', created.id)).toBe(0);
        expect((await audit(database, 'USER_CREATED'))[0]).toMatchObject({ actor_id: database.accounts.admin, target_user_id: created.id });
        for (const [actor, expected] of [[null, 'PT012'], [{ name: 'seller.a' }, 'PT001'], [{ name: 'rider.a' }, 'PT001'], [{ name: 'inactive' }, 'PT012'], [{ name: 'admin', version: 9 }, 'PT012']] as [Actor, string][]) {
          expect(await code(runtime(database, actor, client => register(client, 'blocked.rider', 'RIDER'))), String(actor?.name)).toBe(expected);
        }
        expect((await owner(database, "SELECT count(*) FROM app.app_user WHERE username='blocked.rider'")).rows[0].count).toBe('0');
      });
    });

    it('never creates an Admin or a Seller for a signed-in actor, whatever the caller passes', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        for (const role of ['ADMIN', 'admin', 'ROOT', '']) expect(await code(runtime(database, { name: 'admin' }, client => register(client, 'sneaky', role)))).toBe('PT007');
        expect(await code(runtime(database, { name: 'admin' }, client => register(client, 'sneaky', 'SELLER')))).toBe('PT001');
        expect(await code(runtime(database, { name: 'seller.a' }, client => register(client, 'sneaky', 'SELLER')))).toBe('PT001');
        expect((await owner(database, "SELECT count(*) FROM app.app_user WHERE username='sneaky'")).rows[0].count).toBe('0');
      });
    });

    it('answers a duplicate with USERNAME_TAKEN and lets exactly one of two simultaneous registrations win', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        expect(await code(runtime(database, null, client => register(client, 'seller.a', 'SELLER')))).toBe('PT011');
        const results = await Promise.all([
          code(runtime(database, null, client => register(client, 'race.winner', 'SELLER'))),
          code(runtime(database, null, client => register(client, 'race.winner', 'SELLER'))),
        ]);
        expect(results.sort()).toEqual(['PT011', 'ok']);
        expect((await owner(database, "SELECT count(*) FROM app.app_user WHERE username='race.winner'")).rows[0].count).toBe('1');
        expect((await audit(database, 'USER_CREATED')).length).toBe(1);
      });
    });
  });

  describe('change_password (A06)', () => {
    it('replaces the hash, clears must-change and expiry, bumps both versions and signs the user out everywhere', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        await owner(database, "UPDATE app.app_user SET credential_expires_at=now()+interval '1 hour' WHERE username='must.change'");
        const before = await state(database, 'must.change');
        await session(database, 'must.change');
        expect((await state(database, 'must.change')).sessions).toBe('1');
        await runtime(database, { name: 'must.change' }, client => client.query('SELECT app.change_password($1,$2,$3)', [before.password_hash, otherHash, randomUUID()]));
        const after = await state(database, 'must.change');
        expect(after).toMatchObject({ must_change_password: false, credential_expires_at: null, sessions: '0', password_hash: otherHash });
        expect(after.version).toBe(before.version + 1);
        expect(after.session_version).toBe(before.session_version + 1);
        expect(await audit(database, 'PASSWORD_CHANGED')).toEqual([{ actor_id: before.id, target_user_id: before.id, outcome: 'SUCCESS', details: '{}' }]);
        // The old session version no longer identifies the account.
        expect(await code(runtime(database, { name: 'must.change', version: before.session_version }, client => client.query('SELECT app.change_password($1,$2,$3)', [otherHash, hash, randomUUID()])))).toBe('PT012');
      });
    });

    it('changes nothing when the verified hash is out of date, and refuses anonymous callers', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const before = await state(database, 'seller.a');
        expect(await code(runtime(database, { name: 'seller.a' }, client => client.query('SELECT app.change_password($1,$2,$3)', [otherHash, hash, randomUUID()])))).toBe('PT003');
        expect(await code(runtime(database, null, client => client.query('SELECT app.change_password($1,$2,$3)', [before.password_hash, hash, randomUUID()])))).toBe('PT012');
        expect(await state(database, 'seller.a')).toEqual(before);
        expect(await audit(database, 'PASSWORD_CHANGED')).toEqual([]);
      });
    });
  });

  describe('set_user_active (A09)', () => {
    it('disables a Rider immediately: sessions deleted, versions bumped, audited, and reactivation revives nothing', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const before = await state(database, 'rider.a');
        await session(database, 'rider.a');
        const disabled = (await runtime(database, { name: 'admin' }, client => client.query('SELECT * FROM app.set_user_active($1,false,$2,$3)', [before.id, before.version, randomUUID()]))).rows[0];
        expect(disabled).toMatchObject({ is_active: false, version: before.version + 1 });
        expect(await state(database, 'rider.a')).toMatchObject({ is_active: false, sessions: '0', session_version: before.session_version + 1 });
        const reactivated = (await runtime(database, { name: 'admin' }, client => client.query('SELECT * FROM app.set_user_active($1,true,$2,$3)', [before.id, disabled.version, randomUUID()]))).rows[0];
        expect(reactivated).toMatchObject({ is_active: true, version: before.version + 2 });
        expect(await state(database, 'rider.a')).toMatchObject({ sessions: '0', session_version: before.session_version + 2 });
        expect((await audit(database, 'USER_STATUS_CHANGED')).map(row => row.details)).toEqual(['{"isActive": false}', '{"isActive": true}']);
      });
    });

    it('rejects a stale or missing version, Admin and self targets, a missing target and non-Admin actors, changing nothing', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const rider = await state(database, 'rider.a');
        const call = (actor: Actor, target: string, version: number | null) => code(runtime(database, actor, client => client.query('SELECT * FROM app.set_user_active($1,false,$2,$3)', [target, version, randomUUID()])));
        expect(await call({ name: 'admin' }, rider.id, rider.version + 1)).toBe('PT003');
        expect(await call({ name: 'admin' }, rider.id, null)).toBe('PT003');
        expect(await call({ name: 'admin' }, database.accounts.admin, 1)).toBe('PT007');
        expect(await call({ name: 'admin' }, '999999', 1)).toBe('PT002');
        expect(await call({ name: 'seller.a' }, rider.id, rider.version)).toBe('PT001');
        expect(await call({ name: 'rider.b' }, rider.id, rider.version)).toBe('PT001');
        expect(await call(null, rider.id, rider.version)).toBe('PT012');
        // A must-change Rider fails the role check before the must-change gate.
        expect(await call({ name: 'must.change' }, rider.id, rider.version)).toBe('PT001');
        expect(await state(database, 'rider.a')).toEqual(rider);
        expect(await audit(database, 'USER_STATUS_CHANGED')).toEqual([]);
      });
    });

    it('lets one of two simultaneous requests with the same expected version win and writes one audit event', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const rider = await state(database, 'rider.b');
        const disable = () => code(runtime(database, { name: 'admin' }, client => client.query('SELECT * FROM app.set_user_active($1,false,$2,$3)', [rider.id, rider.version, randomUUID()])));
        expect((await Promise.all([disable(), disable()])).sort()).toEqual(['PT003', 'ok']);
        expect((await audit(database, 'USER_STATUS_CHANGED')).length).toBe(1);
      });
    });
  });

  describe('admin_reset_password (A21)', () => {
    it('sets a one-time credential that must be changed, expires and signs the target out', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const before = await state(database, 'seller.b');
        await session(database, 'seller.b');
        await runtime(database, { name: 'admin' }, client => client.query('SELECT app.admin_reset_password($1,$2,$3)', [before.id, otherHash, randomUUID()]));
        const after = await state(database, 'seller.b');
        expect(after).toMatchObject({ password_hash: otherHash, must_change_password: true, sessions: '0', session_version: before.session_version + 1, version: before.version + 1 });
        expect((await owner(database, "SELECT credential_expires_at-now() BETWEEN interval '71 hours 59 minutes' AND interval '72 hours' AS window FROM app.app_user WHERE username='seller.b'")).rows[0].window).toBe(true);
        expect((await audit(database, 'PASSWORD_RESET'))[0]).toMatchObject({ actor_id: database.accounts.admin, target_user_id: before.id, details: '{}' });
      });
    });

    it('refuses Admin and self targets and non-Admin actors', async () => {
      await harness.run(async database => {
        await applyDraft(database);
        const call = (actor: Actor, target: string) => code(runtime(database, actor, client => client.query('SELECT app.admin_reset_password($1,$2,$3)', [target, otherHash, randomUUID()])));
        expect(await call({ name: 'admin' }, database.accounts.admin)).toBe('PT007');
        expect(await call({ name: 'seller.a' }, database.accounts['seller.b'])).toBe('PT001');
        expect(await call(null, database.accounts['seller.b'])).toBe('PT012');
        expect(await call({ name: 'admin' }, '999999')).toBe('PT002');
        expect(await audit(database, 'PASSWORD_RESET')).toEqual([]);
      });
    });
  });

  it('keeps the runtime role unable to write account rows or call a function it was not granted', async () => {
    await harness.run(async database => {
      await applyDraft(database);
      await expect(runtime(database, null, client => client.query("UPDATE app.app_user SET role='ADMIN'"))).rejects.toMatchObject({ code: '42501' });
      await expect(runtime(database, null, client => client.query('DELETE FROM app.audit_event'))).rejects.toMatchObject({ code: '42501' });
      const privileges = await owner(database, `SELECT p.proname,has_function_privilege('public',p.oid,'EXECUTE') AS public_exec,has_function_privilege('app_runtime',p.oid,'EXECUTE') AS runtime_exec,
        has_function_privilege('tracking_runtime',p.oid,'EXECUTE') AS tracking_exec, pg_get_userbyid(p.proowner) AS owner
        FROM pg_proc p WHERE p.proname IN ('register_account','change_password','set_user_active','admin_reset_password','get_login_snapshot') ORDER BY 1`);
      expect(privileges.rows).toHaveLength(5);
      for (const row of privileges.rows) expect(row, row.proname).toMatchObject({ public_exec: false, runtime_exec: true, tracking_exec: false, owner: 'auth_fn_owner' });
    });
  });
});
