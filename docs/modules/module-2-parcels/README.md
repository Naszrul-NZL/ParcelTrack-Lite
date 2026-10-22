# Module 2 Parcel Registration and Public Tracking

Owner: Zikri, GitHub Zikri809. Deliver backend parcel functionality, the shared database/RLS foundation and the React parcel/tracking feature. This folder is the full phased plan, not only the first checkpoint slice. Phase 1 foundation code and local tests now exist; see [actual progress and open gates](../../phase-1-progress.md). Later workflows remain planned and owner reviews are pending.

Use the [shared contract](../../shared/system-contract.md), [phase framework](../../shared/phase-framework.md), [dependency matrix](../../shared/dependency-matrix.md), [ERD](../../initial-erd.md) and [security worksheet](../../security-tests.md). Exact types, status values, validation, routes and permission rules are defined centrally. RLS/grant assertions use the actual restricted PostgreSQL roles; mocks cannot replace them.

## Contents of this folder

| File | Purpose |
| --- | --- |
| [phases/PH1-foundation.md](phases/PH1-foundation.md) | Role bootstrap, node-pg-migrate base, `unit_of_work`, constants, migration 0003, fixtures, DTOs |
| [phases/PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) | `create_parcel`, A10/A11/A12 v1, Seller screens, RLS isolation tests |
| [phases/PH3-complete-functionality.md](phases/PH3-complete-functionality.md) | Replay-safe creation, search, full detail with slots, public tracking, retention functions |
| [phases/PH4-hardening-regression.md](phases/PH4-hardening-regression.md) | Complete RLS suites, grant snapshot, retention job, concurrency, privacy regression, scale checks |
| [phases/PH5-cloud-operations.md](phases/PH5-cloud-operations.md) | Production DB bootstrap, RLS under deployed credentials, retention on schedule, cloud privacy |
| [phases/PH6-final-acceptance.md](phases/PH6-final-acceptance.md) | Final regression, test document, demo, RLS evidence |
| [test-plan.md](test-plan.md) | Test coverage by feature, requirement, phase and test case |

## Required functionality

| Feature ID | Function | Observable finished behavior | Works partially | Complete and tested |
| --- | --- | --- | --- | --- |
| M2-F01 | Seller registers a parcel | Valid recipient details/weight create a parcel, random tracking number and initial Registered history in one transaction | PH2 | PH4 |
| M2-F02 | Seller views and searches own parcels | Paginated list, literal search, status filter and detail page reveal only the logged-in Seller's parcels | PH2 | PH4 |
| M2-F03 | Public tracking | Anyone supplies an exact tracking number and receives only status/date/time history without login | PH3 | PH4 |
| M2-F04 | Personal-data lifecycle | Private/public field boundaries remain intact and eligible recipient data is anonymized after the retention period | PH3 | PH4 |

Tracking identifiers are generated on the server. Recipient accounts, parcel editing/deletion, batch import/export and courier-provider APIs are outside the required scope. Shared private detail reading serves Seller, assigned Rider and Admin without duplicating permission logic.

## Phase overview

| Phase | Objective | Key tasks | Depends on | Exit |
| --- | --- | --- | --- | --- |
| PH1 | One database model nobody can bypass; shared definitions | T01-T02 roles and node-pg-migrate base (first on the group critical path), T03 `unit_of_work`, T04 constants, T05 complete 0003 with all policies, T06 fixtures | H01, later H03 | G1 |
| PH2 | Seller creates and sees a real parcel under RLS | T01 policy tests, T02 `create_parcel` (0004), T03 A10, T04 A11, T05 UI, T06 A12 v1 | H03, H04, H20 | G2 |
| PH3 | Complete M2 features | T01 replay, T02 search, T03-T07 detail/tracking, T08 retention functions | H21, H35 | G3 |
| PH4 | Prove RLS, privacy, concurrency, retention | T01-T03 RLS/hardening, T03 job, T04-T08 suites | H33, H40 | G4 |
| PH5 | Database and tracking on the chosen cloud host | T01-T03 bootstrap/grants/RLS under deployed creds, T07 tracking over HTTPS | H50, H51, H53, H54 | G5 |
| PH6 | Final evidence and demonstration | T02 document, T04 demo | G5 | G6 |

## What M2 provides and consumes

| Provides | To | Phase |
| --- | --- | --- |
| H02 roles/node-pg-migrate/hardening template and lint; H07 `unit_of_work`; H08 constants; H09 migration 0003; H11 fixtures; H12 DTOs | Naszrul, Syauqi | PH1 |
| H22 `create_parcel`, A10, A12 v1; H25 parcel fixtures | Syauqi, group | PH2 |
| H34 complete detail and slot contract; H36 retention functions | Syauqi, Naszrul | PH3 |
| H40 retention job; matrix rows and grants snapshot | Syauqi, Naszrul | PH4 |
| H52 grant verification and RLS runner | Naszrul, Syauqi | PH5 |

