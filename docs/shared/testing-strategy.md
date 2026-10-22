# Automated testing strategy

This is the required test plan for the Next.js/TypeScript/Supabase PostgreSQL application. The new Next.js/full-Supabase app and its executable suites do not exist yet; the separate checkpoint demo has frontend-only tests. Every test described here is planned, not passed. Owners implement tests with their features and retain evidence against the [system contract](system-contract.md).

## Test layers and tools

| Layer | Tools | What it proves | What it does not prove |
| --- | --- | --- | --- |
| TypeScript server unit | Vitest, table-driven cases, controlled clocks and targeted doubles | Rules, validation, permissions, sessions and recovery decisions | Real SQL/RLS, HTTP or durable Storage |
| React component | Vitest, React Testing Library, user-event and mocked transport | Forms, session/cache changes, pending/errors and role interactions | Actual server authorization |
| HTTP/database/Storage integration | Actual Next.js HTTP server, Vitest client and disposable full Supabase Compose | Route Handlers, cookies/CSRF, server services, real roles/RLS and private object API | Cloud HTTPS/networking |
| Browser integration | Playwright against the local Next.js production build and full Supabase | Client and Server Component navigation, role journeys, public privacy, phone layout and no-cache behavior | Recovery/capacity without dedicated operational checks |
| Deployment/recovery | Local full-stack scripts and isolated matching app-data/Storage restore; later PH5 cloud repetition | Reproducible setup, migrations, persistence, jobs, backup consistency and later HTTPS | Unmeasured availability/load guarantees |

The [security worksheet](../security-tests.md) and [integration scenarios](integration-tests.md) remain required. Include a direct Supabase gateway access attempt proving app schema and private proof objects cannot bypass Next.js. Bundled Supabase Auth is not the application's login/session source.

## Test case identifiers, families and phase schedule

Every executable case in the module phase files has a unique ID `<module>-PH<n>-TC<nn>` and names its family. Gates and traceability refer to these IDs, never to counts. Each module's `test-plan.md` aggregates its cases and a generated index; [traceability](traceability.md) maps requirements and the 51 worksheet rows to them.

| Family | Meaning |
| --- | --- |
| UT-A01 to UT-A05, UT-P01 to UT-P04, UT-D01 to UT-D05 | TypeScript server unit families listed below |
| IT-A01 to IT-A04, IT-P01 to IT-P04, IT-D01 to IT-D04 | API/PostgreSQL integration families listed below |
| RLS-01 to RLS-10 | Restricted-role and function-hardening checks (worksheet rows) |
| CMP-A01 to CMP-A05 | M1 component tests: API client and session provider, login, register, password, admin users |
| CMP-P01 to CMP-P04 | M2 component tests: registration form, Seller list, tracking page, detail page and search |
| CMP-D01 to CMP-D03 | M3 component tests: Rider list, Admin parcels and dashboard, action panel and proof viewer |
| E2E-A01 to E2E-A04 | M1 browser: role login, onboarding and disablement, regression, live URL |
| E2E-P01 to E2E-P06 | M2 browser: Seller slice, tracking privacy, Seller journey, regression, privacy and injection corpora, live URL |
| E2E-D01 to E2E-D04 | M3 browser: Rider slice on phone viewport, Delivered/Failed/disable-reassign journeys, interrupted network, live URL |
| CT-01, CT-02, CT-03 | Contract checks: enum/constant parity, production refuses the test principal, OpenAPI and error-code conformance |
| MIG-01, MIG-02, MIG-03 | Migrations: empty database, existing-volume idempotency, upgrade of the previous schema with data |
| LINT-01 | Static check that every `SECURITY DEFINER` function follows the hardening template |
| HAR-01, FIX-01 | Harness self-test (role assertion, isolation, owner-connection negative control); fixture loader safety and idempotency |
| OPS-01, OPS-03 to OPS-09 | Operations: clean-checkout smoke; scheduled jobs and runner; backup lock; local restore drill; first boot and restart; cloud restore exercise; RLS under deployed credentials; capacity and timing measurements (OPS-02 is not used) |

Layers start with the first feature they can test; later phases extend them.

| Layer | Starts | Required by gate |
| --- | --- | --- |
| TypeScript server unit | PH1 | G1 |
| React component | PH1 (client, provider), PH2 (screens) | G1, G2 |
| API/PostgreSQL integration with runtime roles and role assertion | PH1 (migrations, roles), PH2 (endpoints) | G1, G2 |
| Authorization-matrix harness | PH2 (rows for implemented endpoints) | G2; complete at G4 |
| Browser journeys (Playwright) | PH2 (login, Seller slice, Rider slice) | G2, G3 |
| Concurrency, fault injection, upload corpus, RLS suites | PH2 basics, PH3 feature level | G4 |
| Migration upgrade, scheduled jobs, local backup/restore drill | PH1 (MIG-01/02), PH3 (runner), PH4 (drill, upgrade) | G4 |
| Clean-checkout, first-boot, restart, cloud restore, deployed-credential RLS | PH1 (OPS-01), PH5 | G5 |

