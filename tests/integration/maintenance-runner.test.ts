import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { BACKUP_LOCK_KEY } from '@/shared/constants';
import { implementedEndpoints } from '../../scripts/contract-inventory';
import { retentionJob } from '../../scripts/maintenance-jobs';
import { JobRegistry, advisoryJobLock, runJob, type MaintenanceJob } from '../../scripts/maintenance-runner';
import { createDatabaseHarness, type AccountName, type IsolatedDatabase } from '../harness/isolated-database';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

const connectAs = (database: IsolatedDatabase, role: 'maintenance_runtime') => async () => {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.username = role;
  url.password = encodeURIComponent(process.env.DB_PASSWORD_MAINTENANCE_RUNTIME!);
  url.pathname = '/' + database.name;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  return client;
};
const owner = async (database: IsolatedDatabase, text: string, values: unknown[] = []) => (await (await database.migrationClient()).query(text, values)).rows;
const dummy = (overrides: Partial<MaintenanceJob> = {}): MaintenanceJob => ({ name: 'dummy', description: 'test job', timeoutMs: 5000, run: async () => ({ processed: 3 }), ...overrides });
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

describe('M1-PH3-TC19 job runner', () => {
  it('runs a job as maintenance_runtime and gives the same summary when run again', async () => {
    await harness.run(async database => {
      const connect = connectAs(database, 'maintenance_runtime');
      let user = '';
      const job = dummy({ run: async context => { user = (await context.client.query('SELECT current_user')).rows[0].current_user; return { processed: 3 }; } });
      const first = await runJob(job, { connect });
      const second = await runJob(job, { connect });
      expect(user).toBe('maintenance_runtime');
      expect([first, second].map(({ outcome, processed }) => ({ outcome, processed }))).toEqual([{ outcome: 'completed', processed: 3 }, { outcome: 'completed', processed: 3 }]);
      expect(first.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('lets only one run of a job proceed at a time, across connections, and frees the lock afterwards', async () => {
    await harness.run(async database => {
      const connect = connectAs(database, 'maintenance_runtime');
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let started!: () => void;
      const running = new Promise<void>(resolve => { started = resolve; });
      const slow = dummy({ run: async () => { started(); await gate; return { processed: 1 }; } });
      const first = runJob(slow, { connect });
      await running;
      const second = await runJob(dummy(), { connect });
      expect(second).toMatchObject({ outcome: 'already-running', processed: 0 });
      // A different job name is not blocked.
      expect(await runJob(dummy({ name: 'other' }), { connect })).toMatchObject({ outcome: 'completed' });
      release();
      expect(await first).toMatchObject({ outcome: 'completed', processed: 1 });
      expect(await runJob(dummy(), { connect })).toMatchObject({ outcome: 'completed' });
    });
  });

  it('stops a job that overruns its limit by ending its database session, rolling back and freeing the lock', async () => {
    await harness.run(async database => {
      const connect = connectAs(database, 'maintenance_runtime');
      let pid = 0;
      const overrun = dummy({
        timeoutMs: 1000,
        run: async context => {
          pid = (await context.client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          await context.batch(async client => { await client.query('SELECT pg_sleep(30)'); });
          return { processed: 99 };
        },
      });
      const started = Date.now();
      const summary = await runJob(overrun, { connect });
      expect(summary).toMatchObject({ outcome: 'timeout', processed: 0 });
      expect(Date.now() - started).toBeLessThan(8000);
      await sleep(300);
      expect(await owner(database, 'SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid])).toEqual([]);
      expect(await runJob(dummy(), { connect })).toMatchObject({ outcome: 'completed' });
    });
  });

  it('reports a failure by its class only, never its message, and still frees the lock', async () => {
    await harness.run(async database => {
      const connect = connectAs(database, 'maintenance_runtime');
      const summary = await runJob(dummy({ run: async () => { throw new Error('recipient 0123456789 at Secret Street'); } }), { connect });
      expect(summary).toMatchObject({ outcome: 'failed', processed: 0, errorType: 'Error' });
      expect(JSON.stringify(summary)).not.toMatch(/0123456789|Secret Street/);
      expect(await runJob(dummy(), { connect })).toMatchObject({ outcome: 'completed' });
    });
  });

  it('defers instead of running while a backup holds the lock, and holds a backup off while a batch runs', async () => {
    await harness.run(async database => {
      const connect = connectAs(database, 'maintenance_runtime');
      let ran = 0;
      const job = dummy({ run: async context => { const result = await context.batch(async () => { ran++; return 1; }); return result === 'deferred' ? { processed: 0, deferred: true } : { processed: 1 }; } });

      const backup = await connect();
      try {
        await backup.query('SELECT pg_advisory_lock($1::bigint)', [BACKUP_LOCK_KEY]);
        expect(await runJob(job, { connect })).toMatchObject({ outcome: 'deferred', processed: 0 });
        expect(ran).toBe(0);
      } finally { await backup.query('SELECT pg_advisory_unlock_all()'); await backup.end(); }
      expect(await runJob(job, { connect })).toMatchObject({ outcome: 'completed', processed: 1 });
      expect(ran).toBe(1);

      // While a batch is open the shared lock is held, so a dump cannot take its exclusive lock.
      const dump = await connect();
      try {
        let finish!: () => void;
        const hold = new Promise<void>(resolve => { finish = resolve; });
        let inside!: () => void;
        const opened = new Promise<void>(resolve => { inside = resolve; });
        const long = runJob(dummy({ run: async context => { await context.batch(async () => { inside(); await hold; }); return { processed: 1 }; } }), { connect });
        await opened;
        expect((await dump.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [BACKUP_LOCK_KEY])).rows[0].locked).toBe(false);
        finish();
        await long;
        expect((await dump.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [BACKUP_LOCK_KEY])).rows[0].locked).toBe(true);
      } finally { await dump.query('SELECT pg_advisory_unlock_all()'); await dump.end(); }
    });
  });

  it('accepts another lock implementation, so the M3 owner can supply the H13 lock interface', async () => {
    await harness.run(async database => {
      const calls: string[] = [];
      const lock = { tryAcquire: async (_client: Client, name: string) => { calls.push('acquire:' + name); return true; }, release: async (_client: Client, name: string) => { calls.push('release:' + name); } };
      expect(await runJob(dummy(), { connect: connectAs(database, 'maintenance_runtime'), lock })).toMatchObject({ outcome: 'completed' });
      expect(calls).toEqual(['acquire:dummy', 'release:dummy']);
      expect(advisoryJobLock.tryAcquire).toBeTypeOf('function');
    });
  });
});

describe('M1-PH3-TC19 retention job on the runner (H36)', () => {
  async function seedParcels(database: IsolatedDatabase) {
    const client = await database.fixtureClient();
    const ids: Record<string, string> = {};
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE domain_writer');
    for (const [key, terminalAt] of [['due', '2024-01-01T00:00:00Z'], ['recent', new Date().toISOString()]] as const) {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO app.parcel (tracking_number, seller_id, recipient_name, recipient_phone, recipient_address, weight_kg, current_status, client_request_id, creation_fingerprint, created_at, terminal_at, delivered_at)
        VALUES ('PTL-' || upper(replace(gen_random_uuid()::text, '-', '')), $1, 'Retention Recipient', '+60123456789', 'Retention address', 1, 'DELIVERED', $2, $3, '2023-12-01T00:00:00Z', $4, $4)
        RETURNING id::text`, [database.accounts['seller.a' as AccountName], randomUUID(), 'e'.repeat(64), terminalAt]);
      await client.query("INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, 'REGISTERED', '2023-12-01T00:00:00Z')", [row.id, database.accounts['seller.a' as AccountName]]);
      ids[key] = row.id;
    }
    await client.query('COMMIT');
    return ids;
  }
  const state = async (database: IsolatedDatabase, id: string) => {
    const client = await database.fixtureClient();
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE domain_writer');
    try { return (await client.query<{ recipient_name: string | null; anonymized_at: string | null }>('SELECT recipient_name, anonymized_at FROM app.parcel WHERE id = $1', [id])).rows[0]; }
    finally { await client.query('ROLLBACK'); }
  };

  it('anonymizes only parcels past the period, audits each, and finds nothing on the next run', async () => {
    await harness.run(async database => {
      const ids = await seedParcels(database);
      const connect = connectAs(database, 'maintenance_runtime');
      expect(await runJob(retentionJob, { connect })).toMatchObject({ outcome: 'completed', processed: 1 });
      expect(await state(database, ids.due)).toMatchObject({ recipient_name: null });
      expect((await state(database, ids.due)).anonymized_at).not.toBeNull();
      expect(await state(database, ids.recent)).toMatchObject({ recipient_name: 'Retention Recipient', anonymized_at: null });
      expect(await owner(database, "SELECT target_user_id, parcel_id::text AS parcel_id FROM app.audit_event WHERE event_type = 'RETENTION_ANONYMIZED'")).toEqual([{ target_user_id: null, parcel_id: ids.due }]);
      expect(await runJob(retentionJob, { connect })).toMatchObject({ outcome: 'completed', processed: 0 });
      expect(await owner(database, "SELECT count(*)::int AS n FROM app.audit_event WHERE event_type = 'RETENTION_ANONYMIZED'")).toEqual([{ n: 1 }]);
    });
  });
});

describe('M1-PH3-T10 registry and isolation', () => {
  it('lists registered jobs and refuses duplicate names, bad names and missing or excessive time limits', () => {
    const registry = new JobRegistry().register(dummy());
    expect(registry.list()).toEqual([{ name: 'dummy', description: 'test job', timeoutMs: 5000 }]);
    expect(registry.get('dummy')?.name).toBe('dummy');
    expect(registry.get('nope')).toBeUndefined();
    expect(() => registry.register(dummy())).toThrow('Duplicate job name');
    for (const name of ['Bad', 'x', 'has space', '1leading', 'a'.repeat(50)]) expect(() => new JobRegistry().register(dummy({ name })), name).toThrow('job name');
    for (const timeoutMs of [0, 999, 600_001, 1.5, Number.NaN]) expect(() => new JobRegistry().register(dummy({ timeoutMs })), String(timeoutMs)).toThrow('time limit');
  });

  it('keeps job credentials and code out of the web process: no source file under src names them or imports scripts', () => {
    const files: string[] = [];
    const walk = (directory: string) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const full = path.join(directory, entry.name); if (entry.isDirectory()) walk(full); else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(full); } };
    walk('src');
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/MAINTENANCE_DATABASE_URL|DB_PASSWORD_|maintenance_runtime|OPS_DATABASE_URL/);
      expect(text, file).not.toMatch(/from\s+['"][^'"]*\/scripts\//);
    }
  });

  it('has no public endpoint that starts a job', () => {
    expect(implementedEndpoints().filter(endpoint => /maint|job|ops|schedule/i.test(endpoint.path))).toEqual([]);
  });
});
