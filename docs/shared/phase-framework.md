# Phase framework, milestone matrix and group gates

Status: foundation code and local suites exist as of 13 November 2026; see [actual evidence](../implementation-status.md). No group gate is signed off. Remaining foundation checks, team reviews and remote CI are pending.

Every module plan uses the six phases below with identical identifiers: `PH1` to `PH6`. Phase files live at `docs/modules/<module>/phases/PH<n>-<name>.md`. This framework replaces the earlier `P0`-`P5` stage labels, which collided with the case-study policies P1-P5 (for example "P3" meant both "security stage" and "personal data policy"). Policy references keep `P1`-`P5`; delivery stages are only `PH1`-`PH6`.

Related shared documents: [dependency matrix and handoffs](dependency-matrix.md), [integration scenarios](integration-tests.md), [workflow trace](workflow-trace.md), [traceability](traceability.md), [first execution sequence](execution-sequence.md), [decision register](decision-register.md), [system contract](system-contract.md), [testing strategy](testing-strategy.md) and [integration/deployment operations](integration-and-deployment.md).

## Identifier conventions

| Kind | Format | Example | Defined in |
| --- | --- | --- | --- |
| Phase | `PH<n>` | `PH3` | this file |
| Task | `<module>-PH<n>-T<nn>` | `M2-PH3-T05` | the module's phase file |
| Test case | `<module>-PH<n>-TC<nn>` | `M1-PH2-TC04` | the module's phase file; listed again in the module `test-plan.md` |
| Feature | `M<m>-F<nn>` | `M3-F03` | module README (unchanged) |
| Endpoint | `A01`-`A21` | `A17` | [system contract](system-contract.md#endpoint-ownership) (unchanged) |
| Handoff | `H<nn>` | `H20` | [dependency matrix](dependency-matrix.md) |
| Temporary substitute | `TMP-<nn>` | `TMP-01` | [dependency matrix](dependency-matrix.md#temporary-substitutes) |
| Group gate | `G<n>` | `G3` | this file |
| Integration scenario | `INT-01`-`INT-15` | `INT-05` | [integration tests](integration-tests.md) |
| Security worksheet | `M1-01`...`M3-10`, `S-01`...`S-09`, `RLS-01`...`RLS-10` | `RLS-05` | [security worksheet](../security-tests.md) (unchanged) |
| Test family | `UT-*`, `IT-*`, `CMP-*`, `E2E-*`, `OPS-*`, `CT-*`, `MIG-*`, `LINT-*`, `HAR-*`, `FIX-*` | `IT-D03` | [testing strategy](testing-strategy.md) |
| Open decision / external dependency | `D-<nn>` / `EXT-<nn>` | `D-07`, `EXT-04` | [decision register](decision-register.md) |

Legacy work-package labels (`M1-W01` and similar) in the module READMEs map to phase tasks in each README's "Work package map".

A task row names the behavior, the contract it implements, how completion is validated, the test cases that supply the evidence, and what it needs from others. A task that reads "implement X" without those is a planning defect.

## Phase definitions

| ID | Name | Purpose | Entry | Group exit gate |
| --- | --- | --- | --- | --- |
| PH1 | Foundation and shared contracts | One buildable skeleton, one database role/migration model, shared contracts, constants, fixtures and test harness so three people can work independently | Reviewed plan set (this folder) | G1 |
| PH2 | Initial working slice | A thin real vertical slice per module over the same database and session, with the security baseline already active | G1 | G2 |
| PH3 | Complete module functionality | Every case-study function working through UI and direct API in one local integrated stack; all temporary substitutes retired | G2 | G3 |
| PH4 | Security, failure handling and regression coverage | Expand and prove controls; failure injection, races, retention, local backup/restore; regression suites enforced in CI | G3 | G4 |
| PH5 | Integrated cloud deployment and operational readiness | Later HTTPS deployment on the chosen cloud host, durable storage, scheduled jobs, backups, restore exercise, cloud smoke and journeys | G4 and EXT-04 resolved | G5 |
| PH6 | Final acceptance, evidence and demonstration | Final regression on the release candidate, complete security test document, rehearsal and individual explanation | G5 | G6 |

## Milestone matrix: who delivers what in each phase


| Phase | Naszrul (M1) | Zikri (M2) | Syauqi (M3) |
| --- | --- | --- | --- |
| PH1 | Repo skeleton, locked dependencies, local full Supabase Compose and Next.js; settings/secrets rules; error envelope, request ID, log redaction, security headers; migration 0002 auth_core plus `lock_active_actor` and `get_login_snapshot`; Argon2id password service; auth dependency interface and TMP-01; React API client, session provider skeleton, inferred shared types; CI skeleton; CODEOWNERS | DB role bootstrap; node-pg-migrate conventions, migration 0001, hardened-function template and lint; `unit_of_work` RLS context helper; constants and parity test; migrations 0003 parcels and 0004 integrated ERD; fixture dataset and loader; DTO models | Test harness and Playwright skeleton ; harmless file fixtures; pure state-machine and assignment modules with unit tests; `ProofStore` interface; image-library decision; backup/maintenance lock design; function drafts for 0006/0007; existing proof schema in 0004 |
| PH2 | Real session: A01, A03, A04, A05; CSRF; rate-limit service v1; audit service v1; `require_*` dependencies; login/landing/logout screens; retire TMP-01; authorization-matrix harness | Verify 0003/0004 schema and policies; revision 0005 `create_parcel`; A10 v1; A11 v1; A12 v1; registration and list screens; RLS isolation tests | Seeded assignment fixture (TMP-02); `update_delivery_status` (start delivery only); A16; A17 v1; Rider mobile list and Start delivery action; Rider isolation tests |
| PH3 | A02 register; A06 password change; must-change gate; A07; A08; A09; A20; A21 (SHOULD); admin and account screens; maintenance-runner skeleton; local production-build walking skeleton with full Supabase | Replay-safe A10; A11 search/filter; A12 complete with slots; A13 and `lookup_tracking`; tracking screen; detail screen; retention selection function; full fixtures | Verify 0004 proof schema and add 0007 final functions; A14, A15 with `assign_parcel`; A16 full; A17 full with proof pipeline; A18; A19; admin and rider screens; proof viewer and action panel; retire TMP-02 |
| PH4 | Full authorization matrix; CSRF/session/race suites; failure-audit independence; incident and session-purge commands; runner jobs; security headers; log canary scan; M1 browser regression | RLS suites RLS-01 to RLS-09 and grants snapshot; retention job; concurrency (replay, collision, rollback); privacy regression across all states; rate-limit boundaries; injection/XSS corpus; scale-data EXPLAIN | Fault-injection matrix; orphan/unknown-commit reconciliation; proof purge job; concurrency (reassign vs finalize, duplicate final); upload attack corpus; local backup lock and restore drill; dashboard consistency; mobile interrupted-network journey |
| PH5 | Chosen cloud host, private administration, TLS, full Supabase Compose, secrets, first-boot sequence, Admin provisioning, Argon2 benchmark, cookie/CSRF/host verification, release/rollback, cloud journeys for auth, incident drill | Production DB bootstrap and grant verification, RLS under deployed credentials, retention scheduling verification, post-restore RLS check, scale queries on chosen cloud host, public-tracking checks over HTTPS | durable Supabase volume layout, private off-host backup and lifecycle, scheduler timers, restore exercise, restart/redeploy persistence, Android/4G upload test, orphan reaper on the chosen cloud host |
| PH6 | Final M1 regression, M1 section of the security test document, demo and code walkthrough, release and lecturer-variation evidence | Same for M2 | Same for M3 |

## Security baseline ladder

Security and tests begin with the first implemented feature. Later phases expand and verify; they do not introduce essential controls late.

| Control | Introduced (first working feature) | Expanded | Verified at scale/hostile conditions |
| --- | --- | --- | --- |
| Parameterized SQL, input validation, generic errors | PH1 (error envelope, validators) and every PH2 endpoint | PH3 for each new endpoint | PH4 injection corpora |
| Security headers, CSP (report-only first), Host allow-list, no-store | PH1 (M1-PH1-T04) | PH3 (enforced after first browser regression) | PH4 console and violation checks; PH5 at the proxy |
| Database-level protection of account and audit tables, owner-role policies | PH1 (M1-PH1-T06, M2-PH1-T05) | PH2 | PH4 RLS and catalog suites |
| Argon2id, password length, generic login failure | PH1 service; PH2 login | PH3 register/change/create-Rider | PH4 races; PH5 benchmark |
| Server-side session, rotation, logout revocation, cookie flags | PH2 | PH3 password-change revocation, disablement | PH4 expiry/fixation/race; PH5 HTTPS cookie |
| Role and ownership checks (server-side) | PH2 (`require_role`, RLS, assigned checks) | PH3 each endpoint | PH4 full matrix |
| CSRF | PH2 (login, logout, A10, A17) | PH3 every mutation (A13 is exempt from the token but checks the origin) | PH4 matrix incl. multipart |
| RLS and restricted roles | PH1 roles; PH2 policies and tests | PH3 proof/history/lookup | PH4 RLS-01-RLS-10; PH5 deployed credentials |
| Rate limiting | PH2 login and CSRF bootstrap | PH3 registration, tracking, password-change attempts | PH4 boundary and multi-worker; PH5 behind proxy |
| Audit and safe logging | PH2 (login, logout, create_parcel, start delivery) | PH3 all events | PH4 canary scan |
| Upload defenses | PH3 (first upload feature, with full validation) | PH3 | PH4 attack corpus and faults |
| Retention | PH3 selection function | PH4 job and file purge | PH5 scheduled on the chosen cloud host |
| Backup/restore without reviving sessions | PH1 lock design | PH4 local drill | PH5 cloud exercise |

No endpoint is exposed on a shared or cloud environment before its required access and privacy controls exist.

## Priority tiers and cut line

Each task and test belongs to one tier. Unless listed below a task is MUST. Gates G3 to G6 pass on MUST and SHOULD work; STRETCH items are attempted when MUST and SHOULD are done, their actual results are reported honestly (including "not done"), and they never block a gate (D-36).

In phase exit criteria, "all tasks/tests/scenarios" means the applicable MUST and SHOULD work. A STRETCH case is exercised when attempted and otherwise recorded as deferred; it cannot become a hidden dependency of a required gate. G5 requires G5a and the required parts of G5b, with optional cloud restore results reported separately.

| Tier | Meaning | Members |
| --- | --- | --- |
| MUST | Required by the case study or rubric: the listed functions, each module's key security controls, the suggested test inputs, the policies, a cloud deployment with HTTPS and all roles online, the security test document, the live demonstration | All tasks not named below |
| SHOULD | Strengthens required controls, specified in the contract but not demanded by the sources | A20 audit viewer details (M1-PH3-T07), A21 reset and credential expiry (M1-PH3-T04 extension), account journal and restore reconciliation (M1-PH4-T05), backup lock and maintenance gate (M1-PH3-T10, M3-PH4-T07), local restore drill (M3-PH4-TC07), non-terminal retention (M2-PH3-T08 extension), grants snapshot and function branch table (M2-PH4-T01, T02), upgrade test (M2-PH4-T09), coverage thresholds, branch protection (M1-PH5-T10), restart persistence and documented restore procedure (M3-PH5-T05) |
| STRETCH | Valuable, but not needed for the rubric | Randomized race interleavings beyond five forced orderings (M1-PH4-TC07), fault points beyond FP1, FP4, FP5, FP7, FP9 (M3-PH4-T01), scale dataset above 30 000 parcels (M2-PH4-T08, M2-PH5-T06), real Android on 4G (emulation is acceptable) and capacity sampling (M3-PH5-T06, T07), an isolated cloud repetition of the required matching-backup restore procedure (M3-PH5-T04), orphan reaper scheduling on the chosen cloud host (M3-PH5-T09), `testssl.sh` depth and nightly matrix runs |

Delivery order is MUST, then SHOULD, then STRETCH. An unfinished SHOULD item is reported as partial and leaves the relevant internal gate open; it is not waived by time pressure. STRETCH items may be deferred with a recorded limitation and never block a gate. A tier never lowers a control that required work depends on.

## Initial slice execution rules

PH2 uses real sessions, the shared database and the first protected UI/API flows. G1 must pass before G2 can be signed off; independent work may overlap only under the overlap rule. All PH2 tasks and listed tests must pass in CI for G2. Record partial results without marking a gate complete. Temporary assigned fixtures are allowed only until real assignment replaces them in PH3.

## Group gates

A gate passes only on repeatable evidence for the listed behaviors, permissions and data consistency, recorded with commit, environment and owner. Aggregate test counts or coverage percentages never substitute. All three owners sign each gate in the PR that records it. The integration scenarios each gate requires are listed once, in the [gate table of the integration scenarios](integration-tests.md#gate-use); the lists below name only the other criteria.

### G1: Foundation (end of PH1)

1. Clean checkout builds and the documented local setup starts full Supabase Compose and one Next.js app; health reports ready; PostgreSQL port is not published beyond localhost (OPS-01).
2. Role bootstrap and migrations 0001-0004 apply to an empty volume, then re-apply idempotently to an existing volume without changing passwords (MIG-01, MIG-02, M2-PH1-TC01).
3. Runtime roles are asserted at connection time: not superuser, no BYPASSRLS, no CREATE, no owner membership; the account tables and `audit_event` are protected from runtime DML as specified (RLS-01, M1-PH1-TC14).
4. Contract v4, including retained v3 amendments, reviewed by all three; enums, DB checks and TypeScript constants agree (CT-01); production startup refuses test-only hooks (CT-02); function-hardening lint is active (LINT-01).
5. Harness self-test proves per-test reset and role assertion (HAR-01); fixture loader is idempotent and refuses production (FIX-01).
6. CI jobs listed for PH1 in the [CI job list](testing-strategy.md#ci-and-release-gates) are green on the PR; secret scanning of tree and history is active.
7. All PH1 tasks and their required checks have completion evidence; remaining checks cannot be deferred while marking G1 complete.

### G2: Initial working slices (end of PH2)

1. INT-13: seeded Seller and Rider log in through the real session endpoint; Seller registers a parcel, sees it after refresh; Rider A starts delivery on a seeded Assigned parcel; the change persists with actor and time (all on one database).
2. INT-14: negative checks: wrong password, Seller B cannot fetch Seller A's parcel, Rider B cannot update Rider A's parcel, Seller cannot open a Rider/Admin endpoint, request without CSRF is rejected.
3. INT-15: PH2 security baseline rows executed with actual results (listed in each PH2 file); everything not exercised stays "Planned".
4. TMP-01 and TMP-04 retired; remaining substitutes TMP-02 and TMP-03 are labeled in the demo.
5. Any gap is disclosed in the integration evidence record. A deployment plan does not satisfy this gate. The full gate requires all PH2 tests in CI.

### G3: Functionally complete (end of PH3)

1. M1-F01-F05, M2-F01-F04 and M3-F01-F05 work through the React UI and direct API against real PostgreSQL.
2. The G3 scenarios pass in Playwright on Compose with the same images intended for deployment.
3. TMP-01 to TMP-05 are retired; TMP-06 stays test-only and guarded; no test-only principal or seed shortcut remains in the product code path.
4. Contract v4 is frozen except via a reviewed change; endpoint, DTO and error-code conformance tests pass (CT-03).
5. Feature-level security rows for each endpoint have actual results.
6. The local production-build walking skeleton (M1-PH3-T12) has run against full Supabase. EXT-04 remains a later PH5 decision; record the final cloud-assessment consequence if unresolved then.

### G4: Hardened (end of PH4)

1. Every worksheet row M1-01-M1-12, M2-01-M2-10, M3-01-M3-10 and RLS-01-RLS-10 passes; S-01, S-03-S-06 and S-08 pass locally; S-02 passes for the local cookie and CSRF subset and S-07 and S-09 pass in the local drill, with the final results at G5. Rows backed only by STRETCH cases are reported separately.
2. The G4 scenarios pass, including pooled-connection, concurrency, fault-injection and retention interruption cases.
3. Full authorization matrix A01-A21 passes for every identity (M1-PH4-TC01).
4. Local backup and restore drill passes with an account-reconciliation test and a revoked-cookie replay and retention re-run (OPS-05).
5. Backend and frontend coverage gates are met, with required scenario lists (role matrix, transition edges, expiry/revocation, public allowlists) explicitly present; the security tools named in D-39 have run with results recorded.
6. No untriaged high or critical reachable dependency finding; no skipped required scenario; no flaky-rerun masking. A manual claim-versus-test review of the traceability rows has been done.

### G5: Cloud and operations (end of PH5)

**G5a (rubric-critical minimum, MUST):**

1. Full-Supabase first setup on the chosen cloud host followed by existing-volume restart (INT-12 first-boot and restart legs, OPS-06).
2. HTTPS, secure cookie, CSRF, allowed hosts, private database/application ports, private proof storage verified on the live stack (S-02).
3. The G5 scenarios run on the live URL for all four user types; RLS checks run under the deployed runtime credentials (OPS-08).
4. Restart/redeploy preserves rows and photos (S-07).
5. A failed release can be rolled back by release identifier (M1-PH5-TC03).
6. Measured response times and memory on the chosen instance are recorded; no capacity claim is made beyond measurements.

**G5b (extended operations, SHOULD/STRETCH):**

7. Scheduled retention, session cleanup and (STRETCH) orphan reconciliation run safely twice and after interruption; failure recipient recorded (OPS-03).
8. The required local restore drill passes at G4. An isolated cloud repetition is STRETCH and records: counts, history, sample photos, grants, accounts reconciled, no old session valid, expired data re-anonymized (OPS-07; STRETCH on the chosen cloud host, SHOULD locally).
9. Chosen host security, private backup expiry/credentials and Supabase administrative exposure checks pass.

### G6: Final acceptance (end of PH6)

1. The security test document lists, per module and owner, input, expected and actual result for more than five distinct input types, using the cloud deployment and release-candidate version, in the template defined in the [testing strategy](testing-strategy.md#final-security-test-document).
2. Full regression suite on the release candidate passes; known limitations are documented; open failures are listed, not converted.
3. Each member has rehearsed their approximately 10 minutes of the 30-minute demonstration (rubric key controls first) and can explain their own code.
4. Release ownership/assessment identities (EXT-05), lecturer variation record (EXT-02) and branch-protection status (EXT-03) are recorded as they actually stand.
5. Release tag, release identifiers and migration revision are recorded.

## Module completion

A module is complete when its phase files PH1-PH6 meet their exit criteria, its README definition of done is ticked with evidence, and G3-G6 pass. Coordinating shared work does not transfer ownership of another member's assessed code; each phase file marks owner-written tasks.

## Overlap rule

A task may start before the previous gate if every handoff it needs exists or has an approved temporary substitute (see [dependency matrix](dependency-matrix.md)). A phase is "complete" for a module only when that module's exit criteria pass; a gate passes only when all three modules' phase criteria and the group criteria pass. Do not merge a PR that changes an endpoint, DTO, status or permission without updating the contract, affected phase files and tests in the same PR.

## Phase status board

Update only with evidence references. PH1 has local implementation; later feature phases and all group gates remain open.

| Phase | M1 Naszrul | M2 Zikri | M3 Syauqi | Group gate |
| --- | --- | --- | --- | --- |
| PH1 | In progress locally | In progress locally | In progress locally | G1 review/remaining checks pending |
| PH2 | Planned | Planned | Planned | G2 not passed |
| PH3 | Planned | Planned | Planned | G3 not passed |
| PH4 | Planned | Planned | Planned | G4 not passed |
| PH5 | Planned | Planned | Planned | G5 not passed |
| PH6 | Planned | Planned | Planned | G6 not passed |
