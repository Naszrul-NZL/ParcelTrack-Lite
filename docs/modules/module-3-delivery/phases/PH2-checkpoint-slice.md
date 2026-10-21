# M3 PH2: Initial working checkpoint slice

Owner: Syauqi. Phase PH2 of [phase framework](../../../shared/phase-framework.md). Status: Planned. This is the 22 October checkpoint slice, not M3 completion.

## 1 Objective

An assigned Rider logs in on a phone-width screen, sees only their own assigned parcels, starts delivery on one (ASSIGNED to OUT_FOR_DELIVERY), and the change persists with the Rider as actor and a server timestamp in history; another Rider cannot see or change it. Assignment is seeded (TMP-02). Syauqi also compiles the checkpoint evidence for the three slices.

## 2 Entry criteria

- G1 CP subset passed; migrations 0001-0003 applied; harness (M3-PH1-T01) and pure rules (M3-PH1-T03) available.
- M1 real login and `login_as` (H20) arrive during PH2; until then TMP-01/TMP-04.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Parcel and history tables with RLS, fixture loader, assigned profile hook | Zikri M2-PH2-T01, T08 | H25 | Loader hook agreed in PH1; Syauqi adds the dataset rows |
| `lock_active_actor`, `require_role`, `verify_csrf`, `principal_uow` | Naszrul M1-PH1-T07, M1-PH2-T03, T06, T08 | H03, H04, H20 | TMP-01 in the test factory only |
| `login_as`, real cookies | Naszrul M1-PH2-T09 | H20 | TMP-04 |
| Detail endpoint A12 v1 and DTOs | Zikri M2-PH1-T07, M2-PH2-T06 | H12, H22 | Rider list links to a placeholder until A12 v1 merges |
| API client, session provider | Naszrul M1-PH1-T09 | H06 | MSW mocks (TMP-03) |

