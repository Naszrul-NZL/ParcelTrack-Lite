# M2 PH2: Initial working checkpoint slice

Owner: Zikri. Phase PH2 of [phase framework](../../../shared/phase-framework.md). Status: Planned. This is the 22 October checkpoint slice, not M2 completion.

## 1 Objective

A logged-in Seller registers a parcel through the React form; the server creates it in PostgreSQL with a random tracking number and a REGISTERED history row under RLS; the Seller sees it in their own list after refresh; another Seller cannot retrieve it. The shared private detail endpoint (A12 v1) exists for Qee's Rider screen and for the ownership demonstration.

## 2 Entry criteria

- G1 CP subset passed: M2-PH1 T01-T06, M1-PH1 T01-T03/T06-T08/T10, M3-PH1 T01/T03.
- Migrations 0001-0003 apply; `unit_of_work` and fixtures usable.
- Real login (H20) is expected during PH2; until then tests use TMP-04 (session row inserted by the provisioner) or TMP-01 in the test factory.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| `lock_active_actor` function | NASZ M1-PH1-T07 | H03 | none (merged in PH1) |
| `require_authenticated`, `require_role`, `verify_csrf`, `principal_uow` | NASZ M1-PH2-T03, T06, T08 | H04, H20 | TMP-01 test principal and test-only CSRF stub until H20; removed before G2 |
| `login_as` helper and real cookies for INT-CP-01 | NASZ M1-PH2-T09 | H20 | TMP-04 |
| API client, session provider | NASZ M1-PH1-T09 | H06 | MSW mock (TMP-03) |
| Playwright skeleton, harness, controlled clock | Qee M3-PH1-T01, T02 | H10 | none |
| Rider assigned fixtures consume this loader | Qee M3-PH2-T01 | H25 | Zikri ships loader hook first |

Independent now: T01, T02 (database), T04 partial.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH2-T01 (CP) | Verify (no new revision; 0003 is complete and never edited): execute the policy tests for Seller own / Rider assigned / Admin all reads, empty identity and stale `session_version` yielding zero rows, owner-role policies working for `domain_writer`, and the `app_runtime` SELECT-only grants; any defect is fixed forward in a new revision | Policies tested by TC06-TC09 | TC06-TC09 | H03, H07 |
| M2-PH2-T02 (CP) | Revision `0004_create_parcel`: `create_parcel` database function (`SECURITY DEFINER`, owner `domain_writer`, hardened): reads actor and session version from the transaction context, calls `lock_active_actor(..., {SELLER})`, inserts parcel (`seller_id` from context, status REGISTERED, version 1, `client_request_id`, fingerprint, token), inserts first history row (`changed_by` = actor, server `now()`), inserts audit event `PARCEL_REGISTERED` (IDs only), returns the new row; raises defined codes on tracking-token unique violation (retriable) versus other violations | All inserts in one transaction; no client-controlled actor/time/status | TC01, TC05, TC08 | H03, T01 |
| M2-PH2-T03 (CP) | A10 `POST /parcels`: Seller only via `require_role`; CSRF; request `{recipientName, recipientPhone, recipientAddress, weightKg, clientRequestId}` with `extra=forbid`; server-side validation from PH1 validators; generate token and retry up to three times only when the function reports a tracking-token collision; response 201 `ParcelDetail`; same `clientRequestId` returns 409 `IDEMPOTENCY_CONFLICT` for now (replay returns the original in PH3); all work inside `principal_uow`; no commit after response | Field errors for bad data; no parcel created on failure | TC01-TC05 | H20, H07 |
| M2-PH2-T04 (CP) | A11 `GET /seller/parcels`: paginated own parcels newest first with id tie-break (`page`, `pageSize` default 20, cap 100), `ParcelSummary`; query is parameterized and keeps an explicit `seller_id` filter in addition to RLS; no search yet | Only own rows; total counts own only | TC11 | T01 |
| M2-PH2-T05 (CP) | React: `/seller/parcels/new` (labels with constraints, server field errors, submit disabled while pending, client request ID generated once per form instance and kept across failures, token displayed after success with link to detail) and `/seller/parcels` (table/list, empty state, pagination, error states); identity change clears cached lists; also the read-only `/parcels/:id` detail route (recipient fields as text, history, not-found state for inaccessible IDs) that the Seller list, the Rider list and TC14 link to | Components render recipient strings as text only | TC12, TC13 | H06, T03, T04 |
| M2-PH2-T06 (CP) | A12 v1 `GET /parcels/{parcelId}`: shared private detail service for Seller own, Rider assigned and Admin all; reads parcel and history through `principal_uow` under RLS; returns `ParcelDetail` fields available in PH2 (recipient, status, history ordered by `changed_at` then `id`, `version`); inaccessible and nonexistent IDs return the same 404 (identical status, code, message and shape); invalid ID format 422 | Cross-user access impossible by ID guessing | TC10, TC15 | T01 |
| M2-PH2-T07 (CP) | Security baseline tests and worksheet entries for this slice: M2-03 (validation), M2-04 (cross-Seller read), M2-08, M2-09 (role and forged fields), RLS-02, RLS-04, RLS-05, partial RLS-06 (direct DML denied, function derives actor), S-01 for A10 | Actual results with commit recorded; remaining M2 rows stay Planned | TC02-TC10 | T01-T06 |
| M2-PH2-T08 | Fixture profiles: Seller A and B REGISTERED parcels; the loader hook for Qee's profile of ASSIGNED parcels for Rider A and Rider B (**TMP-02**: Qee owns the profile data, the loader inserts assignment history through `SET ROLE domain_writer`, not through the real assignment function); expose profile names | Profiles idempotent; labeled as seeded | TC14, TC16 | H11 |
| M2-PH2-T09 | Browser slice test and INT-CP-01 Seller path in Playwright using real login: create, token shown, refresh, list, logout, Seller B cannot open Seller A's detail | Runs against Compose with fixtures | TC14 | H20, H10 |
| M2-PH2-T10 | M2 checkpoint demo script: invalid weight rejected, registration, token, refresh persistence, Seller B 404 on Seller A's ID, Rider/Admin denied on A10; tracking page, search, replay safety, retention named as planned | Rehearsed on checkpoint commit | demo notes | T09 |

