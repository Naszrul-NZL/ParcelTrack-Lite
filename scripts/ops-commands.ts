import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { LIMITS } from '../src/shared/constants';
import { displayNameSchema, usernameSchema } from '../src/shared/schemas';

/** What `provision-admin` needs from a password service: the policy check and the hash. */
export type Hasher = { hash(value: string): Promise<string> };
export type Usage = { error: string };

const ERROR_MESSAGES: Record<string, string> = {
  PT007: 'That username already belongs to a Seller or Rider. Admin accounts are never converted.',
  '22023': 'The database refused the details. Check the username, display name, password and expiry.',
};
/** Turns a database failure into one safe sentence: a SQLSTATE we know, or a generic line. Never the driver's text. */
export function describeFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  // The password rules reject before the database is asked.
  if (code === 'VALIDATION_ERROR' || (error instanceof Error && error.name === 'ZodError')) return 'That password is too long or too common. Choose another.';
  return ERROR_MESSAGES[code] ?? 'The database refused the command.';
}

/**
 * `provision-admin`: creates a named Admin who must change the first password at first sign-in. A rerun for an
 * existing Admin is a no-op. The password is supplied by the caller, hashed here, and never printed or logged.
 */
export async function provisionAdmin(client: Pick<Client, 'query'>, input: { username: string; displayName: string; password: string }, hasher: Hasher): Promise<{ created: boolean } | Usage> {
  const username = usernameSchema.safeParse(input.username);
  if (!username.success) return { error: 'The username must be 3 to 50 lowercase letters, numbers, dots, dashes or underscores.' };
  const displayName = displayNameSchema.safeParse(input.displayName);
  if (!displayName.success) return { error: 'The display name must be 1 to 80 characters.' };
  if (Array.from(input.password).length < LIMITS.passwordMin) return { error: `The password must be at least ${LIMITS.passwordMin} characters.` };
  const hash = await hasher.hash(input.password);
  const { rows: [row] } = await client.query<{ created: boolean }>('SELECT created FROM app.provision_admin($1, $2, $3, $4)', [username.data, displayName.data, hash, randomUUID()]);
  return { created: row.created };
}

export type MaintenanceState = { enabled: boolean; until: string | null; active: boolean };
export async function maintenanceState(client: Pick<Client, 'query'>): Promise<MaintenanceState> {
  const { rows: [row] } = await client.query<{ maintenance_mode: boolean; set_until: Date | null; active: boolean }>('SELECT * FROM app.get_maintenance_state()');
  return { enabled: row.maintenance_mode, until: row.set_until ? row.set_until.toISOString() : null, active: row.active };
}
/** Turns maintenance on for 1 to 1440 minutes, or off. The database also refuses an expiry beyond 24 hours. */
export async function setMaintenance(client: Pick<Client, 'query'>, minutes: number | null): Promise<MaintenanceState | Usage> {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return { error: 'Choose a whole number of minutes from 1 to 1440.' };
  await client.query('SELECT app.set_maintenance_mode($1, $2)', [minutes !== null, minutes === null ? null : new Date(Date.now() + minutes * 60_000)]);
  return maintenanceState(client);
}

// ---- Incident and restore commands (0013_ops_account_commands) ------------------------------------------------------

/** The part of the account journal the commands write to; the reader below takes already-read records. */
export type CommandJournal = { record(userId: string, event: 'ACCOUNT_LOCKED' | 'ACCOUNT_RECOVERED'): Promise<'recorded' | 'gap' | 'disabled'> };

const NOT_FOUND = 'PT002';
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === NOT_FOUND;

/** `lock-account`: disables an account of any role at once and ends its sessions. Idempotent. */
export async function lockAccount(client: Pick<Client, 'query'>, username: string, journal?: CommandJournal): Promise<{ found: boolean; changed: boolean }> {
  try {
    const { rows: [row] } = await client.query<{ id: string; changed: boolean }>('SELECT id::text AS id, changed FROM app.lock_account($1, $2)', [username, randomUUID()]);
    if (row.changed) await journal?.record(row.id, 'ACCOUNT_LOCKED');
    return { found: true, changed: row.changed };
  } catch (error) {
    if (missing(error)) return { found: false, changed: false };
    throw error;
  }
}

/** `lock-accounts --from-file`: one username per line; blank lines and lines starting with # are ignored. */
export async function lockAccountsFromList(client: Pick<Client, 'query'>, usernames: string[], journal?: CommandJournal) {
  const result = { locked: 0, alreadyLocked: 0, notFound: [] as string[] };
  for (const username of usernames) {
    const outcome = await lockAccount(client, username, journal);
    if (!outcome.found) result.notFound.push(username); else if (outcome.changed) result.locked++; else result.alreadyLocked++;
  }
  return result;
}
export const parseUsernameList = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));

