# Module 1 test plan

Owner: Naszrul. Coverage plan for M1 linked to phases, tasks and requirements. Every test below is planned; none has run. A phase cannot pass because its screens render or because test counts look high: each listed case must show its expected outcome with evidence. Test case (TC) definitions live in the phase files; the index at the end is generated from them by `tools/check_plan_docs.py`.

Related: [testing strategy](../../shared/testing-strategy.md), [integration scenarios](../../shared/integration-tests.md), [traceability](../../shared/traceability.md), [security worksheet](../../security-tests.md).

## Rules

1. Tests are written with the feature in the same PR (security and tests start with the first feature).
2. Integration tests use real PostgreSQL and the actual runtime roles with a role assertion in the fixture; password stubs are allowed only in isolated unit tests, never in the session pipeline.
3. Authorization expectations come from the contract, not from the implementation.
4. A failed required test stays open with owner and reproduction; reruns do not mask defects.
5. Evidence per executed case: owner, TC and worksheet ID, input, expected, actual, commit, image, migration revision, environment, timestamp, safe artifact reference.

## Feature coverage

| Feature | PH2 | PH3 | PH4 | PH5 |
| --- | --- | --- | --- | --- |
| M1-F01 Seller registration | - | M1-PH3-TC01 to TC05, TC14, TC17, TC20 | M1-PH4-TC13, TC20 | M1-PH5-TC08 |
| M1-F02 Login and logout | M1-PH2-TC01 to TC15, TC17 to TC22 | - | M1-PH4-TC02 to TC09, TC12, TC15, TC21 | M1-PH5-TC06, TC08, TC12 |
| M1-F03 Admin creates Riders | - | M1-PH3-TC08, TC10, TC17, TC23, TC24 | M1-PH4-TC01 | M1-PH5-TC08 |
| M1-F04 Change password | - | M1-PH3-TC06, TC07, TC15 | M1-PH4-TC04 | M1-PH5-TC08 |
| M1-F05 User management and audit | M1-PH2-TC09, TC10 | M1-PH3-TC09, TC11, TC12, TC13, TC16, TC17, TC22 | M1-PH4-TC05, TC07, TC10, TC11 | M1-PH5-TC08, TC11 |
| Foundation | - | - | - | - |

Foundation (PH1) cases: M1-PH1-TC01 to TC15. Operations and process cases: M1-PH3-TC19, TC21, TC25; M1-PH4-TC16, TC17, TC19, TC22, TC23; M1-PH5-TC01 to TC05, TC07, TC09 to TC11; M1-PH6-TC01 to TC08.

## Security worksheet rows owned by M1

| Row | Cases | First executed |
| --- | --- | --- |
| M1-01 | M1-PH2-TC03; M1-PH4-TC14, TC18 | PH2 |
| M1-02 | M1-PH1-TC04; M1-PH3-TC01, TC04 | PH3 |
| M1-03 | M1-PH1-TC04; M1-PH2-TC01, TC17 | PH2 |
| M1-04 | M1-PH2-TC04, TC05; M1-PH4-TC08, TC09; M1-PH5-TC04 | PH2 |
| M1-05 | M1-PH3-TC09; M1-PH4-TC01 | PH3 |
| M1-06 | M1-PH3-TC16, TC20; M1-PH4-TC13 | PH3 |
| M1-07 | M1-PH2-TC02, TC06; M1-PH4-TC02 | PH2 |
| M1-08 | M1-PH3-TC02 | PH3 |
| M1-09 | M1-PH2-TC09, TC10; M1-PH3-TC11, TC17; M1-PH4-TC05, TC07 | PH3 |
| M1-10 | M1-PH3-TC06 | PH3 |
| M1-11 | M1-PH4-TC04, TC05, TC06 | PH4 |
| M1-12 | M1-PH4-TC10; M1-PH5-TC11 | PH4 |