## 5 Affected components

- Database: revision 0004 `create_parcel` (0003 policies exercised, not edited).
- Backend: `modules/parcels/{routes.py,service.py,repository.py}` (A10, A11, A12 v1), shared detail service.
- Frontend: `features/parcels/{RegisterParcelPage,SellerParcelListPage,ParcelDetailPage}.tsx` (detail page v1 with plain read-only view; slots arrive in PH3).

## 6 Security requirements

Seller derived from the session, never from the body; server-side validation; parameterized SQL; RLS ownership isolation independent of application filters; no direct runtime DML; function derives actor and re-locks the actor; unique and random tracking token; uniform 404; CSRF on creation; generic errors; audit without addresses; recipient data rendered as text. Policies P1, P3 (collection limited to delivery), P4.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH2-TC01 | Integration (IT-P01) | Seller A POST /parcels with valid body | 201; one `parcel` (status REGISTERED, version 1, seller A), exactly one history row (REGISTERED, actor Seller A, server time), one `PARCEL_REGISTERED` audit row; token `PTL-` + 32 uppercase hex | M2-F01, M2-05 |
| M2-PH2-TC02 | Integration (IT-P01) | Rider, Admin, anonymous POST; Seller POST with extra `sellerId`, `assignedRiderId`, `currentStatus`, `trackingNumber` | 403, 403, 401; 422 for extra fields; zero rows created | M2-08, M2-09, RLS-06 |
| M2-PH2-TC03 | Unit and integration (UT-P01) | Phone `0123`, weight `0`, `-5`, `abc`, `1e2`, `NaN`; empty name; 121-character name | 422 with field names; no parcel or history | M2-03 |
| M2-PH2-TC04 | Integration (S-01) | POST without CSRF header, with other session's token | 403 `CSRF_INVALID`; nothing created | S-01 |
| M2-PH2-TC05 | Integration (IT-P01) | Fault in audit insert; generator patched to return an existing token once; weight CHECK violation | No parcel or history remains after audit failure; collision retried and succeeds with new token; CHECK violation not retried | M2-F01 |
| M2-PH2-TC06 | RLS (RLS-02) | Seller A context: `SELECT * FROM parcel` unfiltered; Seller B same | Only own rows each | RLS-02 |
| M2-PH2-TC07 | RLS (RLS-04) | No context, stale session version, nonexistent user id | Zero rows, no error leak | RLS-04 |
| M2-PH2-TC08 | RLS (RLS-06 partial) | As `app_runtime`: INSERT/UPDATE/DELETE on parcel and history; call `create_parcel` as `tracking_runtime`; forged actor in context set by test code vs function lock | DML denied; wrong role cannot execute; actor lock rejects a Rider context | RLS-06, RLS-09 |
| M2-PH2-TC09 | RLS (RLS-05) | One pooled connection: Seller A commit, Seller B rollback, anonymous | Each transaction sees only its own context | RLS-05, INT-08 |
| M2-PH2-TC10 | Integration (IT-P02) | Seller B GET detail for Seller A's ID and for a nonexistent ID; unassigned Rider; assigned Rider; Admin | 404 identical for the first two and the Rider; 200 for assigned Rider and Admin | M2-04, P1 |
| M2-PH2-TC11 | Integration (IT-P02) | Seller A list with 25 own parcels and B has 5; pageSize 500 | Page 1 has 20, total 25, newest first; cap 100 enforced; B's rows absent | M2-F02 |
| M2-PH2-TC12 | Component (CMP-P01) | Registration form: field errors, double click, failure then retry, success | One request per submit; same request ID reused after failure; token and detail link shown; text rendering of `<script>` | M2-F01, M2-02 prep |
| M2-PH2-TC13 | Component (CMP-P02) | List: loading, empty, error, pagination, identity change | States render; previous user's rows cleared | M2-F02 |
| M2-PH2-TC14 | Browser (E2E-P01) | Seller A login, create, refresh, logout, Seller B login, open A's parcel URL | Parcel persists; B sees empty list and not-found | INT-CP-01, INT-CP-02 |
| M2-PH2-TC15 | Integration (IT-A01 matrix) | Matrix rows for A10, A11, A12 across identities | Matches contract | authz matrix |
| M2-PH2-TC16 | Fixture (FIX-01) | Load profiles twice | Seller parcels and TMP-02 assigned parcels present once; hashes unchanged | TMP-02 |
| M2-PH2-TC17 | Static and integration (UT-P03) | Static scan of `modules/parcels` for SQL assembled from request values; SQL-injection strings in the `GET /parcels/{id}` path parameter and in list `page`/`pageSize` | No string-built SQL; injection strings give 422 or 404, never 500 or broadened results | M2-01 prep, P4 |