## Test organization and fixture contract

```text
tests/harness/               role-asserting pg clients, local Next.js server and isolated Supabase stack
tests/unit/{auth,parcels,delivery}/
tests/integration/{auth,parcels,delivery,rls,cross_module,authz_matrix}/
src/features/*/              colocated component tests
tests/e2e/                   Playwright journeys
tests/operations/            setup, migrations, persistence, matching backup/restore and jobs
tests/fixtures/{files,payloads}/
tools/check_plan_docs.py     existing Python documentation checker only
```

Use a disposable full Supabase Compose project with pinned versions matching development. It has unique project name, ports, credentials and DB/Storage volumes. Wait for vendor service readiness, bootstrap application roles and apply actual node-pg-migrate revisions. HTTP requests use app_runtime/tracking_runtime; assert role/grants. Owner connections are only for bootstrap, migrations or test seeding, never RLS proof. Do not replace PostgreSQL with SQLite or mock away the Storage adapter in integration acceptance.

Fixtures include one Admin, two Sellers, two Riders, inactive/must-change accounts, every status, anonymized and multiple ownership groups, harmless image corpora and zero/nonzero dashboards. Supply ephemeral passwords privately. Keep application accounts in app schema under the custom username/session contract; do not seed vendor auth.users as an alternate login.

Requests commit independently; an outer rollback does not isolate them. Reset only disposable application data and private test bucket objects through a guarded fixture credential. Never reset development volumes or vendor schemas. Independent parallel suites get separate full stacks; race tests intentionally share one database and use barriers. Demonstrate isolation before enabling parallel suites. Temporary local files serve only bounded staging/unit doubles; real proof persistence uses the Storage API. Test principal/failpoint injection lives only in test imports and cannot be enabled through production requests or flags.

## Backend unit coverage

Owners use table-driven tests for valid, invalid and boundary cases. Test observable decisions rather than reproducing implementation code in assertions.

| Test family | Required cases | Owner |
| --- | --- | --- |
| UT-A01 Account input | Username normalization/length/characters; display-name boundaries; 9/10/128/129-character passwords; common-password rejection; no silent truncation | Naszrul |
| UT-A02 Session lifecycle | Anonymous/authenticated idle and absolute expiry just before/at/after boundary; active flag; matching/mismatched session version; first-change restriction | Naszrul |
| UT-A03 Auth decisions | Correct/wrong password outcomes, generic unknown-user outcome, permitted role sets, CSRF match/mismatch/missing, session rotation/revocation decisions | Naszrul |
| UT-A04 Safe output | Principal/UserSummary field allowlists; password/body redaction; generic internal errors and safe field errors | Naszrul |
| UT-A05 Rate windows | Threshold minus one/threshold/over threshold, expiry, counter-key normalization and privacy-safe keyed identities | Naszrul |
| UT-P01 Parcel input | Required/empty/Unicode/overlong recipient fields; phone normalization; weight precision and 0/0.001/100.000/over-limit/invalid numeric input | Zikri |
| UT-P02 Tracking/replay | Token shape/entropy-source use, collision retry classification, canonical request fingerprint, same/different/replayed/expired request keys | Zikri |
| UT-P03 Data selection | Own/assigned/Admin decisions, literal search escaping, sort allowlist, pagination bounds and stable tie-breaker | Zikri |
| UT-P04 Privacy/retention | Public DTO exact fields, private anonymized representation, calendar-month retention boundary and timezone handling, fingerprint removal | Zikri |
| UT-D01 State machine | Every pair of five statuses plus role/assignment/active variations; only legal transitions pass; final-state immutability | Syauqi |
| UT-D02 Assignment | Active/non-Rider/inactive targets, first assignment, same-Rider no-op, unfinished reassignment and terminal-state rejection | Syauqi |
| UT-D03 Proof input | Allowed format, extension/MIME/content mismatch, corrupt/multiple-frame data, byte/pixel/output limits, unsafe names and metadata removal | Syauqi |
| UT-D04 Recovery decisions | File prepared/committed/unreferenced states, rollback compensation, referenced-file preservation and retryable retention cleanup | Syauqi |
| UT-D05 Dashboard | Five fixed status keys, missing statuses represented by zero and coherent total from the aggregate result | Syauqi |

