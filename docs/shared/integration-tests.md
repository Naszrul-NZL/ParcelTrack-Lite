# Integration scenarios and group test gates

This file is the single definition of the cross-module scenarios. It replaces the table that was in the [integration plan](integration-and-deployment.md). All scenarios start **Not run**; no test code exists. Each scenario lists the first phase where it works partially, the phase where it becomes complete and tested locally, the phase where it is repeated on the chosen cloud host, and the exact test cases that supply the evidence. A scenario is satisfied only when those tests pass; passing screens alone do not count.

Integration tests run on Docker Compose with the same images intended for deployment, against real PostgreSQL with restricted runtime roles, using synthetic fixtures ([testing strategy](testing-strategy.md)). Browser tests use separate contexts for each identity. A failed required scenario stays open and blocks the gate.

## Checkpoint scenarios (end of PH2)

| ID | Scenario | Required outcome | Lead | Evidence (test cases) | Gate |
| --- | --- | --- | --- | --- | --- |
| INT-CP-01 | Seeded Seller A and Rider A use real sessions on one database: Seller registers a parcel, refreshes and sees it; Rider A starts delivery on a seeded Assigned parcel; the change persists with Rider A and a server time | Parcel row, one REGISTERED history row, token shown; OUT_FOR_DELIVERY history row with actor and time; both persist after refresh | Syauqi compiles; Naszrul, Zikri, Syauqi | M1-PH2-TC15, M2-PH2-TC01, M2-PH2-TC14, M3-PH2-TC09, M3-PH2-TC01 | G2 |
| INT-CP-02 | Negative checks on the same stack | Wrong password and SQL-injection username fail generically; Seller B cannot fetch Seller A's parcel; Rider B cannot update Rider A's parcel; Seller cannot call a Rider or Admin endpoint; mutation without CSRF is rejected | Syauqi compiles | M1-PH2-TC03, M1-PH2-TC04, M1-PH2-TC07, M1-PH2-TC08, M2-PH2-TC10, M3-PH2-TC02, M3-PH2-TC07 | G2 |
| INT-CP-03 | Security baseline rows executed with actual results and disclosed gaps | Worksheet rows named in M1-PH2-T11, M2-PH2-T07 and M3-PH2-T06 show observed results; every other row stays Planned | Syauqi compiles | M3-PH2-T08 compilation, task evidence | G2 |

## Project scenarios

