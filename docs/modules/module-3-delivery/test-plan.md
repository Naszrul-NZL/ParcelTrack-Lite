# Module 3 test plan

Owner: Syauqi. Coverage plan for M3, the shared test harness and backup/restore, linked to phases, tasks and requirements. Every test below is planned; none has run. A phase cannot pass because its screens render: state, permission and file/database consistency cases must show their expected outcomes with evidence. Test case (TC) definitions live in the phase files; the index at the end is generated from them by `tools/check_plan_docs.py`.

Related: [testing strategy](../../shared/testing-strategy.md), [integration scenarios](../../shared/integration-tests.md), [traceability](../../shared/traceability.md), [security worksheet](../../security-tests.md).

## Rules

1. Tests are written with the feature in the same PR; hostile upload fixtures exist from PH1.
2. Integration tests use real PostgreSQL with runtime roles and a real private filesystem; file or transaction faults are injected around the real boundaries, not by mocking the service away.
3. For every fault case assert HTTP result, parcel row, history, proof row, and final and staging directories.
4. Concurrency uses barriers, never sleeps. A failed required test stays open.
5. Evidence per executed case: owner, TC and worksheet ID, input, expected, actual, commit, image, migration revision, environment, timestamp, safe artifact reference. Fixtures contain no personal data or real photos.

## Feature coverage

| Feature | PH2 | PH3 | PH4 | PH5 |
| --- | --- | --- | --- | --- |
| M3-F01 Assignment | - | M3-PH3-TC01, TC02, TC10, TC12 | M3-PH4-TC05, TC13 | M3-PH5-TC08 |
| M3-F02 Rider list | M3-PH2-TC05, TC06, TC08, TC09, TC15 | - | - | M3-PH5-TC06, TC08 |
| M3-F03 Outcomes and proof | M3-PH2-TC01 to TC04, TC07, TC12 | M3-PH3-TC04 to TC08, TC13, TC20, TC21 | M3-PH4-TC01 to TC03, TC06, TC09, TC10 | M3-PH5-TC06, TC08 |
| M3-F04 Dashboard | - | M3-PH3-TC09, TC12, TC19 | M3-PH4-TC08 | M3-PH5-TC08 |
| M3-F05 Continuity | - | M3-PH3-TC03, TC15 | M3-PH4-TC04, TC05, TC13, TC14 | M3-PH5-TC03, TC09 |
| Backup, restore, persistence | - | - | M3-PH4-TC07, TC15, TC16 | M3-PH5-TC01 to TC05, TC07 |

Foundation (PH1): M3-PH1-TC01 to TC08. Process and evidence: M3-PH3-TC16, TC17, TC18; M3-PH4-TC11, TC12; M3-PH6-TC01 to TC08.

## Security worksheet rows owned by M3

| Row | Cases | First executed |
| --- | --- | --- |
| M3-01 | M3-PH2-TC02, TC05; M3-PH4-TC05, TC13 | PH2 |
| M3-02 | M3-PH3-TC02, TC09 | PH3 |
| M3-03 | M3-PH3-TC06, TC20; M3-PH4-TC06 | PH3 |
| M3-04 | M3-PH3-TC07; M3-PH4-TC06 | PH3 |
| M3-05 | M3-PH1-TC04; M3-PH3-TC04, TC08; M3-PH4-TC09; M3-PH5-TC01 | PH3 |
| M3-06 | M3-PH1-TC02; M3-PH2-TC03, TC12 | PH2 |
| M3-07 | M3-PH2-TC01, TC13; M3-PH4-TC11 | PH2 |
| M3-08 | M3-PH3-TC04, TC06; M3-PH4-TC01 | PH3 |
| M3-09 | M3-PH1-TC02; M3-PH2-TC02 | PH2 |
| M3-10 | M3-PH4-TC05 | PH4 |

Also: RLS-03 (M3-PH2-TC05), RLS-10 (M3-PH3-TC11; M3-PH4-TC02), S-01 (M3-PH2-TC07), S-05 (M3-PH2-TC13; M3-PH4-TC11), S-07 (M3-PH4-TC07; M3-PH5-TC01, TC05), S-09 (M3-PH4-TC07; M3-PH5-TC04).