Do not claim randomness is proven by generating a few unique values. Check use of the cryptographic generator and database uniqueness behavior. Do not claim access control is proven solely by a mocked permission helper.

## API and PostgreSQL integration coverage

### All-endpoint authorization matrix

For A01 through A20, parameterize expected access for anonymous, Seller A, Seller B, Rider A, Rider B, Admin, inactive and password-change-required identities. Include success where valid, wrong role, wrong ownership, expired/revoked session, missing/invalid CSRF on unsafe methods, malformed fields and unexpected sensitive fields. Do not expect every endpoint to permit every fixture; expected outcomes come from the contract. Check exact status/error shape, no unintended database/file changes and no extra sensitive response fields.

For 404-protected parcel/proof routes, compare nonexistent IDs with inaccessible IDs. For authenticated list endpoints, assert filtering/count totals as well as individual rows. For A13 public tracking, include no-login access without any session or CSRF token (same-origin check only), a foreign `Origin`, and no direct table access through tracking_runtime.

### Module integration suites

| Test family | Required cases | Owner |
| --- | --- | --- |
| IT-A01 Accounts | Successful/duplicate/concurrent registration; forced Seller role; Admin-only Rider creation; initial password-change gate; no public Admin creation | Naszrul |
| IT-A02 Sessions | Actual Set-Cookie flags, hashed stored token, login/CSRF rotation, old-cookie replay, idle/absolute expiry, logout and all-session password-change invalidation | Naszrul |
| IT-A03 Locking | Disable/reactivate, incident-lock including Admin through private command, login versus password-change race and session revocation during a pending write | Naszrul |
| IT-A04 Audit/limits | Failure audit and counters persist when authentication fails; successful writes/audit commit together; concurrent workers share limits; failed audit store cannot issue an untracked successful login | Naszrul |
| IT-P01 Atomic registration | Parcel/history/audit commit together; failure rollback; tracking collision handling; concurrent request-key replay creates one parcel; changed payload conflicts | Zikri |
| IT-P02 Read isolation | Own-list/search/detail/history filtering, pagination, literal search/injection, cross-user IDs and reassignment removal of old Rider access | Zikri |
| IT-P03 Tracking | Exact output allowlist for all states, malformed/unknown token behavior, rate windows, SQL injection and public-role privilege denial | Zikri |
| IT-P04 Retention | Delivered/Failed before/at/after 12 calendar months, leap/month-end handling, anonymized fields/fingerprint, proof deny-before-delete and restartable batches | Zikri + Syauqi |
| IT-D01 Assignment | Active target check under concurrency, first Assigned history, same-Rider no-op, stale conflict, audit-only reassignment and disabled-Rider continuity | Syauqi |
| IT-D02 Finalization | Both final outcomes, exactly one photo, missing/invalid/multiple photo rejection, actor/time/version correctness and terminal immutability | Syauqi |
| IT-D03 File/DB faults | Failure before/after file publication, DB error, commit acknowledgment uncertainty, response failure, interrupted cleanup, referenced-file survival and no broken committed proof | Syauqi |
| IT-D04 Dashboard/photo | One consistent aggregate snapshot; zeros/total; actual private image stream headers/permissions; path traversal; no static/public photo route | Syauqi |

Use an actual Argon2id hash round trip in integration tests with deployed settings. Faster deterministic password stubs are acceptable for isolated unit cases, but cannot substitute for the real hash/session pipeline.

### RLS and controlled-function suites

Implement RLS-01 through RLS-10 and assert that app_runtime cannot directly INSERT/UPDATE/DELETE protected tables or acquire protected row locks through a privilege bypass. Exercise the controlled locking function with the real role. All privileged functions have a non-login/non-owner/no-bypass owner, safe search_path, revoked PUBLIC execution and narrow grants; test hostile search-path shadowing and unrelated-role invocation.

Reuse one physical pooled connection across Seller A, Seller B and anonymous transactions, including commit and rollback. RLS must deny missing identity and function writes must derive the actor from verified context. Demonstrate that the application never accepts client-supplied context settings. Test parent/child history/photo policies and absence of policy recursion.

### Concurrent and failure tests

Use separate sessions/connections with barriers to force overlap: same username registration, same parcel request key, tracking collision, same-version assignment/status update, reassignment versus finalization, disablement/password change versus login/write, and retention versus photo retrieval. Assert database/file invariants and safe responses for both winners and losers. Deadlock/serialization retries are bounded and must not duplicate history/audit/photo data.

