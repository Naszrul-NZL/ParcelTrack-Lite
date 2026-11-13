import '../../scripts/env';
import { Client, Pool, type PoolClient } from 'pg';
import { runner } from 'node-pg-migrate';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertConnectedRole, type TransactionPool } from '@/server/core/db';
import { PasswordService, SYNTHETIC_ACCOUNTS } from '@/server/modules/auth/password';
import { makeTracking } from '@/server/modules/parcels/tokens';
import { makeStorageKey, SupabaseProofStore, type ProofStore } from '@/server/modules/delivery/storage';

type RuntimeRole = 'app_runtime' | 'tracking_runtime';
type AccountName = typeof SYNTHETIC_ACCOUNTS[number][0];
type FixtureSession = { cookie: string; csrfToken: string; digest: string; userId: string };
export type IsolatedDatabase = {
  name: string;
  directory: string;
  accounts: Record<AccountName, string>;
  pool(role?: RuntimeRole): TransactionPool;
  fixtureClient(): Promise<Client>;
  migrationClient(): Promise<Client>;
  loginInput(username: AccountName): { username: AccountName; password: string };
  session(username: AccountName): Promise<FixtureSession>;
  storage: ProofStore;
  storageKey(parcelId: string, extension: 'jpg' | 'png'): string;
};

export function assertIsolatedTestConfiguration(env: Record<string, string | undefined> = process.env) {
  if (env.PTL_PROFILE !== 'test' || env.APP_ENV !== 'test' || env.ALLOW_SYNTHETIC_FIXTURES !== 'local-only') throw new Error('Isolated database fixtures require the test profile and private fixture acknowledgement.');
  const urls = ['BOOTSTRAP_DATABASE_URL', 'MIGRATION_DATABASE_URL', 'FIXTURE_DATABASE_URL', 'APP_DATABASE_URL', 'TRACKING_DATABASE_URL'].map(name => {
    const value = env[name];
    if (!value) throw new Error('Initialize the isolated test stack before creating fixtures.');
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54323' || url.pathname !== '/postgres') throw new Error('Fixtures require the dedicated local test database port.');
    return url;
  });
  if (urls[3].username !== 'app_runtime' || urls[4].username !== 'tracking_runtime' || urls[2].username !== 'fixture_provisioner' || urls[1].username !== 'migration_owner') throw new Error('Fixture runtime credentials must use their declared roles.');
  const storage = new URL(env.SUPABASE_INTERNAL_URL ?? 'http://invalid');
  if (!['localhost', '127.0.0.1'].includes(storage.hostname) || storage.port !== '8001') throw new Error('Fixtures require the dedicated local test Storage endpoint.');
}

function databaseUrl(setting: string, name: string) {
  const url = new URL(process.env[setting]!);
  url.pathname = '/' + name;
  return url.toString();
}

export class TestClock {
  constructor(private milliseconds = Date.parse('2026-01-01T00:00:00Z')) {}
  now = () => new Date(this.milliseconds);
  advance(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Clock advances must be finite and nonnegative.');
    this.milliseconds += milliseconds;
  }
}