Rubric input types for criterion 3: `.php` and `shell.php.jpg` upload (M3-PH3-TC06); oversized image and pixel bomb (M3-PH3-TC07); invalid status value (M3-PH2-TC03); update on another Rider's parcel (M3-PH2-TC02); dashboard or assignment without Admin login (M3-PH3-TC02, TC09); Admin submitting Rider update (M3-PH2-TC02); concurrent final updates (M3-PH4-TC05); anonymous or traversal proof request (M3-PH3-TC08, M3-PH4-TC09).

## Test families owned by M3

| Family | Phases | Content |
| --- | --- | --- |
| UT-D01 to UT-D05 | PH1 to PH3 | State machine, assignment, proof input, recovery decisions, dashboard |
| IT-D01 to IT-D04 | PH2 to PH4 | Assignment, finalization, file/database faults, dashboard and photo |
| CMP-D01 to CMP-D03 | PH2 to PH3 | Rider list, admin screens, action panel and proof viewer |
| E2E-D01 to E2E-D04 | PH2 to PH5 | Rider slice, Delivered/Failed journeys, interrupted network, live URL |
| HAR-01; OPS-03 to OPS-09; MIG-01; FIX-01 contribution | PH1 to PH5 | Harness, jobs, backup lock, restore, persistence, capacity |

## CI gates for M3

| Phase | Jobs that must be green | Additional evidence |
| --- | --- | --- |
| PH1 | backend-unit (rules, ProofStore), harness self-test, file fixtures regenerate, drafts apply on scratch DB | G1 items 3, 5 |
| PH2 | + backend-integration (Rider cases), e2e-core phone project, authz-matrix rows A16/A17 | Rows from M3-PH2-T06; checkpoint evidence file |
| PH3 | + upload corpus smoke, fault compensation basic, dashboard consistency, CT-03 for A14-A19, E2E INT-02/03/05 | TMP-02 and TMP-05 gone |
| PH4 | + fault-injection matrix, reconciliation and purge jobs, concurrency suites, full corpus, backup lock tests, coverage gate | M3-01 to M3-10, RLS-03, RLS-10 consolidated; local restore drill |
| PH5 | + restore exercise, restart/redeploy, timers, 4G upload | Restore record with timings |
| PH6 | full regression on release candidate | Final test document M3 section |

## Test case index (generated)