Consumes: H03 (0002, `lock_active_actor`), H04/H20 (auth), H21 (rate limit, audit), H10 (harness), H35 (proof table and components), H33 (runner), H13 (lock design), H50-H54 (cloud stack). Substitutes: see the [handoff register](../../shared/dependency-matrix.md#handoff-register).

## Interfaces and routes

- /seller/parcels: own-parcel table/list, search, status filter, pagination, clear empty state and link to registration/detail.
- /seller/parcels/new: recipient name, international phone, delivery address and weight. Show field constraints, validate on the server, prevent duplicate submission and show the returned tracking number after success.
- /parcels/:id: shared authorized detail/history page. Private recipient fields appear only after a successful authorized response. Syauqi supplies the Rider action panel and proof viewer through typed slots; Admin assignment UI links here.
- /track: public tracking form and status timeline. Show no recipient fields, actor names, proof URLs or hidden private payloads. Copy/share UI must not leak tokens into third-party analytics or referrers.

Search/filter changes reset pagination and stale results. A previous user's parcel list is cleared on identity change. Handle 401, inaccessible 404, validation 422, rate-limit 429, unknown tracking number and temporary server/network failures distinctly without disclosing private data.

## API and data ownership

Own A10 through A13 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Own parcel and parcel_status_history schema (migration 0003) plus safe summary/detail/public DTOs, the role bootstrap, the node-pg-migrate conventions, the RLS context helper, constants and the fixture loader. Syauqi authors assignment/delivery writes against these tables through the agreed functions; Zikri reviews shared schema changes. No module creates a second Parcel model or status-history table.

Zikri coordinates migration ordering but does not take ownership of other members' assessed code: Naszrul writes 0002, Syauqi writes 0005 to 0007, each reviewed for function hardening; 0003 is complete in PH1 and never edited.

## Work package map

| Work package | Phase tasks |
| --- | --- |
| M2-W01 Models and constraints | M2-PH1-T05, M2-PH2-T01 |
| M2-W02 RLS foundation | M2-PH1-T01 to T03, M2-PH2-T01, M2-PH4-T01, T02 |
| M2-W03 Registration | M2-PH2-T02, T03 |
| M2-W04 Retry-safe creation | M2-PH3-T01 |
| M2-W05 Seller reads/search | M2-PH2-T04, T06, M2-PH3-T02, T03 |
| M2-W06 Public lookup | M2-PH3-T04 to T06 |
| M2-W07 React feature | M2-PH2-T05, M2-PH3-T06, T07 |
| M2-W08 Retention | M2-PH3-T08, M2-PH4-T03 |
| M2-W09 Integration and evidence | M2-PH3-T11, M2-PH4, M2-PH5, M2-PH6 |

## Transaction and privacy details

Registration cannot leave a parcel without Registered history. Public lookup must read committed history only. A changed status is displayed by querying the same database; no separate copied tracking database or manual update is introduced.

Use Zod response models with explicit field allowlists. For public tracking, return exactly {history:[{status,changedAt}]}. The response must exclude private fields even if the React screen would not display them. A valid unknown token gives safe 404; malformed input gives 422; throttled requests give 429. Display server-returned timestamps in Malaysia time on the frontend.

Private detail calls use the same role/ownership policy for Seller, assigned Rider and Admin. Authorizing the parent parcel is required before reading history or proof metadata. Reassignment immediately removes the old Rider's access. After anonymization, private detail shows the retained history with recipient fields null and an explicit anonymized state; public tracking continues to work.

Retention uses terminalAt, with the P3 Delivered deadline and the documented extension for Failed parcels (D-06). Proof access is blocked before file cleanup (the `anonymized_at` flag is the hand-off to Syauqi's purge job), and retryable cleanup must be safe to rerun. No browser-triggered cleanup endpoint or public export route is added.

## Security and policies

P1 requires Seller ownership and authorized private reads. P3 requires public-data minimization and retention. P4 requires parameterized SQL, safe text rendering, input validation, synthetic data and generic internal errors. Cryptographic randomness prevents predictable tracking tokens, while lookup limits constrain enumeration attempts.

RLS is tested independently of an application WHERE seller_id filter. It does not replace parameterization or safe serializers. React renders recipient strings as text and never through raw HTML. Prevent SQL injection in both search values and dynamic sort choices. Do not put addresses, passwords or tracking request bodies into routine logs.

## Testing and acceptance

All M2 tests are listed per phase and aggregated in [test-plan.md](test-plan.md). Run worksheet rows M2-01 to M2-10, RLS-01 to RLS-09 (RLS-03 and RLS-10 jointly with Syauqi) and the M2 shares of S-01, S-03, S-08. Use real PostgreSQL for RLS/transaction tests and browser tests for UI/privacy checks. Record exact input, expected/actual outcomes, safe evidence and Zikri's name. Keep more than five distinct security input types in the final record.

### Checkpoint slice versus completion

The checkpoint slice is M2-PH2: one registration form creates a real parcel and displays it in the Seller's own list with its generated token and persistence after refresh, plus another Seller's denied access. Public tracking, search, replay safety, retention and the hardening suites follow; the slice is not M2 completion.

### Module definition of done

Tick a box only with a linked passing result from the stated phase.

- [ ] PH1 exit criteria met (G1): roles, node-pg-migrate base, `unit_of_work`, constants, 0003, fixtures, DTOs.
- [ ] PH2 exit criteria met (G2): create and list own parcels under RLS; A12 v1; cross-Seller denial.
- [ ] M2-F01 through M2-F04 have observable evidence and A10 through A13 pass conformance (G3).
- [ ] Seller and public response privacy verified at API, browser and log levels (G4).
- [ ] Registration is transactional/retry-safe; tracking tokens are cryptographically random.
- [ ] RLS-01 to RLS-09, injection, XSS, validation, lookup limits and retention checks pass with the grants snapshot enforced (G4).
- [ ] M2 unit/component and real-PostgreSQL/API suites meet the testing strategy gates, including concurrent creation/replay and retention boundaries.
- [ ] M1 sessions and M3 history/proof updates work through the shared detail/tracking screens.
- [ ] Database bootstrap, grants and retention verified on the chosen cloud host (G5).
- [ ] Zikri can demonstrate the module and explain its schema, RLS and security controls on the chosen cloud host (G6).
