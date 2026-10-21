# M2 PH4: Security, failure handling and regression coverage

Owner: Zikri. Phase PH4 of [phase framework](../../../shared/phase-framework.md). Status: Planned. PH4 verifies and extends controls introduced in PH2/PH3; essential authentication, ownership and privacy controls already exist.

## 1 Objective

M2 and the shared database boundary pass hostile, concurrent and failure conditions with evidence: the complete RLS and privilege suites, grant snapshot, function-hardening enforcement across all modules, scheduled retention that anonymizes recipient data and denies photo access before deletion, retry/rollback correctness, public-tracking privacy including logs, rate-limit boundaries, injection and XSS corpora, and query plans at project scale.

## 2 Entry criteria

- G3 passed; contract frozen; TMP-xx all retired.
- Maintenance runner skeleton available (M1-PH3-T10); Syauqi's `delivery_proof` and finalization exist for cross-module cases.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Runner skeleton and backup-lock check | Naszrul M1-PH3-T10 | H33 | none |
| Proof purge job and proof endpoint behavior after anonymization | Syauqi M3-PH4-T04, T08 | H46 | Retention job proven on parcels without proof until Syauqi's job lands |
| `lock_delivery_target`, reconciliation helper in the privilege catalog | Syauqi M3-PH3-T01, M3-PH4-T02 | H35 | catalog test lists them as expected-missing until merged |
| Authorization-matrix runner | Naszrul M1-PH2-T12 | H24 | none |

