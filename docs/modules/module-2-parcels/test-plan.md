# Module 2 test plan

Owner: Zikri. Coverage plan for M2 and the shared database boundary, linked to phases, tasks and requirements. Every test below is planned; none has run. A phase cannot pass because its screens render: RLS, privacy and data-consistency cases must show their expected outcomes with evidence. Test case (TC) definitions live in the phase files; the index at the end is generated from them by `tools/check_plan_docs.py`.

Related: [testing strategy](../../shared/testing-strategy.md), [integration scenarios](../../shared/integration-tests.md), [traceability](../../shared/traceability.md), [security worksheet](../../security-tests.md).

## Rules

1. Tests are written with the feature in the same PR.
2. RLS and privilege tests connect as `app_runtime`, `tracking_runtime` or `maintenance_runtime` and assert `current_user`; a connection as owner or superuser invalidates the test (negative control in the harness).
3. Public-tracking privacy is checked on API bodies, headers, DOM, network, storage, referrer and logs, for all five statuses and an anonymized parcel.
4. Concurrency uses barriers, never sleeps. A failed required test stays open.
5. Evidence per executed case: owner, TC and worksheet ID, input, expected, actual, commit, image, migration revision, environment, timestamp, safe artifact reference.

## Feature coverage

| Feature | PH2 | PH3 | PH4 | PH5 |
| --- | --- | --- | --- | --- |
| M2-F01 Register parcel | M2-PH2-TC01 to TC05, TC12 | M2-PH3-TC01, TC02, TC16 | M2-PH4-TC04, TC05, TC11 | M2-PH5-TC09 |
| M2-F02 Own list, search, detail | M2-PH2-TC10, TC11, TC13, TC14, TC17 | M2-PH3-TC03 to TC05, TC11, TC15, TC20 | M2-PH4-TC08, TC09 | M2-PH5-TC07 |
| M2-F03 Public tracking | - | M2-PH3-TC06 to TC10, TC19 | M2-PH4-TC06, TC07 | M2-PH5-TC07, TC08 |
| M2-F04 Retention | - | M2-PH3-TC12, TC13, TC18 | M2-PH4-TC12, TC13, TC16 | M2-PH5-TC05, TC06 |
| Shared DB boundary | M2-PH2-TC06 to TC09, TC15, TC16 | - | M2-PH4-TC01 to TC03, TC10, TC17 | M2-PH5-TC01 to TC04 |

Foundation (PH1): M2-PH1-TC01 to TC12. Process and evidence: M2-PH3-TC17; M2-PH4-TC14, TC15; M2-PH6-TC01 to TC08.

## Security worksheet rows owned by M2

| Row | Cases | First executed |
| --- | --- | --- |
| M2-01 | M2-PH3-TC03, TC14; M2-PH4-TC08 | PH3 |
| M2-02 | M2-PH2-TC12; M2-PH3-TC14; M2-PH4-TC08 | PH3 |
| M2-03 | M2-PH1-TC10; M2-PH2-TC03 | PH2 |
| M2-04 | M2-PH2-TC10, TC14; M2-PH3-TC15 | PH2 |
| M2-05 | M2-PH1-TC09; M2-PH2-TC01 | PH2 |
| M2-06 | M2-PH3-TC07, TC09; M2-PH4-TC06; M2-PH5-TC08 | PH3 |
| M2-07 | M2-PH3-TC08; M2-PH4-TC07; M2-PH5-TC08 | PH3 |
| M2-08 | M2-PH2-TC02 | PH2 |
| M2-09 | M2-PH1-TC08; M2-PH2-TC02 | PH2 |
| M2-10 | M2-PH3-TC12, TC13; M2-PH4-TC12, TC13; M2-PH5-TC05 | PH3 |

RLS rows: RLS-01 (M2-PH1-TC01; M2-PH4-TC01; M2-PH5-TC04), RLS-02 (M2-PH2-TC06), RLS-03 (M3-PH2-TC05 with M2-PH4-TC01), RLS-04 (M2-PH2-TC07), RLS-05 (M2-PH1-TC04; M2-PH2-TC09; M2-PH4-TC17), RLS-06 (M2-PH2-TC08), RLS-07 and RLS-08 (M2-PH3-TC06; M2-PH4-TC03), RLS-09 (M2-PH1-TC03, M2-PH4-TC02, TC03). M2 contributes to S-01 (M2-PH2-TC04), S-03 (M2-PH1-TC07), S-08, S-09 (M2-PH5-TC06).

