import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { createAccountJournal, readJournal } from '@/server/modules/auth/account-journal';
import { PasswordService } from '@/server/modules/auth/password';
import {
  lockAccount, lockAccountsFromList, parseUsernameList, purgeSessions, quarantineAfterRestore, reconcileAccounts, recoverAccount,
} from '../../scripts/ops-commands';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, loginAs } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

let directory: string;
let file: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptl-ops-')); file = path.join(directory, 'journal.ndjson'); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });

const hasher = new PasswordService(2);
const journal = () => createAccountJournal({ path: file });
const journaled = () => (fs.existsSync(file) ? readJournal(file).records.map(({ userId, event }) => ({ userId, event })) : []);

async function withOps<T>(database: IsolatedDatabase, work: (client: Client) => Promise<T>) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.username = 'ops_runtime';
  url.password = encodeURIComponent(process.env.DB_PASSWORD_OPS_RUNTIME!);
  url.pathname = '/' + database.name;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
const owner = async (database: IsolatedDatabase, text: string, values: unknown[] = []) => (await (await database.migrationClient()).query(text, values)).rows;
const row = async (database: IsolatedDatabase, username: string) => (await owner(database,
  `SELECT id, is_active, must_change_password, version, session_version, credential_expires_at, role,
     (SELECT count(*)::int FROM app.auth_session s WHERE s.user_id = u.id) AS sessions,
     (extract(epoch FROM credential_expires_at - now()) / 3600)::float8 AS hours
   FROM app.app_user u WHERE username = $1`, [username]))[0];
const events = (database: IsolatedDatabase, type: string) => owner(database, 'SELECT actor_id, target_user_id, details FROM app.audit_event WHERE event_type = $1 ORDER BY id', [type]);
const signIn = async (database: IsolatedDatabase, username: string, password: string) => {
  const handlers = authHandlers(database);
  return handlers.login(apiRequest('/auth/login', { method: 'POST', ...(await bootstrapCsrf(handlers)), body: JSON.stringify({ username, password }) }));
};

describe('M1-PH3-T04 lock-account and lock-accounts (0013_ops_account_commands)', () => {
  it('locks an account of any role, Admin included, ends its sessions at once, and is idempotent', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers });
      const before = await row(database, 'admin');
      const first = await withOps(database, client => lockAccount(client, 'admin', journal()));
      expect(first).toEqual({ found: true, changed: true });
      expect(await row(database, 'admin')).toMatchObject({ is_active: false, sessions: 0, version: before.version + 1, session_version: before.session_version + 1 });
      expect((await handlers.me(admin.request('/auth/me'))).status).toBe(401);
      expect((await signIn(database, 'admin', database.loginInput('admin').password)).status).toBe(401);
      expect(await events(database, 'ACCOUNT_LOCKED')).toEqual([{ actor_id: null, target_user_id: before.id, details: {} }]);
      expect(journaled()).toEqual([{ userId: before.id, event: 'ACCOUNT_LOCKED' }]);

      const again = await withOps(database, client => lockAccount(client, 'admin', journal()));
      expect(again).toEqual({ found: true, changed: false });
      expect((await row(database, 'admin')).version).toBe(before.version + 1);
      expect(await events(database, 'ACCOUNT_LOCKED')).toHaveLength(1);
      expect(journaled()).toHaveLength(1);
    });
  });

  it('reports an unknown username without changing anything', async () => {
    await harness.run(async database => {
      expect(await withOps(database, client => lockAccount(client, 'nobody.here', journal()))).toEqual({ found: false, changed: false });
      expect(await events(database, 'ACCOUNT_LOCKED')).toEqual([]);
      expect(journaled()).toEqual([]);
    });
  });

  it('locks a list, skipping comments and blanks, and reports the unknown and the already locked', async () => {
    expect(parseUsernameList('# staff who left\nrider.a\n\n  seller.b  \r\n#rider.b\nghost\n')).toEqual(['rider.a', 'seller.b', 'ghost']);
    await harness.run(async database => {
      await withOps(database, client => lockAccount(client, 'seller.b'));
      const result = await withOps(database, client => lockAccountsFromList(client, ['rider.a', 'seller.b', 'ghost'], journal()));
      expect(result).toEqual({ locked: 1, alreadyLocked: 1, notFound: ['ghost'] });
      expect((await row(database, 'rider.a')).is_active).toBe(false);
      expect(journaled()).toEqual([{ userId: (await row(database, 'rider.a')).id, event: 'ACCOUNT_LOCKED' }]);
    });
  });
});

