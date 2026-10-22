# M3 PH1: Foundation and shared contracts

Owner: Syauqi (Qee110). Phase PH1 of [phase framework](../../../shared/phase-framework.md). Status: In progress locally, 22 October 2026; foundation code/tests exist, remaining cases and review/CI pending. See [actual evidence](../../../phase-1-progress.md). `(CP)` marks work required for the 22 October checkpoint.

## 1 Objective

Syauqi delivers what lets three people test the same system independently: a real-PostgreSQL test harness that asserts runtime roles and isolates each test, Playwright and harmless file fixtures, the pure (database-free) state machine and assignment rules with exhaustive unit tests, a private `ProofStore` and image-handling decision, the backup/maintenance coordination design, and drafts of the delivery migrations and function signatures that are merged later.

## 2 Entry criteria

- Reviewed plans merged; skeleton and Compose from M1-PH1-T01/T03 available (or Syauqi works in `tests/` and `src/server/modules/delivery/` on a branch).
- Role names agreed ([contract v3](../../../shared/system-contract.md#contract-v3-amendments)).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Roles bootstrap and `fixture_provisioner` credential | Zikri M2-PH1-T01 | H02 | Throwaway superuser database for early harness work; never committed |
| Constants (statuses, roles, transitions) | Zikri M2-PH1-T04 | H08 | Transition table from the contract copied into the pure module; replaced by the shared constants before G1 |
| Migration 0003 parcels (for migration drafts to apply on top) | Zikri M2-PH1-T05 | H09 | Draft SQL only; scratch apply after 0003 exists |
| Skeleton, Compose, CI job names | Naszrul M1-PH1-T01, T03, T11 | H01 | Local checkout |

Independent now: T01 (against any PostgreSQL), T03, T04, T05, T06 prototype.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH1-T01 (CP) | Vitest full-stack integration harness against a disposable full Supabase Compose project with unique ports/volumes. Apply real app migrations, assert connected runtime roles, provide controlled clocks/barriers and test-only principal injection, and start the actual Next.js HTTP server for route/cookie tests. App test data uses dedicated fixture credentials; vendor schemas remain intact | Harness negative control rejects owner-credential RLS tests and production fixture loading; independent suites do not share volumes | TC01 | H01 (or reviewable harness draft until skeleton exists) |
| M3-PH1-T02 | Playwright skeleton (`tests/e2e/`): projects for desktop and phone viewport, separate browser contexts for Seller A, Seller B, Rider A, Rider B, Admin and anonymous, helpers using real endpoints, trace/screenshot artifacts stored privately; harmless file fixture generator (`tests/fixtures/files/`) producing: valid JPG, valid PNG, oversize (3 MiB + 1), huge-dimension "decompression bomb" header, corrupt JPEG, truncated PNG, animated GIF and APNG, JPEG with appended script bytes, `shell.php.jpg`, `.php` renamed, text renamed `.png`, SVG with script labelled `.png`, zero bytes, double extension, null-byte and very long names; files are generated, contain no personal data and are never placed under any served path | Fixtures regenerate deterministically; manifest lists expected rejection reason per file | TC01, TC05 | H10 consumers |
| M3-PH1-T03 (CP) | Pure delivery rules in `modules/delivery/rules.ts`: `can_transition(actor_role, is_assigned, actor_active, from, to, has_proof)`, `required_next_actions`, `can_assign(actor_role, target_role, target_active, parcel_status)` and result types, using shared constants; no database or framework imports; exhaustive unit tests covering every status pair x actor variation | Illegal pairs, wrong actors and terminal immutability rejected with defined error codes `INVALID_TRANSITION`, `FORBIDDEN`, `PROOF_REQUIRED` | TC02, TC03 | H08 (or contract copy) |
| M3-PH1-T04 | ProofStore interface and full local Supabase Storage API adapter: bounded temporary staging, upload sanitized bytes under generated immutable keys with overwrite disabled, read/delete/exists/list-old objects in private delivery-proofs bucket. No direct storage.objects SQL writes, os-level rename or direct volume access. Private storage key stays server-only; parcel permission is enforced before privileged API access | Unit failure doubles plus real Storage API tests for private access, collision/no overwrite and immutable keys | TC04 | none |
| M3-PH1-T05 | Sharp spike: full JPEG/PNG decode/re-encode, reject corrupt/multiframe/over-12-megapixel inputs, strip metadata/trailing bytes, bound 3 MiB input/output and 4 MiB total body. Measure time/memory with the full Supabase stack running on the actual local machine; record native package compatibility, concurrency caps and provisional limits | Recorded measurements and attack fixtures, no untested 15-upload or fixed RAM claim | TC05 | T02 |
| M3-PH1-T06 | Backup and maintenance coordination design with a prototype test on real PostgreSQL (the implementation hooks belong to `unit_of_work({write: true})` in M2-PH1-T03 and the route-based gate in M1-PH3-T10; this task owns the key constants, the session-level backup lock protocol and the prototype): mutating transactions and maintenance jobs take a transaction-level shared advisory lock; the backup takes the exclusive lock to drain writers; a `system_state.maintenance_mode` flag makes the API reject new unsafe-method requests with `503 MAINTENANCE` while GET continues; document how the runner, upload path and backup script cooperate and how staged-but-unpublished files are excluded from backups | Prototype shows exclusive waits for shared holders and new writers fail fast | TC06 | M1-PH1-T06 (`system_state`) |
| M3-PH1-T07 | Drafts (not merged until 0004 exists): `0005_delivery_functions` (`update_delivery_status` with the start-delivery branch only, merged in PH2), `0006_delivery_proof` (`delivery_proof`, its policies and grants, merged first thing in PH3) and `0007_delivery_final` (`assign_parcel`, `lock_delivery_target`, reconcile helper, final-outcome branch of `update_delivery_status`); owner `domain_writer`; constraints (unique `parcel_id` and `storage_key`, key format CHECK, media type in JPEG/PNG, size between 1 and 3 MiB); the owner-role policies already exist in 0003; hardening template and LINT-01 pass | Scratch apply on top of 0004 passes; lint passes | TC07 | H09, H02, H03 |
| M3-PH1-T08 | Storage and reconciliation design note: `storage_key` = `<parcelId>/<random 32 hex>.<ext>` so a reconciler can lock the right parcel from the file path without a database mapping (D-13), staging files named by random IDs with no parcel info, age thresholds (24 hours), what the reaper may delete and in what order (lock parcel through the maintenance helper, wait, re-read committed references in a fresh statement, then delete), how unknown-commit outcomes are preserved | Reviewed by Zikri (RLS) and Naszrul (runner) | review PR | none |
| M3-PH1-T09 | Review and merge contract v3 amendments for M3: function signatures and error codes (`assign_parcel`, `update_delivery_status`, `lock_delivery_target`, `lock_parcel_for_reconcile`), upload limits and multipart settings, proof response headers, key format, backup coordination | Approved by all three; open items in the [decision register](../../../shared/decision-register.md) | review PR | none |

## 5 Affected components

`tests/harness/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, harmless fixture files, `src/server/modules/delivery/{rules,storage,images}.ts`, application migration drafts and Supabase private-bucket setup.

## 6 Security requirements

Tests prove RLS as the real restricted roles (negative control for owner connections); upload fixtures cover hostile files from the first day; storage outside any web root with unguessable keys and no traversal; test fixtures contain no personal data (P4); lock ordering and advisory-lock coordination defined before the first writer is built.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH1-TC01 | Harness (HAR-01) | Connect as each runtime role; connect as owner; run tests in random order; barrier between two connections; clone a test database from the template after a test that created sessions, audit and files | Role asserted; owner connection rejected by the harness; no cross-test leakage; barrier forces overlap; temp dirs 0700 | S-03, REV-09 |
| M3-PH1-TC02 | Unit (UT-D01) | All 5 x 5 status pairs x {Seller, assigned active Rider, unassigned Rider, inactive Rider, Admin} x proof present/absent | Only REGISTERED->ASSIGNED (Admin), ASSIGNED->OUT_FOR_DELIVERY (assigned active Rider, no proof), OUT_FOR_DELIVERY->DELIVERED/FAILED (assigned active Rider with proof) allowed; every other combination rejected with the defined code; terminal states immutable | M3-06, M3-09 |
| M3-PH1-TC03 | Unit (UT-D02) | Assign to active Rider, inactive Rider, Seller, Admin; REGISTERED, ASSIGNED, OUT, DELIVERED; same Rider; stale version | Allowed only for active Rider on unfinished parcel; same Rider is a no-op; terminal rejected; stale detected by caller contract | M3-F01, M3-F05 |
| M3-PH1-TC04 | Unit and Storage integration (UT-D03/D04) | Stage/sanitize/upload/read/delete; overwrite same key; traversal, absolute path, uppercase, null byte and malformed keys; direct anonymous bucket request | Valid API flow works; invalid keys rejected; overwrite refused; no direct volume access; private object reads require authorized server path | M3-05 |
| M3-PH1-TC05 | Spike (UT-D03) | Run fixture manifest through the chosen library with limits | Each hostile fixture rejected for the documented reason; valid ones re-encoded without EXIF; peak memory and time recorded under budget | M3-03, M3-04 |
| M3-PH1-TC06 | Integration (OPS-04 prototype) | Two writers hold the shared lock; backup requests exclusive; third writer arrives with flag set | Exclusive waits until writers finish; third writer receives immediate maintenance rejection | REV-08 |
| M3-PH1-TC07 | Migration (MIG-01) | Apply drafts on a scratch database after 0004; insert two proofs for one parcel, key `../x`, size 4 MiB, media type `image/gif` | Constraints reject; function lint passes | M3-F03 |
| M3-PH1-TC08 | Review | Walk the design note against the failure points in [system contract](../../../shared/system-contract.md#proof-consistency-and-retention) | Every failure point has a defined action; no deletion path without lock-and-recheck | REV-13 |

## 8 Deliverables and handoffs

H10 (harness, Playwright skeleton, file fixtures) to everyone; H13 (ProofStore interface, coordination design, storage layout) to Naszrul (runner, middleware) and Zikri (retention). Consumers confirm they can run an integration test under the harness and a Playwright smoke through the skeleton.

## 9 Exit criteria

- T01-T09 merged/approved; TC01-TC08 pass (TC08 is review sign-off). CP subset: T01 (minimal) and T03.
- Naszrul and Zikri each ran a test through the harness with role assertion.
- Contributes to G1 items 3, 5.

## 10 Integration checkpoint

Harness runs Zikri's RLS-01 and Naszrul's `lock_active_actor` tests unchanged; Playwright smoke logs in with the harness helper once M1 lands in PH2.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Harness delayed and blocks everyone | Ship minimal role-asserting connections and per-job fresh database first (CP); add barriers/clock later in PH1 |
| Library cannot meet memory budget | Lower pixel limit or choose another library through the decision register before PH3 |
| Locking design disputes | Resolve in the review PR with the prototype test as evidence |

## 12 Deferred work

Merging 0005 start-delivery function and A16/A17 (PH2); full assignment, proofs, dashboard (PH3); fault injection, reaper, purge, backup implementation (PH4); persistent volumes/off-host backup and restore (PH5).
