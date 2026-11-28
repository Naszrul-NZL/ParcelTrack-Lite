import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { logEvent } from '@/server/core/logging';
import { getSettings } from '@/server/core/settings';
import { idSchema } from '@/shared/schemas';

/**
 * The off-database account journal (D-16): an append-only file of account-changing events, kept outside PostgreSQL so a
 * restore can be reconciled with what happened after the backup. A record holds the user ID, the event and the time,
 * plus `isActive` for a status change (the only thing a replay needs to re-disable an account). It never holds a
 * password, hash, token, username or request body.
 */
export const JOURNAL_EVENTS = ['USER_CREATED', 'USER_STATUS_CHANGED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'ACCOUNT_RECOVERED'] as const;
export type JournalEvent = (typeof JOURNAL_EVENTS)[number];
export type JournalRecord = { t: string; userId: string; event: JournalEvent; isActive?: boolean };
export type JournalDetails = { isActive?: boolean };
export type JournalOutcome = 'recorded' | 'gap' | 'disabled';
export type AccountJournal = { record(userId: string, event: JournalEvent, details?: JournalDetails): Promise<JournalOutcome> };

type Options = { path?: string; clock?: () => Date };

function appendDurably(file: string, line: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 'a' appends atomically for one small write; fsync makes the record survive a crash of this process or the machine.
  const handle = fs.openSync(file, 'a', 0o600);
  try { fs.writeSync(handle, line); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
}

/**
 * Appends after the database transaction has committed. A failed write never fails the request that already succeeded:
 * it marks a recoverability gap instead (a `.gap` marker beside the journal, and a log event with only the event type),
 * which the restore procedure reads as "the journal is incomplete, quarantine after restore". With no path configured the
 * journal is off and nothing is recorded; there is no in-memory buffer, because a crash would lose it.
 */
export function createAccountJournal({ path: file, clock = () => new Date() }: Options): AccountJournal {
  return {
    async record(userId, event, details = {}) {
      if (!file) return 'disabled';
      const record: JournalRecord = { t: clock().toISOString(), userId, event, ...(event === 'USER_STATUS_CHANGED' && typeof details.isActive === 'boolean' ? { isActive: details.isActive } : {}) };
      try {
        if (!idSchema.safeParse(userId).success || !(JOURNAL_EVENTS as readonly string[]).includes(event)) throw new Error('Invalid journal record.');
        appendDurably(file, JSON.stringify(record) + '\n');
        return 'recorded';
      } catch {
        logEvent('account_journal_gap', { journalEvent: event });
        try { appendDurably(file + '.gap', JSON.stringify({ t: record.t, event }) + '\n'); } catch { /* the log event above is the remaining signal */ }
        return 'gap';
      }
    },
  };
}

export type JournalReading = { records: JournalRecord[]; unreadable: number; gap: boolean; unavailable: boolean };

/**
 * Reads the journal for a restore: records at or after `since`, the number of damaged lines, whether a gap marker exists,
 * and whether the file is missing or could not be read (the restore then treats the journal as unavailable).
 */
export function readJournal(file: string, since?: Date): JournalReading {
  const gap = fs.existsSync(file + '.gap');
  if (!fs.existsSync(file)) return { records: [], unreadable: 0, gap, unavailable: true };
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { records: [], unreadable: 0, gap: true, unavailable: true }; }
  const records: JournalRecord[] = [];
  let unreadable = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as JournalRecord;
      const valid = idSchema.safeParse(value.userId).success && (JOURNAL_EVENTS as readonly string[]).includes(value.event) && !Number.isNaN(Date.parse(value.t));
      if (!valid) { unreadable++; continue; }
      if (!since || Date.parse(value.t) >= since.getTime()) records.push(value);
    } catch { unreadable++; }
  }
  return { records, unreadable, gap, unavailable: false };
}

let production: AccountJournal | undefined;
/** Application wiring: the path from `ACCOUNT_JOURNAL_PATH`, or no journal when it is not configured. */
export function accountJournal(): AccountJournal {
  production ??= createAccountJournal({ path: getSettings().ACCOUNT_JOURNAL_PATH });
  return production;
}