describe('M1-PH3-T04 recover-account', () => {
  it('reactivates with a new password the account must change, ends sessions, and the old password stays dead', async () => {
    await harness.run(async database => {
      const old = database.loginInput('seller.a').password;
      await withOps(database, client => lockAccount(client, 'seller.a'));
      const result = await withOps(database, client => recoverAccount(client, { username: 'seller.a', password: 'recovered-secret-12' }, hasher, journal()));
      expect(result).toEqual({ recovered: true });
      const account = await row(database, 'seller.a');
      expect(account).toMatchObject({ is_active: true, must_change_password: true, sessions: 0 });
      expect(account.hours).toBeGreaterThan(71.9);
      expect((await signIn(database, 'seller.a', old)).status).toBe(401);
      const login = await signIn(database, 'seller.a', 'recovered-secret-12');
      expect([login.status, (await login.json()).mustChangePassword]).toEqual([200, true]);
      expect(await events(database, 'ACCOUNT_RECOVERED')).toEqual([{ actor_id: null, target_user_id: account.id, details: {} }]);
      expect(journaled().at(-1)).toEqual({ userId: account.id, event: 'ACCOUNT_RECOVERED' });
      expect(JSON.stringify(await owner(database, 'SELECT details FROM app.audit_event'))).not.toContain('recovered-secret-12');
    });
  });

  it('keeps a recovered Admin credential from expiring, and refuses a short password or unknown account before changing anything', async () => {
    await harness.run(async database => {
      await withOps(database, client => lockAccount(client, 'admin'));
      expect(await withOps(database, client => recoverAccount(client, { username: 'admin', password: 'recovered-admin-12' }, hasher))).toEqual({ recovered: true });
      expect(await row(database, 'admin')).toMatchObject({ is_active: true, must_change_password: true, credential_expires_at: null });

      const before = await row(database, 'rider.a');
      expect(await withOps(database, client => recoverAccount(client, { username: 'rider.a', password: 'short' }, hasher))).toHaveProperty('error');
      expect(await withOps(database, client => recoverAccount(client, { username: 'ghost', password: 'recovered-secret-12' }, hasher))).toEqual({ error: 'No account has that username.' });
      expect(await row(database, 'rider.a')).toEqual(before);
    });
  });
});

describe('M1-PH3-T04 purge-sessions', () => {
  it('ends one account\'s sessions, or every session, and audits the purge without secrets', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const seller = await loginAs(database, 'seller.a', { handlers });
      const rider = await loginAs(database, 'rider.a', { handlers });
      await bootstrapCsrf(handlers);

      expect(await withOps(database, client => purgeSessions(client, 'seller.a'))).toEqual({ removed: 1 });
      expect((await handlers.me(seller.request('/auth/me'))).status).toBe(401);
      expect((await handlers.me(rider.request('/auth/me'))).status).toBe(200);
      expect(await withOps(database, client => purgeSessions(client, 'ghost'))).toHaveProperty('error');

      const all = await withOps(database, client => purgeSessions(client, null));
      expect((all as { removed: number }).removed).toBeGreaterThanOrEqual(2);
      expect((await handlers.me(rider.request('/auth/me'))).status).toBe(401);
      expect((await owner(database, 'SELECT count(*)::int AS n FROM app.auth_session'))[0].n).toBe(0);
      expect((await events(database, 'SESSIONS_PURGED')).map(event => event.details)).toEqual([{ reason: 'account' }, { reason: 'all' }]);
    });
  });
});