/** `recover-account`: new password, active again, must change it at next sign-in, every session ended. */
export async function recoverAccount(client: Pick<Client, 'query'>, input: { username: string; password: string }, hasher: Hasher, journal?: CommandJournal): Promise<{ recovered: boolean } | Usage> {
  if (Array.from(input.password).length < LIMITS.passwordMin) return { error: `The password must be at least ${LIMITS.passwordMin} characters.` };
  const hash = await hasher.hash(input.password);
  try {
    const { rows: [row] } = await client.query<{ id: string }>('SELECT id::text AS id FROM app.recover_account($1, $2, $3)', [input.username, hash, randomUUID()]);
    await journal?.record(row.id, 'ACCOUNT_RECOVERED');
    return { recovered: true };
  } catch (error) {
    if (missing(error)) return { error: 'No account has that username.' };
    throw error;
  }
}

/** `purge-sessions`: one account's sessions, or every session when `username` is null. Returns how many were removed. */
export async function purgeSessions(client: Pick<Client, 'query'>, username: string | null): Promise<{ removed: number } | Usage> {
  try {
    const { rows: [row] } = await client.query<{ removed: number }>('SELECT app.purge_sessions($1, $2) AS removed', [username, randomUUID()]);
    return { removed: row.removed };
  } catch (error) {
    if (missing(error)) return { error: 'No account has that username.' };
    throw error;
  }
}

export type Reading = { records: { userId: string; event: string; isActive?: boolean }[]; unreadable: number; gap: boolean; unavailable: boolean };
export type Reconciliation = { disabled: number; passwordChangeForced: number; accountsCreatedSinceBackup: string[]; reactivatedSinceBackup: string[]; alreadyConsistent: number };

/**
 * `reconcile-accounts --from-journal`: replays the journal for events after the backup time. Accounts disabled or locked
 * since are disabled again (the last status event wins); accounts whose password changed, was reset or was recovered since
 * must change it, because the restored hash is stale. Accounts created since the backup do not exist any more and are
 * listed, never recreated (their password hashes were not journaled). A journal that is missing, unreadable, damaged or has a gap is
 * refused: the answer is `quarantine-after-restore`, not a partial replay.
 */
export async function reconcileAccounts(client: Pick<Client, 'query'>, reading: Reading): Promise<Reconciliation | Usage> {
  if (reading.unavailable || reading.gap || reading.unreadable > 0) return { error: 'The account journal is missing, damaged or has a gap, so it cannot be trusted. Run quarantine-after-restore instead.' };
  const lastStatus = new Map<string, boolean>();
  const stale = new Set<string>();
  const created = new Set<string>();
  for (const record of reading.records) {
    if (record.event === 'USER_STATUS_CHANGED' && typeof record.isActive === 'boolean') lastStatus.set(record.userId, record.isActive);
    else if (record.event === 'ACCOUNT_LOCKED') lastStatus.set(record.userId, false);
    else if (record.event === 'ACCOUNT_RECOVERED') { lastStatus.set(record.userId, true); stale.add(record.userId); }
    else if (record.event === 'PASSWORD_CHANGED' || record.event === 'PASSWORD_RESET') stale.add(record.userId);
    else if (record.event === 'USER_CREATED') created.add(record.userId);
  }
  const result: Reconciliation = { disabled: 0, passwordChangeForced: 0, accountsCreatedSinceBackup: [], reactivatedSinceBackup: [], alreadyConsistent: 0 };
  for (const [userId, active] of lastStatus) {
    if (active) { result.reactivatedSinceBackup.push(userId); continue; }
    const { rows: [row] } = await client.query<{ changed: boolean }>('SELECT app.lock_account_by_id($1, $2) AS changed', [userId, randomUUID()]);
    if (row.changed) result.disabled++; else result.alreadyConsistent++;
  }
  for (const userId of stale) {
    const { rows: [row] } = await client.query<{ forced: boolean }>('SELECT app.force_password_change($1, $2) AS forced', [userId, randomUUID()]);
    if (row.forced) result.passwordChangeForced++;
  }
  for (const userId of created) {
    const { rows: [row] } = await client.query<{ present: boolean }>('SELECT app.account_exists($1) AS present', [userId]);
    if (!row.present) result.accountsCreatedSinceBackup.push(userId);
  }
  return result;
}

export type Quarantine = { ridersDisabled: number; accountsFlagged: number; sessionsEnded: number };
/** `quarantine-after-restore`: every Rider disabled, every account must change its password, every session ended. */
export async function quarantineAfterRestore(client: Pick<Client, 'query'>): Promise<Quarantine> {
  const { rows: [row] } = await client.query<{ riders_disabled: number; accounts_flagged: number; sessions_ended: number }>('SELECT * FROM app.quarantine_after_restore($1)', [randomUUID()]);
  return { ridersDisabled: row.riders_disabled, accountsFlagged: row.accounts_flagged, sessionsEnded: row.sessions_ended };
}