Rubric input types for criterion 3: SQL injection in search (M2-PH3-TC03); XSS in address (M2-PH3-TC14, M2-PH4-TC08); invalid phone/weight (M2-PH2-TC03); changed parcel ID (M2-PH2-TC10); guessed or sequential tracking number (M2-PH1-TC09, M2-PH3-TC07); many rapid lookups (M2-PH3-TC08); forged seller ID (M2-PH2-TC02); wrong role registering a parcel (M2-PH2-TC02).

## Test families owned by M2

| Family | Phases | Content |
| --- | --- | --- |
| UT-P01 to UT-P04 | PH1 to PH3 | Parcel input, tracking and replay, data selection, privacy and retention |
| IT-P01 to IT-P04 | PH2 to PH4 | Atomic registration, read isolation, tracking, retention |
| RLS-01 to RLS-09 | PH1 to PH5 | Real-role RLS, privileges, function hardening, pooling |
| CMP-P01 to CMP-P04 | PH2 to PH3 | Registration, list, tracking, detail and search |
| E2E-P01 to E2E-P06 | PH2 to PH5 | Seller journey, tracking privacy, regression, live URL |
| CT-01; LINT-01; FIX-01; MIG-01 to MIG-03; OPS-03, OPS-06 to OPS-09 | PH1 to PH5 | Parity, hardening lint, fixtures, migrations, jobs, cloud |

## CI gates for M2

| Phase | Jobs that must be green | Additional evidence |
| --- | --- | --- |
| PH1 | backend-lint-type, backend-unit, backend-migrations (bootstrap, 0001, 0003 with role assertions), LINT-01, CT-01, fixture check | G1 items 2, 3, 4, 5 |
| PH2 | + backend-integration RLS cases (runtime roles), e2e-core Seller journey | Rows from M2-PH2-T07 executed |
| PH3 | + tracking privacy browser test, CT-03 for A10-A13, retention boundary tests | INT-01, INT-07 |
| PH4 | + grants-snapshot check, catalog hardening test, concurrency/fault suites, payload corpora, plan-shape check, upgrade test, coverage gate | M2-01 to M2-10 and RLS-01 to RLS-09 consolidated |
| PH5 | + `verify_grants` and RLS subset under deployed credentials, retention first run, live tracking checks | Restore database leg |
| PH6 | full regression on release candidate | Final test document M2 section |

## Test case index (generated)

