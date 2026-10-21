# M3 PH4: Security, failure handling and regression coverage

Owner: Syauqi. Phase PH4 of [phase framework](../../../shared/phase-framework.md). Status: Planned. PH4 proves and extends controls introduced in PH2/PH3 (assigned-Rider checks, validation, private storage, locking).

## 1 Objective

Delivery state and proof files stay consistent under every injected failure and race: file/database fault matrix, unknown-commit reconciliation, orphan cleanup, retention purge of photos after anonymization, concurrent assignment/finalization, a hostile upload corpus, dashboard consistency, unauthorized proof access, a local backup/restore drill without reviving sessions, and an interrupted-network mobile journey. Worksheet rows M3-01 to M3-10, RLS-03 and RLS-10 have recorded results.

## 2 Entry criteria

- G3 passed; contract frozen; TMP-xx retired; real assignment and finalization exist.
- Maintenance runner skeleton available (M1-PH3-T10); Zikri's retention functions available (M2-PH3-T08).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Runner, job registry and backup-lock check | Naszrul M1-PH3-T10, M1-PH4-T06 | H33 | Jobs invoked directly in tests |
| Retention job setting `anonymized_at` | Zikri M2-PH4-T03 | H40 | `anonymize_parcel` called directly by tests |
| Ops commands `purge-sessions`, `lock-accounts --from-file` | Naszrul M1-PH4-T05 | H42 | Manual SQL on a throwaway restore until delivered; real command before G4 |
| Zikri's grant snapshot and RLS runner for post-restore checks | Zikri M2-PH4-T01 | H45 | Local `psql` checks until delivered |
| `disable user` path for race with finalization | Naszrul M1-PH3-T02 | H31 | none |

Independent now: T01, T03, T06, T08, T09, T10.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH4-T01 | Fault-injection matrix for A17 final outcomes (core points FP1, FP4, FP5, FP7, FP9 are required; the rest are STRETCH) at the real boundaries (test doubles around the filesystem and transaction layers, not mocks of the whole service): staging write failure, validation failure, lock rejection, publish failure, function error after publish, connection drop before commit, commit succeeded with lost acknowledgment, response write failure, process crash after publish, crash after commit, storage read failure on A19. For each, assert HTTP result, parcel row, history, proof row, final and staging directories | Table of failpoints with expected state recorded in the test file | TC01 | PH3 |
| M3-PH4-T02 | Reconciliation job `proof_reconcile` in the runner using the revision `proof_maintenance_functions` helpers `lock_parcel_for_reconcile(parcel_id)` and `proof_key_is_referenced(parcel_id, key)` (hardened, maintenance role only; the maintenance role has no table access of its own): derive the parcel from the storage key path, take the same parcel lock finalization uses, wait (bounded) for the original transaction to settle, re-read committed `storage_key` references in a fresh READ COMMITTED statement while still holding the lock, delete only an unreferenced file older than 24 hours; preserve on lock timeout, missing context or database unavailability; also remove staging files older than 24 hours | Never deletes a committed or still-possible proof | TC02, TC03, TC14 | H13, H33 |
| M3-PH4-T03 | Delayed-original-transaction scenario (IT-D03): original transaction publishes file and delays commit; reconciler runs and initially sees no reference; transaction commits; reconciler must keep the file; second scenario with rollback shows deletion only after the age threshold | Barrier-driven, no sleeps | TC02 | T02 |
| M3-PH4-T04 | Proof purge job `proof_purge` consuming Zikri's `anonymized_at` through `list_proofs_to_purge(batch)` (anonymized parcels that still hold proof metadata): for parcels anonymized with a proof row, delete the file through `ProofStore`, then call `clear_proof_after_purge(parcel_id)`, which clears proof metadata and audits `PROOF_PURGED`; idempotent when the file is already gone; A19 denies access from the moment `anonymized_at` is set; batch size and logs with counts and opaque IDs only; honors backup lock | Interrupt before and after file deletion; denial holds throughout | TC04 | H40 |
| M3-PH4-T05 | Concurrency suites with barriers and separate connections: reassignment versus finalization from the same `expectedVersion`; two identical finalizations; DELIVERED versus FAILED simultaneously; two Admins assigning different Riders; assignment versus Rider disablement; finalization versus disablement; retention anonymization versus proof read | One valid winner each; no duplicate history or proof; loser gets 404/409 and its prepared file is cleaned; operations committed before disablement are valid | TC05, TC13 | H31 |
| M3-PH4-T06 | Upload attack corpus beyond the PH3 smoke set: polyglots, appended payloads, EXIF/GPS, large ICC and text chunks, CMYK and 16-bit variants, progressive JPEG, decompression bombs, extension-case and double extensions, Unicode and path-separator filenames, 15 concurrent uploads (memory bound), slow-body client (timeout aborts and cleans staging) | None stored served or executable; filename never used; output re-encoded | TC06 | PH3 |
| M3-PH4-T07 | Backup and restore tooling and local drill (the shared advisory lock in `unit_of_work` and the maintenance gate are built by M2-PH1-T03 and M1-PH3-T10; this task uses them): backup script as `backup_operator` holding a session-level `pg_advisory_lock` for the whole dump and archive with a bounded wait and a `trap` that clears the maintenance flag if the script dies; logical dump with the migration revision, proof directory archive, manifest with checksums, public-key encryption; restore script into an isolated Compose project (data-only: bootstrap roles, `alembic upgrade` to the manifest revision, `pg_restore --data-only --disable-triggers`, `verify_grants`), then Naszrul's `purge-sessions`, account journal reconciliation, retention rerun, and verification of counts, history, sample photo hashes, grants equal snapshot, revoked cookie 401, fresh login | Drill passes while retention and reconciliation jobs run near the backup moment | TC07, TC15, TC16 | H41, H42 |
| M3-PH4-T08 | Dashboard and proof endpoint hardening: dashboard consistency under concurrent writers, traversal encodings, `Range`/`HEAD` behavior, missing-file-with-row handling (generic 404/503, alert log), headers on error responses, method restrictions | Responses never leak paths, keys or stack traces | TC08, TC09 | PH3 |
| M3-PH4-T09 | Mobile browser regression with an interrupted network: abort the request after it is sent, lose connection mid-upload, throttled 4G profile, offline form retention; UI shows an uncertain state, refetches, never auto-resubmits, and reflects the committed state if it happened | Playwright phone project | TC10 | H10 |
| M3-PH4-T10 | P5 audit and log review for M3: assignment, reassignment, status change and proof events carry actor, time, parcel ID and request ID; no full addresses, phone numbers, filenames or file contents; canary scan across logs | Zero canary hits | TC11 | M1-PH4-T08 |
| M3-PH4-T11 | Coverage gates and consolidated execution: delivery backend (85 percent line, 80 percent branch) and frontend gates with required scenarios present (every legal and illegal transition edge, role matrix rows, file fault points); contribute matrix rows A14-A19 to Naszrul's harness; run M3-01 to M3-10, RLS-03, RLS-10 and M3 shares of S-rows on one commit and update the worksheet | No row marked Pass without execution | TC12 | H43 |