export async function createDatabaseHarness() {
  assertIsolatedTestConfiguration();
  const operator = new Client({ connectionString: process.env.BOOTSTRAP_DATABASE_URL });
  await operator.connect();
  const template = 'ptl_template_' + randomUUID().replaceAll('-', '');
  const active = new Set<string>();
  const root = path.resolve('.local/test/harness');
  let initialized = false;
  let templateAccounts: Record<AccountName, string>;
  const fixturePassword = randomBytes(32).toString('base64url');
  let pending: Promise<unknown> = Promise.resolve();
  function operatorWork<T>(work: () => Promise<T>): Promise<T> {
    const next = pending.then(work);
    pending = next.catch(() => {});
    return next;
  }

  async function drop(name: string, owner = false) {
    if (!/^(ptl_template_|ptl_case_)[0-9a-f]{32}$/.test(name)) throw new Error('Refusing to drop an unmanaged database.');
    return operatorWork(async () => {
      try {
        if (!owner) await operator.query('SET ROLE migration_owner');
        await operator.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
      } finally { await operator.query('RESET ROLE'); }
    });
  }

  try {
    await operator.query('CREATE DATABASE ' + template + ' TEMPLATE template0');
    initialized = true;
    await operator.query('GRANT CREATE ON DATABASE ' + template + ' TO migration_owner');
    await runner({ databaseUrl: databaseUrl('MIGRATION_DATABASE_URL', template), dir: 'db/migrations', direction: 'up', migrationsTable: 'schema_migrations', schema: 'app', createSchema: true, checkOrder: true, singleTransaction: true, log: () => {} });
    const fixture = new Client({ connectionString: databaseUrl('FIXTURE_DATABASE_URL', template) });
    await fixture.connect();
    try {
      const hash = await new PasswordService().hash(fixturePassword);
      await fixture.query('BEGIN');
      await fixture.query('SET LOCAL ROLE auth_fn_owner');
      for (const [username, role, enabled, change] of SYNTHETIC_ACCOUNTS) await fixture.query('INSERT INTO app.app_user(username,display_name,password_hash,role,is_active,must_change_password) VALUES($1,$1,$2,$3,$4,$5)', [username, hash, role, enabled, change]);
      const users = (await fixture.query<{ id: string; username: AccountName }>('SELECT id,username FROM app.app_user')).rows;
      const accounts = Object.fromEntries(users.map(user => [user.username, user.id])) as Record<AccountName, string>;
      templateAccounts = accounts;
      await fixture.query('SET LOCAL ROLE domain_writer');
      for (const seller of ['seller.a', 'seller.b'] as const) {
        const parcel = (await fixture.query<{ id: string }>(`INSERT INTO app.parcel(tracking_number,seller_id,recipient_name,recipient_phone,recipient_address,weight_kg,current_status,client_request_id,creation_fingerprint)
          VALUES($1,$2,'Synthetic Recipient','+60000000000','Fictional test address',1.250,'REGISTERED',$3,repeat('a',64)) RETURNING id`, [makeTracking(), accounts[seller], randomUUID()])).rows[0].id;
        await fixture.query("INSERT INTO app.parcel_status_history(parcel_id,changed_by_id,status) VALUES($1,$2,'REGISTERED')", [parcel, accounts[seller]]);
      }
      await fixture.query('COMMIT');
    } finally { await fixture.end(); }
    await operator.query('ALTER DATABASE ' + template + ' ALLOW_CONNECTIONS false');
    await mkdir(root, { recursive: true, mode: 0o700 });
  } catch (error) {
    try { if (initialized) await drop(template, true); } finally { await operator.end(); }
    throw error;
  }

  return {
    async run<T>(work: (database: IsolatedDatabase) => Promise<T>): Promise<T> {
      assertIsolatedTestConfiguration();
      const name = 'ptl_case_' + randomUUID().replaceAll('-', '');
      await operatorWork(() => operator.query('CREATE DATABASE ' + name + ' TEMPLATE ' + template + ' OWNER migration_owner'));
      active.add(name);
      let directory: string;
      try { directory = await mkdtemp(path.join(root, 'case-')); }
      catch (error) { await drop(name); active.delete(name); throw error; }
      const pools = new Map<RuntimeRole, Pool>();
      const clients = new Set<Client>();
      const leased = new Set<PoolClient>();
      const keys = new Set<string>();
      const store = new SupabaseProofStore(process.env.SUPABASE_INTERNAL_URL!, process.env.STORAGE_SERVICE_KEY!, process.env.PROOF_BUCKET);
      const own = (key: string) => { if (!keys.has(key)) throw new Error('Storage probe key belongs to another test.'); };
      const storage: ProofStore = {
        publish: async (key, bytes, mediaType) => { own(key); return store.publish(key, bytes, mediaType); },
        open: async key => { own(key); return store.open(key); },
        delete: async key => { own(key); return store.delete(key); },
        exists: async key => { own(key); return store.exists(key); },
        async *listOld(parcelId, before) { for await (const entry of store.listOld(parcelId, before)) if (keys.has(entry.key)) yield entry; },
      };
      const pool = (role: RuntimeRole = 'app_runtime'): TransactionPool => ({
        async connect(): Promise<PoolClient> {
          if (!pools.has(role)) pools.set(role, new Pool({ connectionString: databaseUrl(role === 'app_runtime' ? 'APP_DATABASE_URL' : 'TRACKING_DATABASE_URL', name), max: 2, connectionTimeoutMillis: 3000 }));
          const client = await pools.get(role)!.connect();
          try {
            await assertConnectedRole(client, role);
            const release = client.release.bind(client);
            client.release = error => { leased.delete(client); release(error); };
            leased.add(client);
            return client;
          }
          catch (error) { client.release(true); throw error; }
        },
      });
      const connectPrivate = async (setting: 'FIXTURE_DATABASE_URL' | 'MIGRATION_DATABASE_URL') => {
        const client = new Client({ connectionString: databaseUrl(setting, name) });
        await client.connect();
        clients.add(client);
        return client;
      };
      let value!: T;
      const failures: unknown[] = [];
      try {
        const accounts = { ...templateAccounts };
        value = await work({
          name, directory, accounts, pool, fixtureClient: () => connectPrivate('FIXTURE_DATABASE_URL'), migrationClient: () => connectPrivate('MIGRATION_DATABASE_URL'), storage,
          loginInput(username) {
            if (!Object.hasOwn(accounts, username)) throw new Error('Unknown fixture account.');
            return { username, password: fixturePassword };
          },
          storageKey(parcelId, extension) { const key = makeStorageKey(parcelId, extension); keys.add(key); return key; },
          async session(username) {
            // TMP-04: a real database session fixture, never a request/header override.
            const token = randomBytes(32).toString('base64url');
            const csrfToken = randomBytes(32).toString('base64url');
            const digest = createHash('sha256').update(token).digest('hex');
            const client = await pool().connect();
            try {
              const result = await client.query(`INSERT INTO app.auth_session(token_digest,user_id,user_session_version,csrf_token,expires_at,absolute_expires_at)
                SELECT $1,id,session_version,$2,now()+interval '30 minutes',now()+interval '8 hours' FROM app.app_user WHERE username=$3 RETURNING user_id`, [digest, csrfToken, username]);
              if (!result.rowCount) throw new Error('Unknown fixture account.');
            } finally { client.release(); }
            return { cookie: 'ptl_session_dev=' + token, csrfToken, digest, userId: accounts[username] };
          },
        });
      } catch (error) { failures.push(error); }
      {
        const results = await Promise.allSettled([...keys].map(key => store.delete(key)));
        for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
        for (const client of leased) client.release(true);
        const closed = await Promise.allSettled([...clients].map(client => client.end()));
        const ended = await Promise.allSettled([...pools.values()].map(pool => pool.end()));
        for (const result of [...closed, ...ended]) if (result.status === 'rejected') failures.push(result.reason);
        try { await drop(name); active.delete(name); } catch (error) { failures.push(error); }
        try {
          const relative = path.relative(root, path.resolve(directory));
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Refusing to remove an unmanaged fixture directory.');
          await rm(directory, { recursive: true, force: true });
        } catch (error) { failures.push(error); }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, 'Isolated test or cleanup failed.');
      return value;
    },
    async dispose() {
      try {
        for (const name of active) await drop(name);
        await drop(template, true);
      } finally { await operator.end(); }
    },
  };
}