Independent now: T02 (database function), T04 after 0003.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH2-T01 (CP) | Fixture profile for the slice, owned here (**TMP-02**; Zikri's loader only provides the hook): ASSIGNED parcels assigned to Rider A and to Rider B, REGISTERED parcels for later assignment; contributed to Zikri's loader through the test-only provisioner; each row labeled `seeded` in a manifest so the demo states that assignment is seeded | Re-runnable without duplicates; synthetic data | TC11 | H25 |
| M3-PH2-T02 (CP) | Revision `0005_delivery_functions` with `update_delivery_status(parcel_id, expected_version, new_status, proof_key, proof_media_type, proof_size)` hardened and owned by `domain_writer` (policies and grants already exist in 0003): derives actor and session version from the transaction context, calls `lock_active_actor(..., {RIDER}, FOR SHARE)`, locks the parcel row, checks assignment to the actor, expected version and transition from the shared table, updates `current_status` and `version`, appends history (actor; timestamp taken after the lock as `GREATEST(clock_timestamp(), latest earlier changed_at)` so ordering cannot invert) and audit `STATUS_CHANGED`; in PH2 only ASSIGNED to OUT_FOR_DELIVERY is accepted and any final outcome returns `PROOF_REQUIRED` | Function rejects every other transition and wrong actor; DB result equals `rules.py` | TC01-TC05, TC12 | H03, H09, H07 |
| M3-PH2-T03 (CP) | A17 `POST /rider/parcels/{parcelId}/status` v1: `multipart/form-data` fields `status` and `expectedVersion`, no file in PH2 (a file part returns `422 PROOF_NOT_ALLOWED` for start delivery); declares no `File()/Form()` parameters (the body is parsed after authentication and CSRF dependencies; the schema is published with `openapi_extra`); Rider only through `require_role`; CSRF; strict field validation (unknown status 422); all work in `principal_uow`; response `ParcelDetail`; stale version 409; inaccessible parcel uniform 404; never accepts actor, time or assignment fields | Response commits before returning | TC01-TC04, TC07 | H20, T02 |
| M3-PH2-T04 (CP) | A16 `GET /rider/parcels` (the must-change gate of `require_authenticated` applies): assigned parcels only (RLS plus explicit `assigned_rider_id` filter), `status` filter from enum, newest first with id tie-break, pagination (cap 100), `ParcelSummary`; disabled or password-change-required Rider refused | Rider B never sees Rider A's rows | TC06 | H12, T01 |
| M3-PH2-T05 (CP) | React `/rider/parcels` for phone widths: list with tracking number, status and a single permitted next action (Start delivery for ASSIGNED), links to `/parcels/:id`, loading/empty/error states, visible focus, touch targets, disabled button while pending; refetch after success and after 409; uncertain network result prompts a refetch, never an automatic resubmission | Component and browser tests | TC08, TC09 | H06, H22 |
| M3-PH2-T06 (CP) | Security baseline tests and worksheet entries: M3-01, M3-06 (unknown status, skipped transition), M3-07, M3-09 (Admin denied), RLS-03, S-01 for A17, stale-version 409 | Actual results recorded with commit; other M3 rows stay Planned | TC02-TC05, TC07, TC13, TC14 | T02-T04 |
| M3-PH2-T07 | Playwright slice test on the phone project: Rider A login, list, start delivery, refresh, Rider B context cannot see or open it | Runs in CI on Compose | TC09 | H10, H20 |
| M3-PH2-T08 | Checkpoint evidence compilation for INT-CP-01, INT-CP-02, INT-CP-03: run the combined scenario on one database, capture commit, migration revision, outcomes and any failures, list items still Planned | Evidence file in the checkpoint report; honest status per slice | scenario run | all slices |
| M3-PH2-T09 | M3 checkpoint demo script: Rider B denied, stale version rejected, Admin denied, start delivery persisted with actor/time; assignment, upload, Failed outcome, dashboard named as planned | Rehearsed on the checkpoint commit | demo notes | T07 |

## 5 Affected components

- Database: revision 0005 `update_delivery_status` (the `domain_writer` grants and owner-role policies already exist in 0003).
- Backend: `modules/delivery/{routes_rider.py,service.py,repository.py}`.
- Frontend: `features/delivery/RiderParcelListPage.tsx`, action button component.

## 6 Security requirements

Assigned-Rider check in SQL (function) and in the service; RLS isolation; actor, time and ownership never from the client; status allowlist and transition table; expectedVersion; CSRF on multipart; uniform 404; audit with actor and time; account-active recheck under lock; generic errors. Policies P1, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH2-TC01 | Integration (IT-D01) | Rider A starts delivery on own ASSIGNED parcel with current version | 200; status OUT_FOR_DELIVERY, version +1; exactly one new history row (actor Rider A, server time) and one `STATUS_CHANGED` audit row; earlier history unchanged | M3-07, M3-F03 |
| M3-PH2-TC02 | Integration (IT-D01) | Rider B on Rider A's parcel; Seller; Admin; anonymous | 404, 403, 403, 401; status/history/audit unchanged | M3-01, M3-09 |
| M3-PH2-TC03 | Integration (UT-D01 link) | `SHIPPED`; ASSIGNED to DELIVERED; OUT_FOR_DELIVERY to DELIVERED without proof; file part on start | 422 invalid status; 409 `INVALID_TRANSITION`; 422 `PROOF_REQUIRED`; 422 `PROOF_NOT_ALLOWED`; no history rows added | M3-06 |
| M3-PH2-TC04 | Integration (IT-D01) | Stale `expectedVersion`; same request twice | 409 `VERSION_CONFLICT`; second request does not duplicate history | M3-F03 |
| M3-PH2-TC05 | RLS (RLS-03) | Rider B context unfiltered `SELECT` and direct `UPDATE` on Rider A's parcel as `app_runtime`; call `update_delivery_status` under Rider B context; disabled Rider A | Reads show only Rider B's rows; UPDATE denied; function rejects wrong assignee and inactive actor | RLS-03, M3-01 |
| M3-PH2-TC06 | Integration (IT-D04 link) | Rider A list with filter and pagination; Rider B; disabled Rider; must-change Rider | Only assigned rows; filter by status; 401 for disabled; `403 PASSWORD_CHANGE_REQUIRED` for must-change (after M1-PH3) | M3-F02 |
| M3-PH2-TC07 | Integration (S-01) | A17 without or with wrong CSRF token | 403 `CSRF_INVALID`; no change | S-01 |
| M3-PH2-TC08 | Component (CMP-D01) | Rider list at 375px: states, one next-action button, pending, 409, network failure | Only permitted action shown; button disabled while pending; refetch on 409; no auto retry; visible focus; labels | M3-F02 |
| M3-PH2-TC09 | Browser (E2E-D01) | Phone project: Rider A start delivery, refresh; Rider B context | Persisted OUT_FOR_DELIVERY; Rider B list lacks parcel; direct URL shows not found | INT-CP-01, INT-CP-02 |
| M3-PH2-TC10 | Integration (IT-A01 matrix) | Matrix rows for A16 and A17 across identities | Match contract | authz matrix |
| M3-PH2-TC11 | Fixture (FIX-01) | Load seeded parcels twice | Present once; manifest marks them seeded | TMP-02 |
| M3-PH2-TC12 | Contract and integration | For every (from, to) pair supported in PH2 call the SQL function and compare with `rules.py` | Identical accept/reject outcomes | CT-01 extension |
| M3-PH2-TC13 | Integration (IT-A04 link) | Inspect `audit_event` and logs for a status change | Actor ID, parcel ID, old/new status, timestamp, request ID; no address or phone | S-05, P5 |
| M3-PH2-TC14 | Integration (IT-A03 link) | Disable Rider A (database or M1 path when available), then call A16/A17 with old cookie | 401; parcel unchanged | M1-09 link |
| M3-PH2-TC15 | Static and integration | Static scan of `modules/delivery` for SQL assembled from request values; SQL text in the A16 `status` filter and in `parcelId` and `riderId` parameters | No string-built SQL; injection strings give 422 or 404, never 500 or broadened results | M3 parameterized queries, P4 |

## 8 Deliverables and handoffs

H23 (`update_delivery_status` v1, A16/A17 v1) used by the checkpoint scenario; TMP-02 labeled for the demo. The checkpoint evidence file goes to the group report. Zikri and Naszrul confirm via INT-CP-01 on the same database.

## 9 Exit criteria

- T01-T08 complete (T09 rehearsed); TC01-TC15 pass in CI (the local checkpoint subset is in the [phase framework](../../../shared/phase-framework.md#checkpoint-execution-rules)).
- Rider path of INT-CP-01 and negative cases of INT-CP-02 pass with real sessions.
- Contributes to G2 items 1-5.

## 10 Integration checkpoint

On the same database and cookies: Seller A's parcel (Zikri) appears for Admin in A12; the seeded Rider flow completes; Naszrul's login protects every call. INT-CP-01 to INT-CP-03 run by Syauqi and attached to the checkpoint report.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| `domain_writer` lacks needed grants | Add exactly the missing privilege in a reviewed migration; never widen `app_runtime` |
| Seeded data mistaken for real assignment | Manifest and demo wording; real assignment arrives in PH3 and TMP-02 is retired there |
| Phone-width layout late | Ship list and button functionally; layout polish continues in PH3 |

## 12 Deferred work

Assignment endpoints and UI, proof pipeline, Delivered and Failed outcomes, dashboard, proof streaming (PH3); fault injection, reaper, purge (PH4).
