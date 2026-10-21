# Whole-project workflow trace

Each end-to-end workflow is traced through the phase plans. "First partial" is the earliest phase in which part of the workflow works; "complete and tested" is the phase at which the workflow works completely and its tests (including failure and race cases) pass locally; "on AWS" is where it is verified on the live stack. Planned only; nothing is implemented. See [integration scenarios](integration-tests.md) for the exact tests.

## Summary

| # | Workflow | First partial | Complete and tested (local) | On AWS | Scenarios |
| --- | --- | --- | --- | --- | --- |
| W1 | Seller registration and login, parcel registration, Admin assignment, Rider update and proof, public tracking, dashboard | PH2 (seeded login, parcel creation, seeded assignment, start delivery) | PH3 functionally complete (G3); PH4 hardened and tested (G4) | PH5 (G5) | INT-01, INT-02, INT-04, INT-07 |
| W2 | Failed delivery | PH3 | PH4 | PH5 | INT-03, INT-10 |
| W3 | Rider disablement, old-session rejection, reassignment of unfinished parcels | PH2 (stale session version rejected) | PH4 (races with in-flight writes) | PH5 | INT-05 |
| W4 | Password change or logout, session invalidation | PH2 (logout) | PH4 (multi-device, races, expiry) | PH5 | INT-06 |
| W5 | Retention, removal of recipient and photo data, preserved non-identifying history | PH3 (functions, photo denial after anonymization) | PH4 (scheduled job, purge, interruption) | PH5 (scheduled on AWS) | INT-11 |
| W6 | Backup and restore, consistent database and photos, no revived sessions | PH1 (lock design) and PH4 (local drill) | PH4 local drill; complete only after PH5 | PH5 (G5) | INT-12 |

## W1 Registration to dashboard

| Step | First works | Complete and tested | Key tasks | Key tests |
| --- | --- | --- | --- | --- |
| Seller registers (A02) | PH3 | PH4 | M1-PH3-T03 | M1-PH3-TC01 to TC05; M1-PH4-TC20 |
| Seller logs in, session, CSRF | PH2 | PH4 | M1-PH2-T02 to T06, T10 | M1-PH2-TC01 to TC15; M1-PH4-TC02, TC03 |
| Admin creates the Rider, Rider's forced password change, Rider directory (A08, A06, A07) | PH3 | PH4 | M1-PH3-T01, T04, T05, T06 | M1-PH3-TC08, TC10, TC12, TC17; M1-PH4-TC01 |
| Seller registers parcel (A10) | PH2 | PH4 (replay and fault cases PH3 and PH4) | M2-PH2-T02, T03, T05; M2-PH3-T01 | M2-PH2-TC01 to TC05; M2-PH3-TC01; M2-PH4-TC04, TC05 |
| Seller lists, searches, opens detail | PH2 | PH4 | M2-PH2-T04, T06; M2-PH3-T02, T03, T07 | M2-PH2-TC10, TC11; M2-PH3-TC03 to TC05 |
| Admin assigns Rider (A15) | PH2 seeded (TMP-02); real in PH3 | PH4 | M3-PH3-T03, T04, T09 (needs A07: M1-PH3-T01) | M3-PH3-TC01, TC02; M3-PH4-TC05 |
| Rider starts delivery | PH2 | PH4 | M3-PH2-T02 to T05 | M3-PH2-TC01 to TC09 |
| Rider finalizes with proof (A17) | PH3 | PH4 | M3-PH3-T05, T06, T10 | M3-PH3-TC04 to TC07; M3-PH4-TC01, TC02, TC06 |
| Seller and Admin view the proof photo (A19) | PH3 | PH4 | M3-PH3-T07, T10 | M3-PH3-TC08; M3-PH4-TC09 |
| Public tracking shows history | PH3 | PH4 | M2-PH3-T04 to T06 | M2-PH3-TC06 to TC10; M2-PH4-TC06 |
| Dashboard counts | PH3 | PH4 | M3-PH3-T08, T09 | M3-PH3-TC09, TC19; M3-PH4-TC08 |

Continuity checks: history rows written by Zikri's `create_parcel` and Qee's functions are the only history source for private detail, tracking and dashboard; no separate copy exists. Timestamps are server UTC and shown in Malaysia time. After INT-02 and INT-03 the five dashboard counts equal a direct database count.

