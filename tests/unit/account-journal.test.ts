import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAccountJournal, readJournal } from '@/server/modules/auth/account-journal';
import { parseSettings } from '@/server/core/settings';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptl-journal-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });
const lines = (file: string) => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));

describe('M1-PH3 account journal (D-16)', () => {
  it('appends one JSON line per event with the user ID, event and time, and nothing else', async () => {
    const file = path.join(directory, 'nested', 'journal.ndjson');
    const journal = createAccountJournal({ path: file, clock: () => new Date('2026-11-28T03:00:00.000Z') });
    expect(await journal.record('7', 'USER_CREATED')).toBe('recorded');
    expect(await journal.record('7', 'USER_STATUS_CHANGED', { isActive: false })).toBe('recorded');
    expect(await journal.record('7', 'PASSWORD_CHANGED', { isActive: true })).toBe('recorded');
    expect(lines(file)).toEqual([
      { t: '2026-11-28T03:00:00.000Z', userId: '7', event: 'USER_CREATED' },
      { t: '2026-11-28T03:00:00.000Z', userId: '7', event: 'USER_STATUS_CHANGED', isActive: false },
      // `isActive` is kept only for a status change, the one event a replay needs it for.
      { t: '2026-11-28T03:00:00.000Z', userId: '7', event: 'PASSWORD_CHANGED' },
    ]);
  });

  it('only ever appends, so earlier records survive later writes and a second journal object', async () => {
    const file = path.join(directory, 'journal.ndjson');
    await createAccountJournal({ path: file }).record('1', 'USER_CREATED');
    await createAccountJournal({ path: file }).record('2', 'PASSWORD_RESET');
    expect(lines(file).map(line => line.userId)).toEqual(['1', '2']);
  });

  it('records nothing and says so when no path is configured', async () => {
    expect(await createAccountJournal({}).record('1', 'USER_CREATED')).toBe('disabled');
  });

  it('marks a gap instead of failing when the journal cannot be written, and logs only the event type', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // A directory cannot be opened for appending, so the write fails; the marker beside it still works.
    const file = path.join(directory, 'journal.ndjson');
    fs.mkdirSync(file);
    const journal = createAccountJournal({ path: file, clock: () => new Date('2026-11-28T03:00:00.000Z') });
    expect(await journal.record('7', 'PASSWORD_RESET')).toBe('gap');
    expect(lines(file + '.gap')).toEqual([{ t: '2026-11-28T03:00:00.000Z', event: 'PASSWORD_RESET' }]);
    const logged = log.mock.calls.map(call => String(call[0])).join('\n');
    expect(logged).toContain('account_journal_gap');
    expect(logged).not.toContain('"7"');
    expect(readJournal(file)).toMatchObject({ gap: true, unavailable: true, records: [] });
  });

  it('refuses a malformed user ID or unknown event as a gap, never writing it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const file = path.join(directory, 'journal.ndjson');
    const journal = createAccountJournal({ path: file });
    expect(await journal.record('not-an-id', 'USER_CREATED')).toBe('gap');
    expect(await journal.record('7', 'LOGIN_FAILED' as never)).toBe('gap');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('reads records at or after a time, counts damaged lines, and reports a gap marker', async () => {
    const file = path.join(directory, 'journal.ndjson');
    fs.writeFileSync(file, [
      JSON.stringify({ t: '2026-11-27T10:00:00.000Z', userId: '1', event: 'USER_CREATED' }),
      'not json at all',
      JSON.stringify({ t: '2026-11-28T10:00:00.000Z', userId: '2', event: 'USER_STATUS_CHANGED', isActive: false }),
      JSON.stringify({ t: 'yesterday', userId: '3', event: 'USER_CREATED' }),
      JSON.stringify({ t: '2026-11-28T11:00:00.000Z', userId: '0', event: 'USER_CREATED' }),
      '',
    ].join('\n'));
    const everything = readJournal(file);
    expect(everything.records.map(record => record.userId)).toEqual(['1', '2']);
    expect(everything.unreadable).toBe(3);
    expect(everything.gap).toBe(false);
    expect(readJournal(file, new Date('2026-11-28T00:00:00.000Z')).records.map(record => record.userId)).toEqual(['2']);
    fs.writeFileSync(file + '.gap', '{}\n');
    expect(readJournal(file).gap).toBe(true);
    expect(readJournal(path.join(directory, 'missing.ndjson'))).toEqual({ records: [], unreadable: 0, gap: false, unavailable: true });
  });

  it('is configured only through ACCOUNT_JOURNAL_PATH, and stays optional', () => {
    const base = {
      APP_ENV: 'development', APP_ORIGIN: 'http://localhost:3000', APP_DATABASE_URL: 'postgresql://restricted@localhost/test', TRACKING_DATABASE_URL: 'postgresql://tracking@localhost/test',
      SUPABASE_INTERNAL_URL: 'http://localhost:8000', STORAGE_SERVICE_KEY: 'a'.repeat(40), FINGERPRINT_KEY: 'b'.repeat(40), RATE_LIMIT_KEY: 'c'.repeat(40), SESSION_COOKIE_NAME: 'ptl_session_dev',
    };
    expect(parseSettings(base).ACCOUNT_JOURNAL_PATH).toBeUndefined();
    expect(parseSettings({ ...base, ACCOUNT_JOURNAL_PATH: '/var/lib/ptl/journal.ndjson' }).ACCOUNT_JOURNAL_PATH).toBe('/var/lib/ptl/journal.ndjson');
  });
});