Inject faults through controlled test doubles around the real transaction/Storage API boundary, not by mocking away the entire service. For commit-acknowledgment uncertainty, reconciliation first acquires the same parcel lock through the maintenance helper so the original transaction must have finished, then checks committed references in a fresh READ COMMITTED statement while retaining that lock. A plain SELECT returning no visible reference before the original transaction finishes is not permission to delete. Preserve files on lock timeout/database unavailability. IT-D03 must delay the original transaction, observe an initially invisible proof row, let that transaction commit, and prove cleanup preserves the now-referenced file.

## React component and browser tests

Component tests cover login/registration/password forms, session loading/expiry, must-change-password routing, role menus, cache clearing, validation display, registration request-key preservation, list/filter pagination, tracking output, assignment controls, file selection/limits and uncertain network outcomes. Check pending/empty/error states and keyboard-visible labels/focus. Assert that raw recipient text is not inserted as executable HTML.

Browser suites use the real integrated app and fixture data. Implement INT-01 through INT-12 where browser behavior is relevant and supplement with direct API/database operations for non-UI assertions. Use separate browser contexts for two Sellers/two Riders and a separate anonymous context. Mobile viewport tests cover Rider list/detail/upload controls; simulate a slow/interrupted request and verify deliberate retry/refetch behavior.

Inspect response bodies and DOM for public tracking after every status, not only screenshots. Test refresh, navigation directly to a protected route, logout/back-button behavior, account switching and clearing cached private data. At least the full Delivered and Failed journeys must run against the same images/configuration intended for deployment.

## Operations and migration tests

- Fresh local setup starts full Supabase Docker, preserves vendor schema/role ownership, applies app bootstrap/migrations once and starts both Next.js dev and production modes.
- Existing-volume restart preserves accounts/passwords, parcels, object keys and proof bytes. No request, build or worker startup auto-migrates.
- Upgrade the previous app schema with synthetic data and verify runtime grants, RLS, functions and session compatibility.
- Check loopback-only gateway/Studio/DB/pooler ports; app schema unavailable through Data API/GraphQL/Realtime; private proof bucket inaccessible anonymously.
- Exercise actual Route Handlers and Server Component navigation with no shared caching, server-only import boundaries and nonce CSP/hydration. Verify production cookies/HTTPS on the chosen PH5 host later.
- Restore the matching app-schema dump and Storage API object manifest/bytes into a separate full stack. Verify counts/history/hashes/grants, purge sessions, reconcile account changes or quarantine, and rerun retention before reopening.
- Run private TypeScript jobs twice and after interruption; prove overlap locks, bounded cleanup, storage-failure handling and named failure notification. Daily scheduling must have actual evidence.
- Record Next.js build/commit, app revision and full Supabase Compose/image versions. Local acceptance does not claim cloud deployment or measured source-scale capacity.

## Feature-to-test traceability

| Feature | Unit coverage | Integration coverage | Browser/release evidence |
| --- | --- | --- | --- |
| M1-F01 Seller registration | UT-A01/A03/A04 | IT-A01 | Registration form and INT-01 |
| M1-F02 Login/logout | UT-A02/A03/A05 | IT-A02/A04 | Role login, refresh, expiry and INT-06 |
| M1-F03 Rider creation | UT-A01/A03 | IT-A01 | Admin creates Rider and mandatory first change |
| M1-F04 Password change | UT-A01/A02/A03 | IT-A02/A03 | Multiple-device revocation and INT-06 |
| M1-F05 User management | UT-A03/A04 | IT-A03/A04 | Disable/reassign INT-05 and private Admin-lock exercise |
| M2-F01 Registration | UT-P01/P02 | IT-P01 | Seller form, replay and INT-01/INT-09 |
| M2-F02 Own reads/search | UT-P03/P04 | IT-P02 | Separate Seller contexts and INT-04 |
| M2-F03 Public tracking | UT-P02/P04 | IT-P03 | Anonymous network/DOM inspection and INT-07 |
| M2-F04 Retention | UT-P04/D04 | IT-P04 | INT-11 and restored-backup cleanup |
| M3-F01 Assignment | UT-D01/D02 | IT-D01 | Admin assignment and INT-02/INT-09 |
| M3-F02 Rider reads | UT-P03/D01 | IT-P02/D04 | Phone viewport, wrong Rider and INT-04 |
| M3-F03 Outcomes/proof | UT-D01/D03/D04 | IT-D02/D03 | INT-02, INT-03 and INT-10 |
| M3-F04 Dashboard | UT-D05 | IT-D04 | Five counts agree after INT-02/INT-03 |
| M3-F05 Continuity | UT-D02/D04 | IT-D01/P04 | INT-05, INT-11 and INT-12 |