Independent now: T01, T02, T06, T08.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH4-T01 | Complete RLS and privilege suites RLS-01 to RLS-09 (RLS-03 and RLS-10 jointly with Syauqi): runtime role attributes/memberships/ownership/forced RLS, unfiltered reads for Seller A, Seller B, Rider, Admin and anonymous, direct DML denial, forged IDs at function layer, parent/child policy behavior for history and proof, no policy recursion, pooled reuse after commit/rollback/error, client-supplied context settings never accepted; generate `grants.snapshot.json` from the catalog and compare in CI (changes require explicit review under CODEOWNERS); author the bootstrap-invocation and `verify_grants` scripts here so Naszrul's first-boot script and the cloud runs reuse them (H52) and publish the snapshot to Syauqi and Naszrul (H45) | Run only as `app_runtime`/`tracking_runtime`/`maintenance_runtime`, never as owner or superuser | TC01, TC02, TC17 | PH3 |
| M2-PH4-T02 | Function-hardening enforcement across every module: catalog test over all `SECURITY DEFINER` functions (and a branch table for each function: every `RAISE` and branch mapped to a named test, CI failing when a row has none) (non-login owner, no bypass, fixed `search_path` with `pg_temp` last, PUBLIC execute revoked, grants equal snapshot, no dynamic SQL from arguments) plus hostile temporary-object shadowing for each function; LINT-01 covers all migrations | Adding a function without hardening fails CI | TC03 | Syauqi, Naszrul migrations |
| M2-PH4-T03 | Retention job `retention_anonymize` in the maintenance runner: daily batch (default 50) of `list_retention_candidates`, one `anonymize_parcel` transaction per parcel, advisory lock so only one copy runs, resumes after interruption, respects backup lock, logs counts and opaque IDs only; photo access is denied from the moment `anonymized_at` is set (Syauqi's A19 checks it) | Deny-before-delete holds at every interruption point | TC12, TC13 | H33, H46 |
| M2-PH4-T04 | Concurrency and rollback matrix for registration: 20 parallel identical requests; parallel distinct requests; forced tracking-token collisions with bounded retries (exhaustion gives a generic error and no partial rows); failpoints at each statement of `create_parcel`; commit then response loss followed by replay returns the original | No duplicate or partial parcel/history/audit rows; barriers not sleeps | TC04, TC05 | PH3 |
| M2-PH4-T05 | Privacy regression for public tracking across all five statuses and anonymized records: response bodies and headers, rendered DOM, console, network, storage, referrer; server logs and proxy-style access logs searched for canary tracking tokens and recipient strings; error responses for malformed and unknown tokens | Only status/timestamps disclosed anywhere (INT-07) | TC06, TC16 | Naszrul headers (M1-PH4-T07) |
| M2-PH4-T06 | Rate-limit boundaries for A13 and registration: threshold minus one, at, over; reset after window with controlled clock; two server processes share the counter; forged forwarding headers ignored; no database errors under burst | M2-07 passes under multi-process | TC07 | H21 |
| M2-PH4-T07 | Payload corpora (`tests/fixtures/payloads/`) plus tools: Bandit or Semgrep on `modules/parcels`, sqlmap and OWASP ZAP baseline against A10 fields, A11 `q`, A12 id and A13 on the Compose stack (outputs stored for the test document): SQL injection, XSS (script, event handlers, SVG, attribute breakouts), oversized and Unicode strings (RTL, zero-width, combining marks, emoji), path-parameter abuse (`1 OR 1=1`, `../`, integer overflow); API assertions plus browser rendering in the Seller list, detail, tracking page and, with Syauqi/Naszrul, the Admin parcel list and audit panel | No 500s, no execution, no broadened results | TC08 | Syauqi M3-PH3-T09 |
| M2-PH4-T08 | Scale-data plan check (local): generate synthetic history of 30 000 parcels (required) and, as STRETCH, about 300 000 parcels and 1.2 million history rows (roughly one year at 800 parcels per day), run `EXPLAIN (ANALYZE, BUFFERS)` for Seller list/search, tracking lookup, detail, Admin parcel list, dashboard aggregate, retention candidate selection; add additive indexes through reviewed migrations if plans scan whole tables | Index-based plans for the queries listed; timings recorded, not guaranteed | TC09 | Syauqi queries |
| M2-PH4-T09 | Upgrade test: tag the checkpoint schema, load synthetic data, upgrade to head, verify RLS, functions, sessions and smoke journey (MIG-03); repeat for each released schema | Upgrade passes with data | TC10 | PH3 |
| M2-PH4-T10 | M2 browser regression and coverage gates: Playwright journeys (registration, interrupted network replay, search, detail, tracking all statuses, Seller isolation, logout cache clearing); backend and frontend coverage thresholds for parcels code with required scenario lists | Gates enforced in CI | TC11, TC14 | H10 |
| M2-PH4-T11 | Contribute matrix rows for A10-A13 (and A12 per role) to Naszrul's harness; consolidated execution of M2-01 to M2-10 and RLS-01 to RLS-09 on one commit; update worksheet actual results with evidence | Rows complete; no unexecuted row marked Pass | TC15 | H43 |

## 5 Affected components

`backend/tests/integration/{rls,parcels,cross_module}`, `backend/app/modules/parcels/jobs.py`, `tests/fixtures/payloads/`, `infra/db/grants.snapshot.json`, `tests/e2e/parcels/`, additive indexes via migration.

## 6 Security requirements

Verified: RLS isolation under pooling and failures, privilege minimization, hardened definer functions, public privacy including logs, throttling, injection/XSS resistance, retention with deny-before-delete, atomic registration, migration safety. Policies P1, P3, P4 (and P5 for retention logs without personal data).

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH4-TC01 | RLS suite (RLS-01..09) | All sub-assertions listed in T01 using real runtime roles | Pass; no run as owner or superuser (asserted by `current_user` check) | RLS-01..RLS-09 |
| M2-PH4-TC02 | CI gate | Change a grant without updating `grants.snapshot.json` | CI fails; reviewer approval required to update | RLS-09 |
| M2-PH4-TC03 | Catalog and lint (LINT-01) | Introduce an unhardened definer function in a test migration; hostile `pg_temp` objects for each function | Lint and catalog test fail; shadowing has no effect on legitimate functions | RLS-09, RLS-08 |
| M2-PH4-TC04 | Concurrency (IT-P01) | 20 parallel identical creations; 20 distinct; colliding generator | One parcel for identical key; 20 parcels for distinct; bounded retry then generic failure, zero partial rows | M2-F01, INT-09 |
| M2-PH4-TC05 | Fault injection (IT-P01) | Raise at history insert, audit insert and after commit (drop response); then replay | Rollback leaves nothing; post-commit loss replay returns original with no duplicate | INT-09 |
| M2-PH4-TC06 | Browser and logs (E2E-P05) | Public tracking for all statuses and anonymized; scan logs for canary token/recipient strings | No personal data in any surface; no token in logs | M2-06, INT-07, P3 |
| M2-PH4-TC07 | Integration (UT-A05 link) | 29/30/31 lookups; two workers; forged `X-Forwarded-For` | 31st throttled across workers; forged header ignored | M2-07 |
| M2-PH4-TC08 | Corpus (IT-P02, E2E-P05) | Run SQLi/XSS/Unicode/path corpora against A10 fields, A11 `q`, A12 id, A13 token; render in list, detail, tracking, Admin list, audit panel | 200/422/404 only, never 500; no result broadening; no script execution; no CSP violations | M2-01, M2-02, M2-04 |
| M2-PH4-TC09 | Performance plan check | 30 000 parcels dataset (300 000 as STRETCH); EXPLAIN ANALYZE for listed queries | Index scans for list/search/lookup/detail; times recorded | capacity |
| M2-PH4-TC10 | Migration (MIG-03) | Upgrade previous schema with data to head | Data intact; RLS and functions work; smoke journey passes | REV-06 |
| M2-PH4-TC11 | Browser (E2E-P04) | Registration with aborted response then retry; search; tracking; isolation; logout | One parcel after retry; flows pass; no private data after logout | M2-F01, S-08 |
| M2-PH4-TC12 | Operations (OPS-03) | Retention job twice; kill mid-batch; concurrent copy; backup lock held; inspect logs | Idempotent; resumes; second copy blocked; waits; logs contain counts and opaque IDs only | M2-10, REV-08 |
| M2-PH4-TC13 | Cross-module (IT-P04, INT-11) | Eligible parcel with proof: run retention, request photo, run Syauqi's purge, interrupt purge, resume; check dashboard counts and tracking | Photo 404 immediately; file removed then metadata cleared; interruption keeps denial; counts and history unchanged | INT-11, M2-10 |
| M2-PH4-TC14 | CI gate | Backend 85% line/80% branch for parcels; frontend 80/75; required scenario names present | Gates enforced; missing scenario fails | testing strategy |
| M2-PH4-TC15 | Consolidated run | Execute M2-01..M2-10, RLS-01..RLS-09 | Worksheet updated with actual results | rubric 3 |
| M2-PH4-TC16 | Integration | Track anonymized parcel and a parcel whose proof was purged | History returned; no recipient or proof data | M2-F04 |
| M2-PH4-TC17 | RLS and pooling | Force statement timeout and exception mid-transaction; reuse connection | Context cleared; next transaction anonymous | RLS-05 |

## 8 Deliverables and handoffs

H40 (retention job) to Syauqi; grants snapshot and catalog tests to all; matrix rows to Naszrul (H43). Syauqi confirms the purge job consumes `anonymized_at`; Naszrul confirms the runner executes the job under the backup lock.

## 9 Exit criteria

- T01-T11 complete; TC01-TC17 pass on one commit; worksheet rows for M2 and RLS have actual results.
- No unexplained plan regression; migration upgrade test green.
- Contributes to G4 items 1-6.

## 10 Integration checkpoint

INT-04, INT-07, INT-08, INT-09, INT-11 run together in CI with Syauqi's and Naszrul's suites; the grants snapshot reflects migrations 0001-0007 and later; retention job and purge job run through Naszrul's runner in Compose.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| RLS tests pass only because the test connects as owner | `current_user` assertion in every fixture; negative control test connects as owner and fails the assertion |
| Retention job competes with uploads | Both take shared transaction advisory lock; reconcile order documented; INT-11 covers |
| Scale test too slow in CI | Run scale plan check nightly or on demand; keep a small-data plan-shape test in PR CI |
| Grants snapshot churn | One reviewer from each module on changes via CODEOWNERS |

## 12 Deferred work

Production role bootstrap, grant verification and RLS under deployed credentials, scheduled retention on AWS, scale on EC2, cloud privacy checks (PH5); final evidence (PH6).
