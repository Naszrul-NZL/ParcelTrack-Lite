import './env';
import { Client } from 'pg';
import { logEvent } from '../src/server/core/logging';
import { required } from './env';
import { defaultRegistry } from './maintenance-jobs';
import { runJob, type RunSummary } from './maintenance-runner';

// Private maintenance command line. It signs in as `maintenance_runtime`; the web service has no credential for that
// role and no public endpoint starts a job. Direct invocation comes first; `schedule` is a local prototype scheduler
// that repeats the registered jobs on an interval, one process at a time (cloud scheduling is deferred).
const USAGE = `Usage (npm run maintenance -- <command>):
  list
  run <job>
  schedule --every <minutes 1-1440> [--once]`;

function connection() {
  if (process.env.MAINTENANCE_DATABASE_URL) return process.env.MAINTENANCE_DATABASE_URL;
  const url = new URL(required('BOOTSTRAP_DATABASE_URL'));
  url.username = 'maintenance_runtime';
  url.password = encodeURIComponent(required('DB_PASSWORD_MAINTENANCE_RUNTIME'));
  return url.toString();
}
const connect = async () => { const client = new Client({ connectionString: connection() }); await client.connect(); return client; };
const registry = defaultRegistry();

function report(summary: RunSummary) {
  logEvent('job_completed', { job: summary.job, outcome: summary.outcome, processed: summary.processed, durationMs: summary.durationMs, ...(summary.errorType ? { errorType: summary.errorType } : {}) });
  return summary.outcome === 'failed' || summary.outcome === 'timeout' ? 1 : 0;
}

const [command, ...args] = process.argv.slice(2);
let exit = 0;
if (command === 'list') {
  console.log(JSON.stringify(registry.list(), null, 2));
} else if (command === 'run') {
  const job = registry.get(args[0] ?? '');
  if (!job) { console.error('Unknown job. Use list to see the jobs.\n' + USAGE); exit = 2; }
  else exit = report(await runJob(job, { connect }));
} else if (command === 'schedule') {
  const every = Number(args[args.indexOf('--every') + 1]);
  if (!args.includes('--every') || !Number.isInteger(every) || every < 1 || every > 1440) { console.error(USAGE); exit = 2; }
  else {
    let stopping = false;
    process.on('SIGINT', () => { stopping = true; });
    do {
      for (const { name } of registry.list()) exit = Math.max(exit, report(await runJob(registry.get(name)!, { connect })));
      if (args.includes('--once') || stopping) break;
      const until = Date.now() + every * 60_000;
      while (!stopping && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (!stopping);
  }
} else { console.error(USAGE); exit = 2; }
process.exit(exit);