Every security worksheet ID must also be mapped to an automated test name, or a clearly justified manual operational check with evidence. The mapping from the 51 worksheet rows, the features, the case-study requirements, rubric criteria, policies and threats to phases, tasks and test case IDs is [traceability.md](traceability.md); keep it alongside final results. A count of test functions alone is not coverage.

## CI and release gates

Every PR runs the jobs below (names are recorded in M1-PH1-T11 so branch protection can require them later). Slower suites (scale plan checks, full browser matrix, operations drills, security-tool scans) run nightly or on demand until G3 and before every release.

| Job | Introduced | Content |
| --- | --- | --- |
| `server-lint-type`, `server-unit`, `app-check`, `local-stack-smoke` | PH1 | Lint, type checks, unit and component tests, build, clean-checkout smoke |
| `db-migrations` | PH1 | Role bootstrap, upgrade to head, existing-volume idempotency (MIG-01, MIG-02) |
| `server-integration` | PH1 (harness self-test, RLS-01) | Real PostgreSQL with runtime roles; endpoint suites from PH2 |
| `ci-contract` | PH1 | CT-01, CT-02, LINT-01, OpenAPI snapshot; CT-03 from PH3 |
| `secret-scan` | PH1 | gitleaks over tree and history |
| `dependency-audit` | PH1 report-only, blocking from PH4 | npm audit, Trivy and hadolint on images and Compose |
| `authz-matrix`, `e2e-core` | PH2 | Authorization matrix; core Playwright journeys |
| `security-tools` | PH4 | Semgrep for TypeScript, ZAP baseline, sqlmap against the Compose stack (nightly) |

Third-party GitHub Actions are pinned by commit SHA.

Initial proposed coverage gates are backend 85% line/80% branch and frontend 80% line/75% branch. Exclude only generated/vendor code from metrics; migration execution remains mandatory. All role-matrix entries, legal/illegal transition edges, session expiry/revocation cases and public field allowlists need explicit tests regardless of aggregate coverage. Do not add low-value assertions merely to meet a percentage.

A PR cannot be declared ready with failing required tests, skipped required scenarios, flaky reruns masking a defect or untriaged high/critical reachable dependency findings. A failing test report must identify the owner and reproduction. Fix the underlying issue, then rerun the affected suite and related integration journeys. Record full-suite results before release. Enforcing CI on GitHub remains a separate branch-protection configuration task after check names exist.

Local G4 requires local production-build, job and isolated restore evidence; final PH5 release additionally repeats applicable checks on the actual cloud host. Cloud-only stretch drills retain their stated tier. No zero-defect guarantee is inferred from green tests. Completion means the specified behaviors and failure boundaries have repeatable evidence, with known limitations documented.

## Security tooling

Use TypeScript ESLint/Semgrep, npm audit and gitleaks (tree/history), with Trivy/hadolint for the full pinned Docker infrastructure. Run ZAP baseline and sqlmap against the local Next.js routes with real Supabase and synthetic data, then repeat authorized app-scoped checks on the chosen cloud URL in PH5. Test private Supabase API/Studio exposure separately without scanning unrelated shared provider infrastructure. Each run records tool/version, target, date, findings and triage. Automated scans supplement authored role, RLS, upload and recovery tests.

## Final security test document

One document, organized by module, with the owner's name, assembled from the three module sections (each owner assembles their own; Naszrul merges and exports it, H60). One row per executed test input:

| Column | Content |
| --- | --- |
| Test ID | Worksheet ID (for example M2-04) and the test case ID that produced the result |
| Rubric input type | The suggested input class from the rubric (for example SQL injection in search) |
| Module and owner | M1/M2/M3 and the member's name |
| Input | Exact input or action, with synthetic data only |
| Expected result | From the worksheet |
| Actual result | Observed result, never copied from the plan |
| Pass or fail | Failed rows stay open with an issue reference |
| Evidence | Safe screenshot, log or tool-output reference |
| Version and environment | Commit, release identifier, migration revision, URL or Compose, date and time |

Each member needs more than five distinct input types; PH6 checks this per module.

## Evidence and current state

For every executed scenario record owner, feature/security/integration ID, exact input, expected result, actual result, commit/release/migration version, environment, timestamp and safe artifact reference. Automated JUnit/coverage/browser reports support the final rubric document but do not replace the owner's explanation.

Current state: all suites and gates in this document are planned (phase files define the cases; none has run). No Next.js/backend/RLS test has run because that implementation is not present. Historical checkpoint frontend results do not satisfy these gates. Document-link checks are separate from software test results.
