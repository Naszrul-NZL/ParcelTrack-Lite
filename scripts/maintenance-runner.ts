import type { Client } from 'pg';
import { BACKUP_LOCK_KEY } from '../src/shared/constants';

/**
 * The private maintenance job runner (M1-PH3-T10, handoff H13). Jobs run from `scripts/` with the `maintenance_runtime`
 * database role and never from a public handler: the web process holds no credential for that role. The runner owns
 * the cross-cutting rules so a job cannot forget them: one run of a given job at a time, backups held off, a hard
 * time limit, and a result that never carries data.
 */
export type JobContext = {
  client: Client;
  signal: AbortSignal;
  now: () => Date;
  /**
   * Runs `work` in one transaction that holds the shared backup lock, the same lock business writes take. Returns
   * 'deferred' without running `work` when a backup holds the lock exclusively, so a job never races a dump.
   */
  batch<T>(work: (client: Client) => Promise<T>): Promise<T | 'deferred'>;
};
export type JobResult = { processed: number; deferred?: boolean };
export type MaintenanceJob = { name: string; description: string; timeoutMs: number; run(context: JobContext): Promise<JobResult> };

export type Outcome = 'completed' | 'deferred' | 'already-running' | 'timeout' | 'failed';
export type RunSummary = { job: string; outcome: Outcome; processed: number; durationMs: number; errorType?: string };

/** The cross-process guard against two runs of the same job. H13 lets the M3 owner supply another implementation. */
export type JobLock = { tryAcquire(client: Client, name: string): Promise<boolean>; release(client: Client, name: string): Promise<void> };

/** Session-level PostgreSQL advisory lock keyed by job name; released with the connection even if the process dies. */
export const advisoryJobLock: JobLock = {
  async tryAcquire(client, name) {
    const { rows: [row] } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended('ptl-job:' || $1, 0)) AS locked", [name]);
    return row.locked;
  },
  async release(client, name) {
    await client.query("SELECT pg_advisory_unlock(hashtextextended('ptl-job:' || $1, 0))", [name]);
  },
};

export class JobRegistry {
  private readonly jobs = new Map<string, MaintenanceJob>();
  register(job: MaintenanceJob) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(job.name)) throw new Error('A job name is 2 to 41 lowercase letters, digits and dashes.');
    if (this.jobs.has(job.name)) throw new Error('Duplicate job name: ' + job.name);
    if (!Number.isInteger(job.timeoutMs) || job.timeoutMs < 1000 || job.timeoutMs > 600_000) throw new Error('A job needs a time limit of 1 to 600 seconds.');
    this.jobs.set(job.name, job);
    return this;
  }
  get(name: string) { return this.jobs.get(name); }
  list() { return [...this.jobs.values()].map(({ name, description, timeoutMs }) => ({ name, description, timeoutMs })); }
}

export type RunnerDependencies = {
  /** Opens a new connection as `maintenance_runtime`; called once per run, and once more to stop a run that overran. */
  connect(): Promise<Client>;
  lock?: JobLock;
  clock?: () => Date;
};

/** Reports a failure by its class only: messages and stacks can carry parcel data. */
const errorType = (error: unknown) => error instanceof Error ? error.constructor.name : typeof error;

/**
 * Runs one job and returns a summary. Never throws for a job failure. Outcomes: `completed`; `deferred` (a backup held
 * the lock, nothing was changed beyond finished batches); `already-running` (another process holds this job's lock);
 * `timeout` (the connection was terminated, which rolls back the open batch and frees the lock); `failed`.
 */
export async function runJob(job: MaintenanceJob, dependencies: RunnerDependencies): Promise<RunSummary> {
  const lock = dependencies.lock ?? advisoryJobLock;
  const clock = dependencies.clock ?? (() => new Date());
  const started = Date.now();
  const finish = (outcome: Outcome, processed = 0, error?: unknown): RunSummary => ({
    job: job.name, outcome, processed, durationMs: Date.now() - started, ...(error === undefined ? {} : { errorType: errorType(error) }),
  });

  const client = await dependencies.connect();
  // Ending the session on a timeout makes the driver report a dropped connection; that is expected and handled below.
  client.on('error', () => undefined);
  let pid: number | undefined;
  try {
    pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    if (!(await lock.tryAcquire(client, job.name))) { await client.end().catch(() => undefined); return finish('already-running'); }
  } catch (error) {
    await client.end().catch(() => undefined);
    return finish('failed', 0, error);
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<'timeout'>(resolve => { timer = setTimeout(() => { controller.abort(); resolve('timeout'); }, job.timeoutMs); });
  const context: JobContext = {
    client, signal: controller.signal, now: clock,
    async batch(work) {
      if (controller.signal.aborted) throw new Error('The job ran out of time.');
      await client.query('BEGIN');
      try {
        const { rows: [row] } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock_shared($1::bigint) AS locked', [BACKUP_LOCK_KEY]);
        if (!row.locked) { await client.query('ROLLBACK'); return 'deferred'; }
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    },
  };

  try {
    const outcome = await Promise.race([job.run(context).then(result => ({ result })), limit]);
    if (outcome === 'timeout') {
      // Stop the database session itself: a query already running is cancelled, its transaction rolls back, the lock goes.
      const killer = await dependencies.connect();
      try { await killer.query('SELECT pg_terminate_backend($1)', [pid]); } finally { await killer.end().catch(() => undefined); }
      return finish('timeout');
    }
    return finish(outcome.result.deferred ? 'deferred' : 'completed', outcome.result.processed);
  } catch (error) {
    return controller.signal.aborted ? finish('timeout', 0, error) : finish('failed', 0, error);
  } finally {
    if (timer) clearTimeout(timer);
    await lock.release(client, job.name).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