M1 contributes to shared rows S-01 (M1-PH2-TC07, TC19; M1-PH4-TC20), S-02 (M1-PH4-TC12, TC21; M1-PH5-TC06), S-03 (M1-PH1-TC03, TC12; M1-PH4-TC14), S-04, S-05, S-06 (M1-PH4-TC19), S-08 and S-09 (M1-PH4-TC11; M1-PH5-TC07). See [traceability section F](../../shared/traceability.md#f-security-worksheet-rows-51-to-phases-and-test-cases).

Rubric input types for criterion 3 (more than five required): SQL injection in username (TC M1-PH2-TC03); weak or short password (M1-PH3-TC01); repeated wrong passwords (M1-PH2-TC05); script in name field (M1-PH3-TC16, M1-PH4-TC13); opening an Admin page as Seller (M1-PH3-TC09); role injection at registration (M1-PH3-TC02); missing/forged CSRF (M1-PH4-TC20); reuse of logged-out or expired session (M1-PH2-TC06, M1-PH4-TC03).

## Test families owned by M1

| Family | Phases | Content |
| --- | --- | --- |
| UT-A01 to UT-A05 | PH1 to PH3 | Account input, session lifecycle, auth decisions, safe output, rate windows |
| IT-A01 to IT-A04 | PH2 to PH4 | Accounts, sessions, locking and races, audit and limits |
| CMP-A01 to CMP-A05 | PH1 to PH3 | API client, session provider, login, register, password, admin users |
| E2E-A01 to E2E-A04 | PH2 to PH5 | Role login journeys, admin/rider onboarding, regression, live URL |
| CT-01, CT-02, CT-03; MIG-01; OPS-01, OPS-03, OPS-06 to OPS-09; HAR-01 use | PH1 to PH5 | Contract parity, production refuses test principal, conformance, migrations, runner, AWS |

## CI gates for M1

| Phase | Jobs that must be green | Additional evidence |
| --- | --- | --- |
| PH1 | backend-lint-type, backend-unit, backend-migrations, backend-integration (harness), ci-contract, frontend-check, compose-smoke, secret-scan | G1 items 1, 2, 3, 6 |
| PH2 | + backend-integration (real PostgreSQL, runtime roles), e2e-core (login journeys), authz-matrix | Worksheet rows from M1-PH2-T11 with actual results |
| PH3 | + ci-contract (CT-03 for A01-A09, A20), runner self-test | TMP-01 and TMP-03 gone; INT-01, INT-05, INT-06 legs |
| PH4 | + race suite, canary scan, dependency-audit blocking, coverage gate (85 percent line, 80 percent branch backend; 80/75 frontend) | M1-01 to M1-12 consolidated; incident tabletop |
| PH5 | + live-URL smoke, first-boot and restore operations tests | HTTPS cookie flags, port scan, rollback rehearsal, restore session check |
| PH6 | full regression on release candidate | Final test document M1 section |

## Test case index (generated)

<!-- BEGIN TC INDEX -->
| Test case | Phase | Type (family) | Maps to | Defined at |
| --- | --- | --- | --- | --- |
| M1-PH1-TC01 | PH1 | Unit (UT-A04) | S-04 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC02 | PH1 | Unit (UT-A04) | S-05, P4 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC03 | PH1 | Unit | S-03 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC04 | PH1 | Unit (UT-A01) | M1-02, M1-03 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC05 | PH1 | Migration (MIG-01) | M1-F01, REV-07 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC06 | PH1 | Integration (IT-A03, RLS-09 prep) | RLS-09 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC07 | PH1 | Contract (CT-02) | M1-F02 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC08 | PH1 | Component (CMP-A01) | S-01, S-08 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC09 | PH1 | Component (CMP-A01) | M1-F02 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC10 | PH1 | Contract (CT-01) | contract | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC11 | PH1 | Operations (OPS-01) | G1.1 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC12 | PH1 | CI | G1.6 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC13 | PH1 | Unit | S-08 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC14 | PH1 | Integration (RLS-01, RLS-06 prep) | RLS-01, RLS-06 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH1-TC15 | PH1 | Integration | S-02, S-08 | [PH1-foundation.md](phases/PH1-foundation.md) |
| M1-PH2-TC01 | PH2 | Integration (IT-A02) | S-02 (local), M1-03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC02 | PH2 | Integration (IT-A02) | M1-07 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC03 | PH2 | Integration (IT-A04) | M1-01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC04 | PH2 | Integration | M1-04, P5 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC05 | PH2 | Unit and integration (UT-A05) | M1-04 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC06 | PH2 | Integration (IT-A02) | M1-07 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC07 | PH2 | Integration (IT-A02) | S-01 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC08 | PH2 | Integration (IT-A03) | M1-05 (prep), P1 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC09 | PH2 | Integration (RLS-04 link) | M1-09 prep, RLS-04 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC10 | PH2 | Integration | M1-09 prep | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC11 | PH2 | Unit (UT-A02) | S-02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC12 | PH2 | Integration (IT-A04) | S-05, P5 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC13 | PH2 | Unit (UT-A04) | S-04 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC14 | PH2 | Component (CMP-A02) | M1-F02 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC15 | PH2 | Browser (E2E-A01) | M1-F02, S-08 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC16 | PH2 | Integration / static | TMP-01 retirement | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC17 | PH2 | Integration | M1-03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC18 | PH2 | Integration (IT-A01 matrix) | authz matrix | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC19 | PH2 | Integration | S-01, rate limits | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC20 | PH2 | Integration (UT-A05) | M1-04 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC21 | PH2 | Integration (capacity) | M1-04, P4 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH2-TC22 | PH2 | Integration (IT-A01) | M1-F03 | [PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) |
| M1-PH3-TC01 | PH3 | Integration (IT-A01) | M1-02, M1-F01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC02 | PH3 | Integration (IT-A01) | M1-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC03 | PH3 | Integration (IT-A01) | M1-F01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC04 | PH3 | Unit (UT-A01) | M1-F01, P2 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC05 | PH3 | Integration (UT-A05) | M1-04 related | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC06 | PH3 | Integration (IT-A02) | M1-10, M1-F04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC07 | PH3 | Integration (IT-A02/A03) | M1-F04, INT-06 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC08 | PH3 | Integration (IT-A01) | M1-F03, REV gate | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC09 | PH3 | Integration (IT-A03) | M1-05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC10 | PH3 | Integration (IT-A01) | M1-F03 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC11 | PH3 | Integration (IT-A03) | M1-09, M1-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC12 | PH3 | Integration (IT-A04) | M1-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC13 | PH3 | Integration | M1-F05, P5 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC14 | PH3 | Component (CMP-A03) | M1-F01 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC15 | PH3 | Component (CMP-A04) | M1-F04 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC16 | PH3 | Component (CMP-A05) | M1-06, M1-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC17 | PH3 | Browser (E2E-A02) | M1-F01, M1-F03, M1-F05, INT-05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC18 | PH3 | Contract (CT-03) | contract | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC19 | PH3 | Operations (OPS-03 skeleton) | REV-08 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC20 | PH3 | Unit (UT-A04) | M1-06 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC21 | PH3 | Operations | rubric 1b | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC22 | PH3 | Integration (IT-A03) | M1-F05 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC23 | PH3 | Integration (IT-A01) | M1-F05, P1 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC24 | PH3 | Integration | M1-F03, P1 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH3-TC25 | PH3 | Integration (OPS-04) | REV-08, D-15 | [PH3-complete-functionality.md](phases/PH3-complete-functionality.md) |
| M1-PH4-TC01 | PH4 | Integration (IT-A01 matrix) | P1, M1-05, INT-04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC02 | PH4 | Integration (IT-A02) | M1-07 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC03 | PH4 | Integration (IT-A02) | S-02 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC04 | PH4 | Concurrency (IT-A03) | M1-11 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC05 | PH4 | Concurrency (IT-A03) | M1-11, M1-09 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC06 | PH4 | Concurrency (IT-A03) | M1-11 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC07 | PH4 | Concurrency (IT-A03) | INT-05, P1 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC08 | PH4 | Integration (IT-A04) | P5, M1-04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC09 | PH4 | Integration (IT-A04) | M1-04 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC10 | PH4 | Integration (IT-A03) | M1-12, REV-10 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC11 | PH4 | Integration | S-09, P1, P2 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC12 | PH4 | Integration / browser | S-02, S-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC13 | PH4 | Browser (E2E-A03) | M1-06 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC14 | PH4 | Operations / scan | S-03, S-04, S-05, M1-01 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC15 | PH4 | Browser (E2E-A03) | S-08, INT-06 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC16 | PH4 | Operations (OPS-03) | REV-08 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC17 | PH4 | CI gate | testing strategy gates | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC18 | PH4 | Consolidated run | rubric criterion 3 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC19 | PH4 | Review | S-06, P5 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC20 | PH4 | Integration (S-01) | S-01 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC21 | PH4 | Integration | S-02 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC22 | PH4 | Operations (OPS-03) | P5, S-06 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH4-TC23 | PH4 | Operations / tooling | SRC-17, rubric 3 | [PH4-hardening-regression.md](phases/PH4-hardening-regression.md) |
| M1-PH5-TC01 | PH5 | Operations (OPS-06) | INT-12, REV-06 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC02 | PH5 | Operations (OPS-06) | REV-07, S-03 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC03 | PH5 | Operations | release plan | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC04 | PH5 | Operations | M1-04, M2-07 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC05 | PH5 | Operations / scan | S-03 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC06 | PH5 | Operations (S-02) | S-02 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC07 | PH5 | Operations (OPS-07) | S-09, INT-12 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC08 | PH5 | Browser (E2E-A04) | rubric 1b | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC09 | PH5 | Operations (OPS-09) | capacity | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC10 | PH5 | Process | EXT-03 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC11 | PH5 | Operations | P5, S-06 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH5-TC12 | PH5 | Operations | S-08 | [PH5-aws-operations.md](phases/PH5-aws-operations.md) |
| M1-PH6-TC01 | PH6 | Regression | G6.2 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC02 | PH6 | Evidence review | rubric 3 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC03 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC04 | PH6 | Peer Q&A | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC05 | PH6 | Evidence review | EXT-01, EXT-02 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC06 | PH6 | Scan | P4, S-03 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC07 | PH6 | Rehearsal | rubric 4 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
| M1-PH6-TC08 | PH6 | Record check | G6.5 | [PH6-final-acceptance.md](phases/PH6-final-acceptance.md) |
<!-- END TC INDEX -->