## 5 Affected components

`modules/delivery/{reconcile.py,purge.py,maintenance.py}`, `infra/backup/{backup,restore,verify}`, `backend/tests/integration/delivery/`, `tests/e2e/delivery/`, jobs in the runner, additive migrations only through the shared chain.

## 6 Security requirements

Verified: no committed proof without a valid durable file and vice versa, no deletion without lock and re-read, deny-before-delete for personal-data photos, concurrency safety, upload defense in depth, private non-executable storage, backup consistency, restore without session revival, maintenance rejection of writes during backup. Policies P1, P3, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH4-TC01 | Fault injection (IT-D03) | Failpoints FP1-FP11 on final outcomes | Pre-commit failures: DB unchanged, staging/final clean after confirmed rollback; unknown commit: file preserved; committed-but-response-lost: proof readable and referenced; crash orphans handled by reaper; read failure gives generic 503 | M3-08, INT-10 |
| M3-PH4-TC02 | Concurrency and fault (IT-D03) | Original transaction publishes then delays commit; reconciler starts; then commits (variant: rolls back) | Reconciler blocks or preserves; after commit it finds the reference and keeps the file; after rollback deletes only past the age threshold | INT-10, REV-13 |
| M3-PH4-TC03 | Fault (IT-D03) | Lock timeout; database unavailable; missing context during reconcile | File preserved; retry scheduled; no deletion | REV-13 |
| M3-PH4-TC04 | Operations (IT-P04, INT-11) | Purge after anonymization; interrupt before deletion and between deletion and metadata clear; request photo at each point | Photo denied at every point; resume completes; metadata cleared after file removal; history and counts unchanged | M2-10, M3-F05 |
| M3-PH4-TC05 | Concurrency (IT-D01/D02, INT-09) | Reassign vs finalize; duplicate finalize; DELIVERED vs FAILED; two Admins; retention vs read | Exactly one valid outcome; one proof; one history per change; loser's file cleaned; reads complete or 404, never partial | M3-10, INT-09 |
| M3-PH4-TC06 | Integration (IT-D02) | Hostile corpus incl. polyglots, bombs, odd filenames, 15 concurrent uploads, slow body | All hostile inputs rejected or sanitized; staging/final contain only valid re-encoded files; memory peak under budget; slow client aborted | M3-03, M3-04, M3-05 |
| M3-PH4-TC07 | Operations (OPS-04, OPS-05) | Backup with retention and reconcile jobs running; restore into isolated project; verification list in T07 | Backup waits for writers and jobs wait for backup; restored counts, history, photo hashes and grants match; old revoked cookie 401; fresh logins work; expired data re-anonymized | S-07, S-09, INT-12 prep |
| M3-PH4-TC08 | Integration (IT-D04) | Dashboard with 10 concurrent writers; compare each response with a snapshot; after INT-02/03 datasets | Each response internally consistent (sum equals total); final counts equal database | M3-F04 |
| M3-PH4-TC09 | Integration (IT-D04) | Proof endpoint with `%2e%2e`, double encoding, backslashes, `Range`, `HEAD`, wrong method, row without file | No traversal; safe behavior for Range/HEAD; generic 404/503; no paths or keys in any response | M3-05 |
| M3-PH4-TC10 | Browser (E2E-D03) | Phone project: abort after send; offline mid-upload; throttled 4G | Uncertain message; refetch; no automatic resubmission; committed result displayed; deliberate retry works only if not committed | M3-F03, INT-10 |
| M3-PH4-TC11 | Scan and review | Canary scan; inspect audit/log entries for M3 events; static scan of `modules/delivery` for string-built SQL | Actor, time, IDs present; no address/phone/filename; no SQL assembled from request values | S-05, P5, P4 |
| M3-PH4-TC12 | Consolidated run and CI gate | Execute M3-01..M3-10, RLS-03, RLS-10; coverage gates; matrix rows A14-A19 | Worksheet updated; gates enforced; missing scenario fails CI | rubric 3 |
| M3-PH4-TC13 | Concurrency (IT-D01, IT-A03) | Assign while the target Rider is being disabled; finalize while disabled | Consistent ordering: commit before disablement valid, later denied | P1, INT-05 |
| M3-PH4-TC14 | Operations (OPS-03) | Staging file 25 h old; final unreferenced 25 h old unlocked; referenced old file; young file; file under active upload lock | Only the unreferenced and settled old files removed | REV-08, REV-13 |
| M3-PH4-TC15 | Integration (OPS-04) | During the maintenance flag send A15 and A17 versus A01, A03, A04, A05, A13 and reads | `503 MAINTENANCE` for the business mutations; the allow-listed routes and reads work; recovery after release or expiry | REV-08 |
| M3-PH4-TC16 | Operations (OPS-04) | Kill the backup script mid-run; hold a writer past the bounded wait | Flag cleared by the trap or by expiry and writes resume within the timeout; the lock wait gives `503 MAINTENANCE`, not a hang | REV-08, D-15 |