## 8 Deliverables and handoffs

H22 (`create_parcel`, A10, A12 v1) to Qee's detail link and the checkpoint scenario; H25 (merged 0003 and parcel fixture profiles) to Qee; H24 rows consumed from NASZ's harness. Qee confirms by loading the ASSIGNED fixture profile and fetching a parcel through A12.

## 9 Exit criteria

- T01-T09 complete (T10 rehearsed); TC01-TC17 pass in CI (the local checkpoint subset is listed in the [phase framework](../../../shared/phase-framework.md#checkpoint-execution-rules)); worksheet rows listed in T07 show actual results.
- INT-CP-01 Seller leg and the cross-Seller negative in INT-CP-02 pass with real sessions.
- Contributes to G2 items 1-4.

## 10 Integration checkpoint

On the same database and cookies as NASZ and Qee: Seller A creates a parcel; the fixture profile provides the Assigned parcel Rider A starts; Admin reads both through A12. Record commit and database revision in the checkpoint evidence.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Policies deny legitimate Rider reads because of helper bug | RLS-04/TC07 and Rider read case in TC10 detect; fix policy, never loosen privileges |
| Function permission errors under `domain_writer` | Grant only the DML needed; add privilege test, avoid superuser workaround |
| Time pressure | Ship T01-T05 first; mark A12 v1 and demo script items planned if late and disclose |

## 12 Deferred work

Replay-safe creation, search/filter/sort, complete detail DTO, slots, tracking, retention (PH3); privacy regression, concurrency, retention job, scale checks (PH4).