describe('M1-PH3-T04 reconcile-accounts and quarantine-after-restore', () => {
  const write = (...lines: object[]) => fs.writeFileSync(file, lines.map(line => JSON.stringify(line)).join('\n') + '\n');

  it('re-disables accounts disabled since the backup, forces a change for stale passwords, and lists accounts that no longer exist', async () => {
    await harness.run(async database => {
      const [sellerA, sellerB, riderA, riderB] = await Promise.all(['seller.a', 'seller.b', 'rider.a', 'rider.b'].map(name => row(database, name)));
      write(
        { t: '2026-11-27T10:00:00.000Z', userId: sellerA.id, event: 'PASSWORD_CHANGED' },
        { t: '2026-11-27T10:05:00.000Z', userId: sellerB.id, event: 'USER_STATUS_CHANGED', isActive: false },
        { t: '2026-11-27T10:10:00.000Z', userId: riderA.id, event: 'USER_STATUS_CHANGED', isActive: false },
        { t: '2026-11-27T10:20:00.000Z', userId: riderA.id, event: 'USER_STATUS_CHANGED', isActive: true },
        { t: '2026-11-27T10:30:00.000Z', userId: riderB.id, event: 'PASSWORD_RESET' },
        { t: '2026-11-27T10:40:00.000Z', userId: '999999', event: 'USER_CREATED' },
        { t: '2026-11-26T10:00:00.000Z', userId: sellerA.id, event: 'USER_STATUS_CHANGED', isActive: false },
      );
      const reading = readJournal(file, new Date('2026-11-27T00:00:00.000Z'));
      const result = await withOps(database, client => reconcileAccounts(client, reading));
      expect(result).toEqual({ disabled: 1, passwordChangeForced: 2, accountsCreatedSinceBackup: ['999999'], reactivatedSinceBackup: [riderA.id], unreadableLines: 0, alreadyConsistent: 0 });
      expect(await row(database, 'seller.b')).toMatchObject({ is_active: false, sessions: 0 });
      expect(await row(database, 'seller.a')).toMatchObject({ is_active: true, must_change_password: true });
      expect(await row(database, 'rider.b')).toMatchObject({ must_change_password: true });
      // The event before the backup time is not replayed, and the reactivated Rider is left as the restore has it.
      expect((await row(database, 'rider.a')).must_change_password).toBe(false);

      const again = await withOps(database, client => reconcileAccounts(client, reading));
      expect(again).toMatchObject({ disabled: 0, alreadyConsistent: 1 });
    });
  });

  it('refuses a journal that is unavailable or has a gap, and points to quarantine', async () => {
    await harness.run(async database => {
      const before = await row(database, 'seller.b');
      for (const reading of [{ records: [], unreadable: 0, gap: true, unavailable: false }, { records: [], unreadable: 0, gap: true, unavailable: true }]) {
        const result = await withOps(database, client => reconcileAccounts(client, reading));
        expect(result).toEqual({ error: 'The account journal is unavailable or has a gap, so it cannot be trusted. Run quarantine-after-restore instead.' });
      }
      expect(await row(database, 'seller.b')).toEqual(before);
    });
  });

  it('quarantines: every Rider disabled, every account must change its password, every session ended', async () => {
    await harness.run(async database => {
      const handlers = authHandlers(database);
      const admin = await loginAs(database, 'ADMIN', { handlers });
      const result = await withOps(database, client => quarantineAfterRestore(client));
      expect(result.ridersDisabled).toBeGreaterThanOrEqual(2);
      expect(result.accountsFlagged).toBeGreaterThanOrEqual(6);
      expect(result.sessionsEnded).toBeGreaterThanOrEqual(1);
      expect((await handlers.me(admin.request('/auth/me'))).status).toBe(401);
      for (const name of ['rider.a', 'rider.b']) expect(await row(database, name)).toMatchObject({ is_active: false, must_change_password: true });
      for (const name of ['admin', 'seller.a', 'seller.b']) expect(await row(database, name)).toMatchObject({ is_active: true, must_change_password: true });
      expect((await signIn(database, 'seller.a', database.loginInput('seller.a').password)).status).toBe(200);
      expect((await events(database, 'SESSIONS_PURGED')).map(event => event.details)).toEqual([{ reason: 'quarantine' }]);
    });
  });
});

describe('M1-PH3-T04 the incident commands stay private', () => {
  it('are owned by ops_fn_owner and executable by ops_runtime alone', async () => {
    await harness.run(async database => {
      const privileges = await owner(database, `SELECT p.proname, pg_get_userbyid(p.proowner) AS owner,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec, has_function_privilege('app_runtime', p.oid, 'EXECUTE') AS app,
        has_function_privilege('tracking_runtime', p.oid, 'EXECUTE') AS tracking, has_function_privilege('maintenance_runtime', p.oid, 'EXECUTE') AS maintenance,
        has_function_privilege('ops_runtime', p.oid, 'EXECUTE') AS ops
        FROM pg_proc p WHERE p.proname IN ('lock_account','lock_account_by_id','recover_account','purge_sessions','force_password_change','quarantine_after_restore','account_exists') ORDER BY 1`);
      expect(privileges).toHaveLength(7);
      for (const privilege of privileges) expect(privilege, privilege.proname).toMatchObject({ owner: 'ops_fn_owner', public_exec: false, app: false, tracking: false, maintenance: false, ops: true });
    });
  });
});
