# Account incidents and restore reconciliation

Private operations commands for the people who run ParcelTrack Lite. They sign in as the `ops_runtime` database role through `npm run ops -- <command>`; the web service has no access to them. Passwords are typed at a hidden prompt or piped with `--password-stdin`, never given as arguments. Nothing here prints a hash or writes a password to a log.

## Commands

| Command | Use it when | Effect |
| --- | --- | --- |
| `lock-account --username <name>` | An account may be compromised, any role, an Admin included | Disables it, ends its sessions, audits `ACCOUNT_LOCKED`, journals it. Running it again changes nothing |
| `lock-accounts --from-file <file>` | Several accounts must be disabled together | One username per line; blank lines and lines starting with `#` are skipped; reports locked, already locked and unknown names |
| `recover-account --username <name>` | A locked account is safe to return | New password, active again, must change it at next sign-in, sessions ended. A Seller or Rider password expires after 72 hours if unused; an Admin's does not, because nobody can reset an Admin online |
| `purge-sessions --username <name>` or `--all` | Sessions must end now | Removes the sessions of one account, or every session |
| `provision-admin` | The first Admin, or the second | See the status page; a rerun for an existing Admin changes nothing |
| `maintenance on --minutes <n>`, `off`, `status` | Before a backup or a restore | Writes answer 503 `MAINTENANCE`; reads, sign-in, sign-out and public tracking continue; the flag always has an expiry of at most 24 hours |
| `reconcile-accounts --from-journal <file> --since <backup time>` | After a restore, the journal is intact | Replays what happened after the backup (below) |
| `quarantine-after-restore --confirm` | After a restore, the journal is missing, damaged or has a gap | Disables every Rider, forces every account to change its password, ends every session |

## After a restore

1. Keep the web service stopped, or in maintenance mode, until reconciliation is finished.
2. `npm run ops -- purge-sessions --all`.
3. Run `reconcile-accounts` with the journal file and the time of the backup. It refuses a journal that is unreadable or has a `.gap` marker beside it; in that case run `quarantine-after-restore --confirm` instead.
4. Read the result:
   - `disabled`: accounts disabled or locked since the backup are disabled again (the last status event wins).
   - `passwordChangeForced`: accounts whose password was changed, reset or recovered since the backup now must change it, because the restored hash is stale.
   - `accountsCreatedSinceBackup`: accounts created after the backup that the restore no longer has. They are never recreated (their password hashes were not journaled); the people register again, or an Admin creates the Riders again.
   - `reactivatedSinceBackup`: accounts re-enabled since the backup. They are left as the restore has them; an Admin re-enables them if needed.
5. After `quarantine-after-restore`, an Admin signs in (the Admin must change the password first) and re-enables Riders against the staff roster.

**Caution.** The journal identifies accounts by user ID. After a restore the ID sequence goes back to the backup's position, so a new account can take an ID that a lost account used. Run the reconciliation **before** the service takes new registrations, or the replay can act on the wrong person. That is also why step 1 comes first.

## The journal

The journal is a file appended after each account change commits: user ID, event, time, plus `isActive` for a status change. It holds no secrets. A failed write adds a `<journal>.gap` marker and logs `account_journal_gap`; the request that already succeeded is not failed. Keep the file on a separately backed-up volume. With no `ACCOUNT_JOURNAL_PATH` the journal is off; cloud journal storage is deferred, so a deployment without a writable volume has no journal and relies on `quarantine-after-restore`. The recovery point objective is up to one backup interval (24 hours by default) of parcels, status changes and photos.