<!-- BEGIN TC INDEX -->
| Test case | Phase | Type (family) | Maps to | Defined at |
| --- | --- | --- | --- | --- |
| M2-PH1-TC01 | PH1 | Integration (RLS-01) | RLS-01, REV-07 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC02 | PH1 | Migration (MIG-02) | REV-06, REV-07 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC03 | PH1 | Lint (LINT-01) | RLS-09 prep | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC04 | PH1 | Integration (RLS-05 skeleton) | RLS-05 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC05 | PH1 | Contract (CT-01) | contract | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC06 | PH1 | Migration (MIG-01) | M2-F01, RLS-01 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC07 | PH1 | Fixture (FIX-01) | S-03, P4 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC08 | PH1 | Unit (UT-P04) | M2-06, M2-09 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC09 | PH1 | Unit (UT-P02) | M2-05 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC10 | PH1 | Unit (UT-P01) | M2-03 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC11 | PH1 | Integration (RLS-04, RLS-05) | RLS-04, RLS-05 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH1-TC12 | PH1 | Integration | RLS-06, RLS-09 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M2-PH2-TC01 | PH2 | Integration (IT-P01) | M2-F01, M2-05 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC02 | PH2 | Integration (IT-P01) | M2-08, M2-09, RLS-06 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC03 | PH2 | Unit and integration (UT-P01) | M2-03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC04 | PH2 | Integration (S-01) | S-01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC05 | PH2 | Integration (IT-P01) | M2-F01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC06 | PH2 | RLS (RLS-02) | RLS-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC07 | PH2 | RLS (RLS-04) | RLS-04 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC08 | PH2 | RLS (RLS-06 partial) | RLS-06, RLS-09 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC09 | PH2 | RLS (RLS-05) | RLS-05, INT-08 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC10 | PH2 | Integration (IT-P02) | M2-04, P1 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC11 | PH2 | Integration (IT-P02) | M2-F02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC12 | PH2 | Component (CMP-P01) | M2-F01, M2-02 prep | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC13 | PH2 | Component (CMP-P02) | M2-F02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC14 | PH2 | Browser (E2E-P01) | INT-CP-01, INT-CP-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC15 | PH2 | Integration (IT-A01 matrix) | authz matrix | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC16 | PH2 | Fixture (FIX-01) | TMP-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH2-TC17 | PH2 | Static and integration (UT-P03) | M2-01 prep, P4 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M2-PH3-TC01 | PH3 | Integration and concurrency (IT-P01) | M2-F01, INT-09 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC02 | PH3 | Unit (UT-P02) | P3 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC03 | PH3 | Integration (IT-P02) | M2-01, M2-F02 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC04 | PH3 | Unit and integration (UT-P03) | M2-F02 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC05 | PH3 | Integration (IT-P02) | M2-F02, M3-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC06 | PH3 | RLS (RLS-07, RLS-08) | RLS-07, RLS-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC07 | PH3 | Integration (IT-P03) | M2-06, M2-F03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC08 | PH3 | Integration (UT-A05 link) | M2-07 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC09 | PH3 | Browser (E2E-P02) | M2-06, INT-07 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC10 | PH3 | Component (CMP-P03) | M2-F03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC11 | PH3 | Component (CMP-P04) | M2-F02 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC12 | PH3 | Integration (IT-P04) | M2-10, M2-F04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC13 | PH3 | Integration (IT-P04) | M2-10 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC14 | PH3 | Integration / static | M2-01, M2-02, P4 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC15 | PH3 | Integration (IT-P02) | M2-04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC16 | PH3 | Browser (E2E-P03) | INT-01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC17 | PH3 | Contract (CT-03) | contract | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC18 | PH3 | Fixture (FIX-01) | G3 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC19 | PH3 | Integration (IT-P03) | M2-05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH3-TC20 | PH3 | Integration (IT-P02) | SRC-08, D-37 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M2-PH4-TC01 | PH4 | RLS suite (RLS-01..09) | RLS-01..RLS-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC02 | PH4 | CI gate | RLS-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC03 | PH4 | Catalog and lint (LINT-01) | RLS-09, RLS-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC04 | PH4 | Concurrency (IT-P01) | M2-F01, INT-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC05 | PH4 | Fault injection (IT-P01) | INT-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC06 | PH4 | Browser and logs (E2E-P05) | M2-06, INT-07, P3 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC07 | PH4 | Integration (UT-A05 link) | M2-07 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC08 | PH4 | Corpus (IT-P02, E2E-P05) | M2-01, M2-02, M2-04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC09 | PH4 | Performance plan check | capacity | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC10 | PH4 | Migration (MIG-03) | REV-06 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC11 | PH4 | Browser (E2E-P04) | M2-F01, S-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC12 | PH4 | Operations (OPS-03) | M2-10, REV-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC13 | PH4 | Cross-module (IT-P04, INT-11) | INT-11, M2-10 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC14 | PH4 | CI gate | testing strategy | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC15 | PH4 | Consolidated run | rubric 3 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC16 | PH4 | Integration | M2-F04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH4-TC17 | PH4 | RLS and pooling | RLS-05 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M2-PH5-TC01 | PH5 | Operations (OPS-06) | REV-06, REV-07 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC02 | PH5 | Operations (OPS-08) | RLS-09 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC03 | PH5 | Operations | S-02, S-07 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC04 | PH5 | Operations (OPS-08) | RLS-01..RLS-09 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC05 | PH5 | Operations (OPS-03) | M2-10, INT-11 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC06 | PH5 | Operations (OPS-07) | S-09, INT-12 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC07 | PH5 | Operations (OPS-09) | capacity | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC08 | PH5 | Browser and operations (E2E-P06) | M2-06, M2-07 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH5-TC09 | PH5 | Browser (E2E-P06) | rubric 1b | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M2-PH6-TC01 | PH6 | Regression | G6.2 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC02 | PH6 | Evidence review | rubric 3 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC03 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC04 | PH6 | Peer Q&A | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC05 | PH6 | Evidence review | P3 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC06 | PH6 | Scan | P4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC07 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M2-PH6-TC08 | PH6 | Record check | G6.5 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
<!-- END TC INDEX -->