## 8 Deliverables and handoffs

H41 (backup lock and scripts) to Naszrul (runner honors lock) and Zikri (post-restore verification); `proof_reconcile` and `proof_purge` jobs to the runner; matrix rows A14-A19 to Naszrul (H43). Zikri's retention job and Syauqi's purge job demonstrated together in INT-11.

## 9 Exit criteria

- T01-T11 complete; TC01-TC16 pass in CI on the same commit (STRETCH cases reported separately).
- Fault matrix complete with zero broken committed proofs; local restore drill passed including revoked-cookie replay.
- Worksheet rows M3-01 to M3-10, RLS-03 and RLS-10 have actual results.
- Contributes to G4 items 1-6.

## 10 Integration checkpoint

INT-04, INT-05, INT-09, INT-10, INT-11 and the local half of INT-12 run in CI/Compose together with Naszrul's and Zikri's suites; Zikri's grant snapshot includes migration 0006 functions; the runner executes all registered jobs.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Reconciler deletes a file whose transaction later commits | Prevented by lock-and-recheck; TC02 is a release blocker |
| Backup misses an in-flight proof | Exclusive lock drains shared holders; staged files excluded; drill verifies row/file agreement |
| Lock-wait deadlocks | Fixed lock order (accounts, then parcel); bounded timeouts; deadlock retry bounded and never duplicates data |
| Memory spike under concurrent uploads | Pixel and byte limits; concurrency cap in the upload handler; measured in TC06 |

## 12 Deferred work

EBS layout, S3 backup and lifecycle, scheduler timers, AWS restore exercise, Android/4G measurement, capacity sampling (PH5); final evidence (PH6).
