import { JobRegistry, type MaintenanceJob } from './maintenance-runner';

const RETENTION_BATCH = 100;
const RETENTION_MAX_BATCHES = 50;

/**
 * Recipient retention (policy P3, handoff H36 from Zikri): anonymizes parcels that are due 12 months after their terminal
 * time (or last status change, when they never finished). Selection and the rule live in `app.list_retention_candidates`
 * and `app.anonymize_parcel`; this job only pages through them. Each batch is its own transaction, so a stop or a backup
 * leaves finished batches in place, and a rerun finds only what is still due. `as_of` is the server clock of the runner,
 * which no request can choose.
 */
export const retentionJob: MaintenanceJob = {
  name: 'retention',
  description: 'Anonymize recipient details of parcels past the 12-month retention period',
  timeoutMs: 60_000,
  async run(context) {
    let processed = 0;
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch++) {
      const asOf = context.now();
      const result = await context.batch(async client => {
        const { rows } = await client.query<{ parcel_id: string }>('SELECT parcel_id::text AS parcel_id FROM app.list_retention_candidates($1, $2)', [RETENTION_BATCH, asOf]);
        let anonymized = 0;
        for (const row of rows) {
          const { rows: [done] } = await client.query<{ done: boolean }>('SELECT app.anonymize_parcel($1, $2) AS done', [row.parcel_id, asOf]);
          if (done.done) anonymized++;
        }
        return { listed: rows.length, anonymized };
      });
      if (result === 'deferred') return { processed, deferred: true };
      processed += result.anonymized;
      // A short or fruitless batch means nothing more is due; stopping here also bounds a run that cannot make progress.
      if (result.listed < RETENTION_BATCH || result.anonymized === 0) break;
      if (context.signal.aborted) break;
    }
    return { processed };
  },
};

/**
 * The registry of jobs the private command line can run. Proof purge and reconciliation (M3, handoff H13) register here
 * when they exist; until then they are absent rather than stubbed, so `list` never advertises work that does not run.
 */
export function defaultRegistry() {
  return new JobRegistry().register(retentionJob);
}
