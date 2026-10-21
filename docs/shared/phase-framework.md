# Phase framework, milestone matrix and group gates

Status: reviewable plan. Nothing here is implemented or tested. Verified repository state when this framework was written: documentation and reference files only; no `backend/`, `frontend/`, `infra/`, CI workflow, tests or running application exist, and the PR-only branch protection in `.github/branch-protection.json` has not been applied.

Every module plan uses the six phases below with identical identifiers: `PH1` to `PH6`. Phase files live at `docs/modules/<module>/phases/PH<n>-<name>.md`. This framework replaces the earlier `P0`-`P5` stage labels, which collided with the case-study policies P1-P5 (for example "P3" meant both "security stage" and "personal data policy"). Policy references keep `P1`-`P5`; delivery stages are only `PH1`-`PH6`.

Related shared documents: [dependency matrix and handoffs](dependency-matrix.md), [integration scenarios](integration-tests.md), [workflow trace](workflow-trace.md), [traceability](traceability.md), [first execution sequence](execution-sequence.md), [decision register](decision-register.md), [system contract](system-contract.md), [testing strategy](testing-strategy.md) and [integration/AWS operations](integration-and-aws.md).

## Identifier conventions

| Kind | Format | Example | Defined in |
| --- | --- | --- | --- |
| Phase | `PH<n>` | `PH3` | this file |
| Task | `<module>-PH<n>-T<nn>` | `M2-PH3-T05` | the module's phase file |
| Test case | `<module>-PH<n>-TC<nn>` | `M1-PH2-TC04` | the module's phase file; listed again in the module `test-plan.md` |
| Feature | `M<m>-F<nn>` | `M3-F03` | module README (unchanged) |
| Endpoint | `A01`-`A20` | `A17` | [system contract](system-contract.md#endpoint-ownership) (unchanged) |
| Handoff | `H<nn>` | `H20` | [dependency matrix](dependency-matrix.md) |
| Temporary substitute | `TMP-<nn>` | `TMP-01` | [dependency matrix](dependency-matrix.md#temporary-substitutes) |
| Group gate | `G<n>` | `G3` | this file |
| Integration scenario | `INT-01`-`INT-12`, `INT-CP-01`-`INT-CP-03` | `INT-05` | [integration tests](integration-tests.md) |
| Security worksheet | `M1-01`...`M3-10`, `S-01`...`S-09`, `RLS-01`...`RLS-10` | `RLS-05` | [security worksheet](../security-tests.md) (unchanged) |
| Test family | `UT-*`, `IT-*`, `CMP-*`, `E2E-*`, `OPS-*`, `CT-*`, `MIG-*`, `LINT-*`, `HAR-*`, `FIX-*` | `IT-D03` | [testing strategy](testing-strategy.md) |
| Open decision / external dependency | `D-<nn>` / `EXT-<nn>` | `D-07`, `EXT-04` | [decision register](decision-register.md) |

Legacy work-package labels (`M1-W01` and similar) in the module READMEs map to phase tasks in each README's "Work package map".

A task row names the behavior, the contract it implements, how completion is validated, the test cases that supply the evidence, and what it needs from others. A task that reads "implement X" without those is a planning defect.

## Phase definitions

| ID | Name | Purpose | Entry | Group exit gate |
| --- | --- | --- | --- | --- |
| PH1 | Foundation and shared contracts | One buildable skeleton, one database role/migration model, shared contracts, constants, fixtures and test harness so three people can work independently | Reviewed plan set (this folder) | G1 |
| PH2 | Initial working checkpoint slice | A thin real vertical slice per module over the same database and session, with the security baseline already active | G1 checkpoint-critical subset (marked CP) | G2 |
| PH3 | Complete module functionality | Every case-study function working through UI and direct API in one local integrated stack; all temporary substitutes retired | G2 | G3 |
| PH4 | Security, failure handling and regression coverage | Expand and prove controls; failure injection, races, retention, local backup/restore; regression suites enforced in CI | G3 | G4 |
| PH5 | Integrated AWS deployment and operational readiness | HTTPS deployment on AWS, durable storage, scheduled jobs, backups, restore exercise, cloud smoke and journeys | G4 and EXT-04 resolved | G5 |
| PH6 | Final acceptance, evidence and demonstration | Final regression on the release candidate, complete security test document, rehearsal and individual explanation | G5 | G6 |

### Refinements to the suggested framework, with evidence

The suggested six-phase sequence is kept. These refinements are adopted because the repository and source documents support them:

| Refinement | Evidence | Where applied |
| --- | --- | --- |
| Label the checkpoint-critical subset of PH1 with `(CP)` | The team's checkpoint is 22 October 2026 and no code exists; a complete foundation cannot precede the slices | PH1 task tables, [first execution sequence](execution-sequence.md) |
| Security baseline ladder: controls arrive with the first feature that needs them (see below) | Brief: "check access on the server for every request"; rubric 2a scores controls on the module's functions, not at the end | Every PH2 file; PH4 only expands and verifies |
| Authorization-matrix harness starts in PH2, completes in PH4 | The testing strategy's A01-A20 matrix is otherwise a late, single-owner artifact | M1-PH2-T12, M1-PH4-T01 |
| A12 (shared private detail) is delivered as v1 in PH2 | M2's slice must show another Seller cannot fetch a parcel, and M3's Rider screen links to it | M2-PH2-T06, H22 |
| Early AWS smoke deploy in PH3, conditional on EXT-04 | Rubric 1b is 10 marks (deducts 5 if local only); first contact with AWS during PH5 would put the largest single-criterion risk at the end | M1-PH3-T12 |
| Local backup/restore drill and the maintenance-runner exist before AWS (PH4) | Restore, retention and session-purge behavior must be correct before it is rehearsed on infrastructure | M3-PH4-T07, M1-PH3-T10 |
| Contract v3 amendments are a PH1 deliverable | Review found gaps (audit/parcel foreign-key ordering, upload reconciliation key, error-code registry, idempotency fingerprint keying, backup coordination mechanism) that block independent work | [system contract v3 amendments](system-contract.md#contract-v3-amendments), M1-PH1-T12, M2-PH1-T09, M3-PH1-T09 |
| Priority tiers (MUST, SHOULD, STRETCH) with a cut line | Review found about 190 tasks and 248 test cases for three people; the rubric requires functions, key controls, listed inputs, a cloud deployment, a test document and a demo, not every hardening extra | [Priority tiers](#priority-tiers-and-cut-line) |
| G2 split into a local checkpoint exit and the full PH2 exit | Today is the day before the checkpoint and no code exists; the full PH2 exit requires CI | [Checkpoint execution rules](#checkpoint-execution-rules) |
| G5 split into a rubric-critical minimum (G5a) and extended operations (G5b) | Rubric 1b needs a working cloud deployment, not a restore exercise | [G5](#g5-aws-and-operations-end-of-ph5) |
| Walking-skeleton cloud deployment early in PH3, not conditional | A late first contact with AWS risks the 10-mark criterion | M1-PH3-T12 |

## Milestone matrix: who delivers what in each phase

`(CP)` marks work needed for the 22 October checkpoint. Everything else may complete after the checkpoint.

| Phase | Naszrul (M1) | Zikri (M2) | Syauqi (M3) |
| --- | --- | --- | --- |
| PH1 | Repo skeleton, locked dependencies, dev Compose stack (CP); settings/secrets rules (CP); error envelope, request ID, log redaction, security headers (CP); migration 0002 auth_core plus `lock_active_actor` and `get_login_snapshot` (CP); Argon2id password service (CP); auth dependency interface and TMP-01 (CP); React API client, session provider skeleton, generated types; CI skeleton; CODEOWNERS | DB role bootstrap (CP); Alembic conventions, migration 0001, hardened-function template and lint (CP); `unit_of_work` RLS context helper (CP); constants and parity test (CP); migration 0003 parcels draft (CP); fixture dataset and loader (CP); DTO models | Test harness and Playwright skeleton (CP minimal); harmless file fixtures; pure state-machine and assignment modules with unit tests (CP); `ProofStore` interface; image-library decision; backup/maintenance lock design; migration 0005/0006/0007 drafts |
| PH2 | Real session: A01, A03, A04, A05; CSRF; rate-limit service v1; audit service v1; `require_*` dependencies; login/landing/logout screens; retire TMP-01; authorization-matrix harness | Verify 0003 policies; revision 0004 `create_parcel`; A10 v1; A11 v1; A12 v1; registration and list screens; RLS isolation tests | Seeded assignment fixture (TMP-02); `update_delivery_status` (start delivery only); A16; A17 v1; Rider mobile list and Start delivery action; Rider isolation tests |
| PH3 | A02 register; A06 password change; must-change gate; A07; A08; A09; A20; admin and account screens; maintenance-runner skeleton; walking-skeleton AWS deployment (disposable) | Replay-safe A10; A11 search/filter; A12 complete with slots; A13 and `lookup_tracking`; tracking screen; detail screen; retention selection function; full fixtures | Migrations 0006 proof and 0007 final functions; A14, A15 with `assign_parcel`; A16 full; A17 full with proof pipeline; A18; A19; admin and rider screens; proof viewer and action panel; retire TMP-02 |
| PH4 | Full authorization matrix; CSRF/session/race suites; failure-audit independence; incident and session-purge commands; runner jobs; security headers; log canary scan; M1 browser regression | RLS suites RLS-01 to RLS-09 and grants snapshot; retention job; concurrency (replay, collision, rollback); privacy regression across all states; rate-limit boundaries; injection/XSS corpus; scale-data EXPLAIN | Fault-injection matrix; orphan/unknown-commit reconciliation; proof purge job; concurrency (reassign vs finalize, duplicate final); upload attack corpus; local backup lock and restore drill; dashboard consistency; mobile interrupted-network journey |
| PH5 | EC2, security groups, TLS proxy, production Compose, secrets, first-boot sequence, Admin provisioning, Argon2 benchmark, cookie/CSRF/host verification, release/rollback, cloud journeys for auth, incident drill | Production DB bootstrap and grant verification, RLS under deployed credentials, retention scheduling verification, post-restore RLS check, scale queries on EC2, public-tracking checks over HTTPS | EBS layout, S3 backup and lifecycle, scheduler timers, restore exercise, restart/redeploy persistence, Android/4G upload test, orphan reaper on cloud |
| PH6 | Final M1 regression, M1 section of the security test document, demo and code walkthrough, allocation-sheet evidence | Same for M2 | Same for M3 |

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
| Retention | PH3 selection function | PH4 job and file purge | PH5 scheduled on AWS |
| Backup/restore without reviving sessions | PH1 lock design | PH4 local drill | PH5 AWS exercise |

No endpoint is exposed on a shared or cloud environment before its required access and privacy controls exist.

## Checkpoint versus final project

| Aspect | Checkpoint (end of PH2, 22 October) | Final project (G6) |
| --- | --- | --- |
| Scope | Three thin slices over one database and session | All of case-study sections 4 and 5 |
| Authentication | Seeded accounts, real server-side sessions | Registration, Rider creation, password change, disablement, incident commands |
| Parcels | Create, list own, detail | Replay safety, search, public tracking, retention |
| Delivery | Seeded Assigned parcel to Out for Delivery | Assignment, reassignment, Delivered and Failed with proof, dashboard |
| Hosting | Local Compose; cloud only if available and then disclosed | HTTPS on AWS |
| Evidence | Partial worksheet rows; honest "Planned" for the rest | Every row with actual result |

The checkpoint plan stays [separate](../checkpoint-plan.md); a passing checkpoint proves nothing about later phases.

## Priority tiers and cut line

Each task and test belongs to one tier. Unless listed below a task is MUST. Gates G3 to G6 pass on MUST and SHOULD work; STRETCH items are attempted when MUST and SHOULD are done, their actual results are reported honestly (including "not done"), and they never block a gate (D-36).

| Tier | Meaning | Members |
| --- | --- | --- |
| MUST | Required by the case study or rubric: the listed functions, each module's key security controls, the suggested test inputs, the policies, a cloud deployment with HTTPS and all roles online, the security test document, the live demonstration | All tasks not named below |
| SHOULD | Strengthens required controls, specified in the contract but not demanded by the sources | A20 audit viewer details (M1-PH3-T07), A21 reset and credential expiry (M1-PH3-T04 extension), account journal and restore reconciliation (M1-PH4-T05), backup lock and maintenance gate (M1-PH3-T10, M3-PH4-T07), local restore drill (M3-PH4-TC07), non-terminal retention (M2-PH3-T08 extension), grants snapshot and function branch table (M2-PH4-T01, T02), upgrade test (M2-PH4-T09), coverage thresholds, branch protection (M1-PH5-T10), restart persistence and documented restore procedure (M3-PH5-T05) |
| STRETCH | Valuable, but not needed for the rubric | Randomized race interleavings beyond five forced orderings (M1-PH4-TC07), fault points beyond FP1, FP4, FP5, FP7, FP9 (M3-PH4-T01), scale dataset above 30 000 parcels (M2-PH4-T08, M2-PH5-T06), real Android on 4G (emulation is acceptable) and capacity sampling (M3-PH5-T06, T07), the isolated AWS restore exercise with S3 and offline key (M3-PH5-T04), orphan reaper scheduling on cloud (M3-PH5-T09), `testssl.sh` depth and nightly matrix runs |

If time runs short the cut line is: finish MUST, report SHOULD as partial with the gap named, and drop STRETCH. A tier never lowers a security control that a MUST task depends on.

## Checkpoint execution rules

The 22 October checkpoint is a disclosed slice, not completion.

1. **Local checkpoint exit (G2-CP).** Each module demonstrates its three outcomes with the listed test subset run locally and its output kept: M1 login/protected page/logout (M1-PH2-TC01, TC02, TC03, TC06, TC07, TC15); M2 registration saved and listed, cross-Seller denial (M2-PH2-TC01, TC02, TC03, TC10, TC11, TC14); M3 Rider list and Start delivery with actor and time, cross-Rider denial (M3-PH2-TC01, TC02, TC04, TC09). CI is not required for G2-CP; everything else is reported as Planned.
2. **Full PH2 exit (G2)** adds the remaining PH2 tasks and test cases in CI.
3. During PH1 and PH2 a handoff counts as delivered when the producer's task is merged to the integration branch and its proving test passes locally; the consumer's confirmation comment is not required. The spine (role bootstrap, auth tables, parcel tables, `create_parcel`, login, `update_delivery_status`) may be pair-programmed on one integration branch.
4. Checkpoint-critical `(CP)` tasks include the minimal pieces their consumers need: error envelope and redaction (M1-PH1-T04, T05), API client and session provider (M1-PH1-T09), minimal DTOs and validators (M2-PH1-T07, T08), the detail route (M2-PH2-T05, T06).
5. If the spine is incomplete tomorrow, report it as partial and show what exists; never present mocks as working slices.

## Group gates

A gate passes only on repeatable evidence for the listed behaviors, permissions and data consistency, recorded with commit, environment and owner. Aggregate test counts or coverage percentages never substitute. All three owners sign each gate in the PR that records it. The integration scenarios each gate requires are listed once, in the [gate table of the integration scenarios](integration-tests.md#gate-use); the lists below name only the other criteria.

### G1: Foundation (end of PH1)

1. Clean checkout builds and `docker compose up` starts PostgreSQL, backend and frontend; health reports ready; PostgreSQL port is not published beyond localhost (OPS-01).
2. Role bootstrap and migrations 0001-0003 apply to an empty volume, then re-apply idempotently to an existing volume without changing passwords (MIG-01, MIG-02, M2-PH1-TC01).
3. Runtime roles are asserted at connection time: not superuser, no BYPASSRLS, no CREATE, no owner membership; the account tables and `audit_event` are protected from runtime DML as specified (RLS-01, M1-PH1-TC14).
4. Contract v3 reviewed by all three; enums, DB checks and TypeScript constants agree (CT-01); production startup refuses test-only hooks (CT-02); function-hardening lint is active (LINT-01).
5. Harness self-test proves per-test reset and role assertion (HAR-01); fixture loader is idempotent and refuses production (FIX-01).
6. CI jobs listed for PH1 in the [CI job list](testing-strategy.md#ci-and-release-gates) are green on the PR; secret scanning of tree and history is active.
7. Checkpoint-critical `(CP)` tasks complete. Non-CP PH1 tasks may complete during PH2 but must finish before the full PH2 exit.

### G2: Checkpoint slice (end of PH2)

1. INT-CP-01: seeded Seller and Rider log in through the real session endpoint; Seller registers a parcel, sees it after refresh; Rider A starts delivery on a seeded Assigned parcel; the change persists with actor and time (all on one database).
2. INT-CP-02: negative checks: wrong password, Seller B cannot fetch Seller A's parcel, Rider B cannot update Rider A's parcel, Seller cannot open a Rider/Admin endpoint, request without CSRF is rejected.
3. INT-CP-03: PH2 security baseline rows executed with actual results (listed in each PH2 file); everything not exercised stays "Planned".
4. TMP-01 and TMP-04 retired; remaining substitutes TMP-02 and TMP-03 are labeled in the demo.
5. Any gap is disclosed in the checkpoint report. A deployment plan does not satisfy this gate. Evidence for 22 October is the local subset above (G2-CP); the full gate also needs the PH2 tests in CI.

### G3: Functionally complete (end of PH3)

1. M1-F01-F05, M2-F01-F04 and M3-F01-F05 work through the React UI and direct API against real PostgreSQL.
2. The G3 scenarios pass in Playwright on Compose with the same images intended for deployment.
3. TMP-01 to TMP-05 are retired; TMP-06 stays test-only and guarded; no test-only principal or seed shortcut remains in the product code path.
4. Contract v3.x is frozen except via a reviewed change; endpoint, DTO and error-code conformance tests pass (CT-03).
5. Feature-level security rows for each endpoint have actual results.
6. The walking-skeleton cloud deployment (M1-PH3-T12) has run, or EXT-04 is escalated as the blocker for G5a with the consequence (5 marks lost from rubric 1b) recorded.

### G4: Hardened (end of PH4)

1. Every worksheet row M1-01-M1-12, M2-01-M2-10, M3-01-M3-10 and RLS-01-RLS-10 passes; S-01, S-03-S-06 and S-08 pass locally; S-02 passes for the local cookie and CSRF subset and S-07 and S-09 pass in the local drill, with the final results at G5. Rows backed only by STRETCH cases are reported separately.
2. The G4 scenarios pass, including pooled-connection, concurrency, fault-injection and retention interruption cases.
3. Full authorization matrix A01-A20 passes for every identity (M1-PH4-TC01).
4. Local backup and restore drill passes with an account-reconciliation test and a revoked-cookie replay and retention re-run (OPS-05).
5. Backend and frontend coverage gates are met, with required scenario lists (role matrix, transition edges, expiry/revocation, public allowlists) explicitly present; the security tools named in D-39 have run with results recorded.
6. No untriaged high or critical reachable dependency finding; no skipped required scenario; no flaky-rerun masking. A manual claim-versus-test review of the traceability rows has been done.

### G5: AWS and operations (end of PH5)

**G5a (rubric-critical minimum, MUST):**

1. Empty-volume first boot on EC2 followed by existing-volume restart (INT-12 first-boot and restart legs, OPS-06).
2. HTTPS, secure cookie, CSRF, allowed hosts, private database/application ports, private proof storage verified on the live stack (S-02).
3. The G5 scenarios run on the live URL for all four user types; RLS checks run under the deployed runtime credentials (OPS-08).
4. Restart/redeploy preserves rows and photos (S-07).
5. A failed release can be rolled back by image digest (M1-PH5-TC03).
6. Measured response times and memory on the chosen instance are recorded; no capacity claim is made beyond measurements.

**G5b (extended operations, SHOULD/STRETCH):**

7. Scheduled retention, session cleanup and (STRETCH) orphan reconciliation run safely twice and after interruption; failure recipient recorded (OPS-03).
8. Isolated restore exercise passes: counts, history, sample photos, grants, accounts reconciled, no old session valid, expired data re-anonymized (OPS-07; STRETCH on AWS, SHOULD locally).
9. S3 lifecycle, IMDSv2 and host-hardening checks pass.

### G6: Final acceptance (end of PH6)

1. The security test document lists, per module and owner, input, expected and actual result for more than five distinct input types, using the cloud deployment and release-candidate version, in the template defined in the [testing strategy](testing-strategy.md#final-security-test-document).
2. Full regression suite on the release candidate passes; known limitations are documented; open failures are listed, not converted.
3. Each member has rehearsed their approximately 10 minutes of the 30-minute demonstration (rubric key controls first) and can explain their own code.
4. Allocation-sheet evidence (EXT-01), lecturer variation record (EXT-02) and branch-protection status (EXT-03) are recorded as they actually stand.
5. Release tag, image digests and migration revision are recorded.

## Module completion

A module is complete when its phase files PH1-PH6 meet their exit criteria, its README definition of done is ticked with evidence, and G3-G6 pass. Coordinating shared work does not transfer ownership of another member's assessed code; each phase file marks owner-written tasks.

## Overlap rule

A task may start before the previous gate if every handoff it needs exists or has an approved temporary substitute (see [dependency matrix](dependency-matrix.md)). A phase is "complete" for a module only when that module's exit criteria pass; a gate passes only when all three modules' phase criteria and the group criteria pass. Do not merge a PR that changes an endpoint, DTO, status or permission without updating the contract, affected phase files and tests in the same PR.

## Phase status board

Update only with evidence references. No phase has started.

| Phase | M1 Naszrul | M2 Zikri | M3 Syauqi | Group gate |
| --- | --- | --- | --- | --- |
| PH1 | Planned | Planned | Planned | G1 not passed |
| PH2 | Planned | Planned | Planned | G2 not passed |
| PH3 | Planned | Planned | Planned | G3 not passed |
| PH4 | Planned | Planned | Planned | G4 not passed |
| PH5 | Planned | Planned | Planned | G5 not passed |
| PH6 | Planned | Planned | Planned | G6 not passed |