<!-- BEGIN TC INDEX -->
| Test case | Phase | Type (family) | Maps to | Defined at |
| --- | --- | --- | --- | --- |
| M3-PH1-TC01 | PH1 | Harness (HAR-01) | S-03, REV-09 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC02 | PH1 | Unit (UT-D01) | M3-06, M3-09 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC03 | PH1 | Unit (UT-D02) | M3-F01, M3-F05 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC04 | PH1 | Unit (UT-D03/D04) | M3-05 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC05 | PH1 | Spike (UT-D03) | M3-03, M3-04 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC06 | PH1 | Integration (OPS-04 prototype) | REV-08 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC07 | PH1 | Migration (MIG-01) | M3-F03 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH1-TC08 | PH1 | Review | REV-13 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M3-PH2-TC01 | PH2 | Integration (IT-D01) | M3-07, M3-F03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC02 | PH2 | Integration (IT-D01) | M3-01, M3-09 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC03 | PH2 | Integration (UT-D01 link) | M3-06 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC04 | PH2 | Integration (IT-D01) | M3-F03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC05 | PH2 | RLS (RLS-03) | RLS-03, M3-01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC06 | PH2 | Integration (IT-D04 link) | M3-F02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC07 | PH2 | Integration (S-01) | S-01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC08 | PH2 | Component (CMP-D01) | M3-F02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC09 | PH2 | Browser (E2E-D01) | INT-CP-01, INT-CP-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC10 | PH2 | Integration (IT-A01 matrix) | authz matrix | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC11 | PH2 | Fixture (FIX-01) | TMP-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC12 | PH2 | Contract and integration | CT-01 extension | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC13 | PH2 | Integration (IT-A04 link) | S-05, P5 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC14 | PH2 | Integration (IT-A03 link) | M1-09 link | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH2-TC15 | PH2 | Static and integration | M3 parameterized queries, P4 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M3-PH3-TC01 | PH3 | Integration (IT-D01) | M3-F01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC02 | PH3 | Integration (IT-D01) | M3-02, M3-F01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC03 | PH3 | Integration (IT-D01) | M3-F05, INT-05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC04 | PH3 | Integration (IT-D02) | M3-F03, M3-05, M3-07, M3-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC05 | PH3 | Integration (IT-D02) | M3-F03, INT-03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC06 | PH3 | Integration (IT-D02) | M3-03, M3-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC07 | PH3 | Integration (IT-D02) | M3-04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC08 | PH3 | Integration (IT-D04) | M3-05, P3 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC09 | PH3 | Integration (IT-D04) | M3-F04, M3-02 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC10 | PH3 | Integration (IT-D01) | M3-F01, M3-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC11 | PH3 | RLS and integration (RLS-10) | RLS-10, REV-01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC12 | PH3 | Component (CMP-D02) | M3-F01, M3-F04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC13 | PH3 | Component (CMP-D03) | M3-F03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC14 | PH3 | Browser (E2E-D02) | INT-02, INT-03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC15 | PH3 | Browser (E2E-D02) | INT-05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC16 | PH3 | Contract (CT-03) | contract | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC17 | PH3 | CI check | TMP-02 retirement | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC18 | PH3 | Fixture (FIX-01) | G3 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC19 | PH3 | Unit (UT-D05) | M3-F04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC20 | PH3 | Integration (IT-D02) | M3-03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH3-TC21 | PH3 | Integration (IT-D03) | M3-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M3-PH4-TC01 | PH4 | Fault injection (IT-D03) | M3-08, INT-10 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC02 | PH4 | Concurrency and fault (IT-D03) | INT-10, REV-13 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC03 | PH4 | Fault (IT-D03) | REV-13 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC04 | PH4 | Operations (IT-P04, INT-11) | M2-10, M3-F05 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC05 | PH4 | Concurrency (IT-D01/D02, INT-09) | M3-10, INT-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC06 | PH4 | Integration (IT-D02) | M3-03, M3-04, M3-05 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC07 | PH4 | Operations (OPS-04, OPS-05) | S-07, S-09, INT-12 prep | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC08 | PH4 | Integration (IT-D04) | M3-F04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC09 | PH4 | Integration (IT-D04) | M3-05 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC10 | PH4 | Browser (E2E-D03) | M3-F03, INT-10 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC11 | PH4 | Scan and review | S-05, P5, P4 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC12 | PH4 | Consolidated run and CI gate | rubric 3 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC13 | PH4 | Concurrency (IT-D01, IT-A03) | P1, INT-05 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC14 | PH4 | Operations (OPS-03) | REV-08, REV-13 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC15 | PH4 | Integration (OPS-04) | REV-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH4-TC16 | PH4 | Operations (OPS-04) | REV-08, D-15 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M3-PH5-TC01 | PH5 | Operations | S-07, M3-05 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC02 | PH5 | Operations | P3 backup interpretation | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC03 | PH5 | Operations (OPS-03) | REV-08 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC04 | PH5 | Operations (OPS-07) | S-09, INT-12 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC05 | PH5 | Operations (OPS-06) | S-07 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC06 | PH5 | Operations / device | M3-F03 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC07 | PH5 | Operations (OPS-09) | capacity | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC08 | PH5 | Browser (E2E-D04) | rubric 1b | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH5-TC09 | PH5 | Operations | M2-10, REV-13 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M3-PH6-TC01 | PH6 | Regression | G6.2 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC02 | PH6 | Evidence review | rubric 3 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC03 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC04 | PH6 | Peer Q&A | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC05 | PH6 | Runbook test | S-07 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC06 | PH6 | Scan | P4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC07 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M3-PH6-TC08 | PH6 | Record check | G6.5 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
<!-- END TC INDEX -->