## W2 Failed delivery

PH3: `FAILED` branch of `update_delivery_status` with one validated proof; `terminal_at` set, `delivered_at` null (M3-PH3-T06; M3-PH3-TC05). PH4: file/database fault matrix, concurrent DELIVERED vs FAILED, and retention interplay (M3-PH4-TC01, TC05). Public tracking shows the Failed status with timestamp only (M2-PH3-TC07). Retention applies 12 months after `terminal_at` (D-06) and is exercised in W5. PH5: repeated on the live URL (M3-PH5-TC08).

## W3 Disablement, rejection, reassignment

| Step | First works | Complete | Key tasks and tests |
| --- | --- | --- | --- |
| Stale `session_version` rejects old cookie | PH2 (database flag) | PH3 via A09 | M1-PH2-TC09, TC10; M1-PH3-TC11 |
| Admin disables Rider through UI/API | PH3 | PH4 | M1-PH3-T02; M1-PH3-TC11, TC17 |
| Unfinished parcels flagged | PH3 | PH3 | M3-PH3-T02, T11; M3-PH3-TC10 |
| Reassignment, new Rider completes, old history unchanged | PH3 | PH4 | M3-PH3-T03; M3-PH3-TC03, TC15 |
| Disablement versus in-flight write | PH4 | PH4 | M1-PH4-T03; M1-PH4-TC07; M3-PH4-TC13 |

## W4 Password change and logout

| Step | First works | Complete | Key tasks and tests |
| --- | --- | --- | --- |
| Logout revokes session | PH2 | PH4 | M1-PH2-T06; M1-PH2-TC06 |
| Password change revokes all sessions | PH3 | PH4 | M1-PH3-T06; M1-PH3-TC06, TC07; M1-PH4-TC04 |
| Must-change gate applies to M2 and M3 routes | PH3 | PH4 matrix | M1-PH3-T05; M1-PH3-TC08; M1-PH4-TC01 |
| Browser cache cleared on logout/account switch | PH2 | PH4 | M1-PH2-TC15; M1-PH4-TC15 |

## W5 Retention

| Step | First works | Complete | Key tasks and tests |
| --- | --- | --- | --- |
| Eligibility at 12 months, anonymization function | PH3 | PH4 | M2-PH3-T08; M2-PH3-TC12, TC13 |
| Photo access denied once `anonymized_at` is set | PH3 | PH4 | M3-PH3-T07; M3-PH3-TC08 |
| Scheduled job, purge of files, metadata clear, interruption | PH4 | PH4 | M2-PH4-T03; M3-PH4-T04; M2-PH4-TC12, TC13; M3-PH4-TC04 |
| Tracking history and dashboard counts preserved | PH4 | PH4 | M2-PH4-TC16; M2-PH4-TC13 (the PH3 functions are checked on tracking only; dashboard counts after anonymization are first asserted in PH4) |
| Scheduled on AWS, rerun after restore | PH5 | PH5 | M2-PH5-T04, T05; M3-PH5-T03; M2-PH5-TC05, TC06 |

## W6 Backup and restore

| Step | First works | Complete | Key tasks and tests |
| --- | --- | --- | --- |
| Coordination lock designed, prototype proved | PH1 | PH4 (implemented) | M3-PH1-T06; M3-PH1-TC06; M3-PH4-T07; M3-PH4-TC15 |
| Local backup and isolated restore drill | PH4 | PH4 | M3-PH4-T07; M3-PH4-TC07 |
| Sessions purged, locks re-applied, retention rerun, revoked cookie rejected | PH4 | PH5 | M1-PH4-T05 (journal reconciliation, quarantine); M1-PH4-TC11 (includes a web-path disablement and a password change after the snapshot); M1-PH5-T08; M1-PH5-TC07 |
| S3 backup, EBS persistence, AWS restore exercise | PH5 | PH5 | M3-PH5-T01, T02, T04, T05; M3-PH5-TC01, TC02, TC04, TC05 |
| Grants and RLS equal snapshot after restore | PH4 | PH5 | M2-PH4-T01; M2-PH5-T05; M2-PH5-TC06 |

The restore workflow is only "complete" after the AWS exercise: the local drill proves the procedure and consistency checks, not durable cloud backups or IAM controls.