| ID | Scenario | Required outcome | Lead | First partial | Complete and tested (local) | On cloud | Evidence (test cases) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INT-01 | Seller registration, login, parcel creation | Account is Seller; one parcel and one REGISTERED history row persist after refresh; replay creates no duplicate | Naszrul + Zikri | PH2 (seeded Seller) | PH3 functional, PH4 hardened | PH5 | M1-PH3-TC01, M1-PH3-TC17, M2-PH3-TC16, M2-PH3-TC01, M2-PH4-TC04, M2-PH4-TC11, M2-PH5-TC09, M1-PH5-TC08 |
| INT-02 | Full Delivered journey | Seller registers; Admin assigns; assigned Rider starts and completes with photo; dashboard, public history and Seller's proof view agree | All | PH2 (seeded assignment up to Out for Delivery) | PH3 functional, PH4 hardened | PH5 | M3-PH3-TC14, M3-PH3-TC04, M3-PH4-TC01, M3-PH4-TC05, M3-PH4-TC08, M3-PH5-TC08 |
| INT-03 | Full Failed journey | Separate parcel reaches Failed with valid proof; history and counts agree; Delivered timestamp stays null | All | PH3 | PH3 functional, PH4 hardened | PH5 | M3-PH3-TC05, M3-PH3-TC14, M3-PH4-TC01, M3-PH5-TC08 |
| INT-04 | Cross-user reads and writes | Seller B and Rider B cannot retrieve or mutate another user's parcel, history or proof by direct ID; reassigned Rider loses access | Zikri + Syauqi | PH2 | PH4 (full matrix) | PH5 | M2-PH2-TC10, M3-PH2-TC02, M2-PH3-TC05, M2-PH3-TC15, M3-PH3-TC03, M3-PH3-TC08, M1-PH4-TC01, M2-PH5-TC09 |
| INT-05 | Rider disablement and reassignment | Old session fails; Admin reassigns unfinished work; new Rider completes; old history keeps original actors | Naszrul + Syauqi | PH2 (session_version rejection) | PH3 functional, PH4 races | PH5 | M1-PH2-TC09, M1-PH2-TC10, M1-PH3-TC11, M1-PH3-TC17, M3-PH3-TC03, M3-PH3-TC15, M1-PH4-TC05, M1-PH4-TC07, M3-PH4-TC13, M1-PH5-TC08, M3-PH5-TC08 |
| INT-06 | Session and CSRF lifecycle | Login rotates session and CSRF; logout and password change revoke sessions and private caches; concurrent login/refresh cannot revive revoked credentials | Naszrul | PH2 | PH3 (password change), PH4 (races, expiry) | PH5 | M1-PH2-TC02, M1-PH2-TC06, M1-PH2-TC07, M1-PH3-TC07, M1-PH4-TC02 to TC06, M1-PH4-TC15, M1-PH5-TC06, M1-PH5-TC08 |
| INT-07 | Public privacy | API, HTML, network, storage and logs across all five statuses and an anonymized parcel disclose only status and timestamps | Zikri | PH3 | PH3 functional, PH4 incl. logs | PH5 | M2-PH3-TC07, M2-PH3-TC09, M2-PH3-TC19, M2-PH4-TC06, M2-PH5-TC08 |
| INT-08 | Pooled connection isolation | Alternating user/anonymous transactions on one connection after commits, rollbacks and errors never leak identity | Zikri | PH2 | PH4 | PH5 (deployed credentials) | M2-PH1-TC04, M2-PH2-TC09, M2-PH4-TC01, M2-PH4-TC17, M2-PH5-TC04 |
| INT-09 | Duplicate and concurrent requests | Creation replay yields one parcel; conflicting assignment/finalization yields one valid winner without duplicate proof or history | Zikri + Syauqi | PH3 (replay) | PH4 | PH5 (smoke) | M2-PH3-TC01, M2-PH4-TC04, M2-PH4-TC05, M3-PH4-TC05, M3-PH5-TC08 |
| INT-10 | File and database failures | Controlled locking works under runtime privileges; storage, rollback, crash and unknown-commit cases preserve committed photos and clean only unreferenced files | Syauqi | PH3 (rollback compensation, RLS-10) | PH4 | PH5 (safe online checks) | M3-PH3-TC11, M3-PH3-TC21, M3-PH4-TC01 to TC03, M3-PH4-TC10, M3-PH4-TC14, M3-PH5-TC08, M3-PH5-TC09 |
| INT-11 | Retention interruption | Eligible recipient and photo data become inaccessible; cleanup resumes; tracking history and counts survive | Zikri + Syauqi | PH3 (functions, photo denial) | PH4 (job and purge) | PH5 (scheduled) | M2-PH3-TC12, M2-PH3-TC13, M2-PH4-TC12, M2-PH4-TC13, M3-PH4-TC04, M2-PH5-TC05, M3-PH5-TC09 |
| INT-12 | cloud first boot, restart and restore | Empty-volume bootstrap and migration work; rows, photos and RLS survive restart; matching restore purges sessions, re-applies locks and retention before reopening | All | PH4 (local drill, first boot in Compose) | PH5 | PH5 | M1-PH1-TC11, M2-PH1-TC02, M3-PH4-TC07, M1-PH5-TC01, M1-PH5-TC07, M2-PH5-TC01, M2-PH5-TC06, M3-PH5-TC04, M3-PH5-TC05 |

## Gate use

This table is the single list of scenarios per gate; the phase framework links here.

| Gate | Scenarios that must pass |
| --- | --- |
| G2 | INT-CP-01, INT-CP-02, INT-CP-03 |
| G3 | INT-01, INT-02, INT-03, INT-05 (functional path), INT-06 (login, logout and password-change legs), INT-07 (API and DOM), early INT-04 legs |
| G4 | INT-04, INT-05 (races), INT-06 (races, expiry), INT-07 (including logs), INT-08, INT-09, INT-10, INT-11, local half of INT-12 |
| G5a (MUST) | INT-01, INT-02, INT-03, INT-05, INT-06, INT-07, INT-08 on the live URL; INT-12 first-boot and restart legs |
| G5b (SHOULD, STRETCH) | INT-11 on schedule, safe online legs of INT-10, INT-12 restore leg |
| G6 | All scenarios re-run on the release candidate; recorded in the security test document |

## Scenario ownership and CI

- A scenario's lead keeps its Playwright spec and API-level steps in `tests/e2e/` or `tests/integration/cross_module/` and is the first person contacted when it fails; others fix defects in their own modules.
- Scenarios run in CI on each PR that touches the shared contract, migrations, security dependencies or more than one module. Remaining specs run nightly or on demand until G3, then on every PR to `main`.
- Failures retain private artifacts (traces, logs) containing synthetic data only.
- Capacity and timing checks use the project scale baseline (about 50 Sellers, 15 Riders, 2 Admins and 800 parcels per day); they record measurements on the chosen instance and do not claim more.

## Evidence record

For each run record: scenario ID, steps executed, exact inputs, expected and actual result, commit, release identifiers, migration revision, environment or live URL, timestamp, executor, safe artifact references. A planned outcome is never recorded as an actual result.
