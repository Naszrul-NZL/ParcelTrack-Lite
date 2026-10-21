# M3 PH3: Complete module functionality

Owner: Qee. Phase PH3 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

All M3 functions work through the React UI and direct API on real PostgreSQL and a private proof store: Admin assignment and reassignment (M3-F01, M3-F05), Rider list (M3-F02), Rider outcomes Delivered and Failed with one validated JPG or PNG (M3-F03), Admin dashboard (M3-F04) and authorized private photo viewing. The seeded assignment shortcut (TMP-02) is retired, and Rider action panel and proof viewer plug into Zikri's shared detail page.

## 2 Entry criteria

- G2 passed; real sessions in use by all slices.
- Migration 0003 and A12 v1 merged; NASZ has A07 (Rider directory) and A09 (disablement) on the way (M1-PH3-T01, T02 are the first M1 PH3 tasks).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| A07 active Rider directory (`role=RIDER&isActive=true`) | NASZ M1-PH3-T01 | H30 | **TMP-05** static Rider list in the assignment dialog |
| A09 disablement for continuity tests | NASZ M1-PH3-T02 | H31 | Disable by direct database update in tests; real path before G3 |
| Complete A12 with slot contract for `RiderActionPanel` and `ProofViewer` | Zikri M2-PH3-T03, T07 | H34 | Own temporary page wrapper in `features/delivery`, removed once slots exist |
| Maintenance runner skeleton | NASZ M1-PH3-T10 | H33 | Direct function tests; job wiring in PH4 |
| Rate-limit/audit services | NASZ M1-PH2 | H21 | none |
| Fixture loader extension points | Zikri M2-PH3-T09 | H11, H38 | Qee-owned proof profile files |

First task in the phase: T01 (merge `delivery_proof`), because Zikri's `hasProof` and fixtures depend on it.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH3-T01 | Merge in two steps, first thing in the phase: `0006_delivery_proof` (table `delivery_proof` with unique `parcel_id`, unique `storage_key` with format CHECK, media type JPEG/PNG, size 1 byte to 5 MiB, uploader; forced RLS following the parent parcel for Seller own / Rider assigned / Admin all; inserts only through `domain_writer` functions; Zikri reviews the policy SQL) so `hasProof` and fixtures unblock immediately, then `0007_delivery_final` (`assign_parcel(parcel_id, rider_id, expected_version)`, final-outcome branch of `update_delivery_status`, `lock_delivery_target(parcel_id, expected_version)` which locks and rechecks the active Rider account/session version, then assignment, OUT_FOR_DELIVERY state and version, and the reconcile helper skeleton); all hardened per template | LINT-01 and catalog checks pass; `app_runtime` still has no direct DML or row-lock privilege | TC11 | H09, H02 |
| M3-PH3-T02 | A14 `GET /admin/parcels`: Admin only; filters `status`, `riderId`, `needsReassignment` (unfinished and assigned to an inactive Rider), pagination, `ParcelSummary` plus `assignedRider {id, displayName, isActive}`; no recipient fields beyond what Admin detail allows; sort allowlist | Parameterized; denied for other roles | TC10 | T01 |
| M3-PH3-T03 | A15 `PATCH /admin/parcels/{id}/assignment` `{riderId, expectedVersion}` via `assign_parcel`: Admin only; locks actor, target Rider and parcel in the global order (accounts before parcel); target must be an active Rider; first assignment moves REGISTERED to ASSIGNED, increments version, appends ASSIGNED history and audit `PARCEL_ASSIGNED`; reassignment of ASSIGNED or OUT_FOR_DELIVERY keeps status, increments version, writes audit `PARCEL_REASSIGNED` with old/new Rider IDs and no history row; same Rider with matching version is a no-op; terminal parcels rejected; stale version 409 | Matches contract status rules | TC01-TC03 | H30, T01 |
| M3-PH3-T04 | Retire TMP-02: E2E and integration flows use real assignment; seeded ASSIGNED fixtures remain only for isolated unit/integration cases and are labeled; CI check that browser specs do not call the seed profile | Checked in code review and CI grep | TC17 | T03 |
| M3-PH3-T05 | Proof pipeline (`modules/delivery/proof_pipeline.py`): after a cheap authorization and state pre-check under RLS (assigned Rider, OUT_FOR_DELIVERY, version) and before reading the body or decoding, a process-wide upload semaphore (default 2) and per-Rider limit shed overload with `503 BUSY`; streaming multipart parse with hard limits (single file part, 5 MiB, bounded part count and filename length, no reliance on client Content-Type), stage to private staging, full decode with the chosen library, reject unsupported/corrupt/multi-frame/over-20-megapixel input, ignore the client filename entirely, re-encode to JPEG or PNG with metadata stripped and any trailing bytes discarded (sanitize and accept) under an output size limit, assign random key `<parcelId>/<32 hex>.<ext>`, clean staging on every rejection path | Returns `413 PROOF_TOO_LARGE`, `415 PROOF_INVALID`, `422 PROOF_REQUIRED/PROOF_COUNT` as appropriate | TC06, TC07, TC20 | H13, PH1 spike |
| M3-PH3-T06 | A17 final outcomes: for DELIVERED/FAILED validate and prepare the file before taking locks; begin transaction via `principal_uow`; call `lock_delivery_target`; publish the prepared file to final storage (`os.link`, never overwrite) while the lock is held; call `update_delivery_status` with key, media type and size (sets `terminal_at`, `delivered_at` only for DELIVERED, inserts proof metadata, history and audit `PROOF_UPLOADED`/`STATUS_CHANGED`); commit before responding; on a confirmed rollback delete the published file; if the commit outcome is unknown preserve the file (reconciled in PH4); start delivery rejects any file | Failure at any step leaves previous state and no committed proof without file | TC04, TC05, TC21 | T01, T05, H13 |
| M3-PH3-T07 | A19 `GET /parcels/{id}/proof`: authorization through the database (Seller own, Rider assigned, Admin all; anonymized parcels denied), uniform 404 otherwise; stream from `ProofStore` using the stored key (never a request value); headers `Content-Type` from stored verified media type, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="proof.<ext>"`; no static or proxy route to the proof directory | Traversal and unauthenticated access impossible | TC08 | T01, T06 |
| M3-PH3-T08 | A18 `GET /admin/dashboard`: one aggregate statement producing counts for the five statuses and total from a single snapshot, zero-filled, `generatedAt`; Admin only; no recipient fields | Counts equal the database; zero case | TC09, TC19 | PH2 |
| M3-PH3-T09 | React `/admin/parcels` (filters, needs-reassignment view, assignment dialog using A07 data (retire TMP-05), version refresh on 409, success refresh) and `/admin/dashboard` (five labeled counts, total, generated time, links into filtered lists) | Component and browser tests; Admin-only routes guarded and server-enforced | TC12, TC14 | H30 |
| M3-PH3-T10 | React `RiderActionPanel` (Start delivery for ASSIGNED; Delivered/Failed with one photo input for OUT_FOR_DELIVERY, size/type hints, pending and error states, preserves selection on 409 where safe, refetches after uncertain network result, never auto-retries) and `ProofViewer` (fetch via A19 into a blob, create object URL, revoke on unmount/logout/navigation); export them using Zikri's slot props | Slots rendered in `/parcels/:id`; no filesystem path or media URL in the DOM | TC13 | H34 |
| M3-PH3-T11 | Continuity flows: Admin list flags unfinished parcels assigned to inactive Riders; reassignment to an active Rider; disabled Rider's old cookie rejected before any write; old Rider loses detail/proof access immediately | INT-05 functional path | TC03, TC15 | H31 |
| M3-PH3-T12 | Fixture contributions: parcels in OUT_FOR_DELIVERY, DELIVERED and FAILED with proof rows and harmless files, an anonymized parcel without proof, zero-count and non-zero-count dashboard datasets; consumed by Zikri's loader | Dataset loads idempotently on a clean database | TC18 | H38 |
| M3-PH3-T13 | Execute and record feature-level security rows: M3-01, M3-02, M3-03 and M3-04 (smoke corpus; full corpus PH4), M3-05, M3-06, M3-07, M3-08, M3-09, RLS-10 (initial), S-01 for A15/A17 | Actual results with commit | TC02, TC06-TC08, TC11 | T01-T08 |
| M3-PH3-T14 | Run and record INT-02, INT-03 and the functional INT-05 in Playwright against Compose with the intended images; conformance of A14-A19 to the contract (CT-03) | Pass with traces stored privately | TC14-TC16 | G3 inputs |

## 5 Affected components

- Database: migration 0006, functions `assign_parcel`, `update_delivery_status` (final branch), `lock_delivery_target`, reconcile helper, `delivery_proof` policies.
- Backend: `modules/delivery/{routes_admin.py,routes_rider.py,routes_proof.py,service.py,repository.py,proof_pipeline.py,storage.py,dashboard.py}`.
- Frontend: `features/delivery/{AdminParcelsPage,DashboardPage,RiderActionPanel,ProofViewer}.tsx`.
- Config: proof root, upload limits, multipart limits.

## 6 Security requirements

Admin-only assignment and dashboard; assigned-Rider checks in SQL and service; actor/time server-derived; file validated by decoded content, not name or type; re-encoded, metadata stripped, random name, private directory; one proof per parcel; proofs never public; uploads CSRF-protected; stale-version protection; lock ordering; function hardening; audit for assignment and status changes. Policies P1, P3, P5. Rubric 2a for M3.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH3-TC01 | Integration (IT-D01) | Admin assigns REGISTERED parcel to active Rider | 200; ASSIGNED; one ASSIGNED history row (actor Admin); audit `PARCEL_ASSIGNED`; version +1; Rider's A16 lists it, Seller sees ASSIGNED | M3-F01 |
| M3-PH3-TC02 | Integration (IT-D01) | Assign to inactive Rider, Seller account, Admin account, unknown ID; stale version; same Rider matching version; terminal parcel; Seller/Rider/anonymous caller | 422/404 for bad target; 409 stale; 200 no-op with no new rows or version change; 409 terminal; 403/403/401 | M3-02, M3-F01 |
| M3-PH3-TC03 | Integration (IT-D01) | Reassign ASSIGNED and OUT_FOR_DELIVERY parcels; old Rider requests detail, proof and A17; new Rider finishes | Status unchanged; no extra history; audit `PARCEL_REASSIGNED` with old/new IDs; old Rider 404; old history entries keep original actor | M3-F05, INT-05 |
| M3-PH3-TC04 | Integration (IT-D02) | ASSIGNED to OUT_FOR_DELIVERY, then DELIVERED with valid JPEG containing EXIF | Parcel DELIVERED with `terminal_at` and `delivered_at`; DELIVERED history row by Rider; one proof row (JPEG, key format, size); stored file re-encoded without EXIF in final dir; staging empty; response has `hasProof: true` and no key or path | M3-F03, M3-05, M3-07, M3-08 |
| M3-PH3-TC05 | Integration (IT-D02) | OUT_FOR_DELIVERY to FAILED with valid PNG | FAILED, `terminal_at` set, `delivered_at` null, proof stored, history and counts coherent | M3-F03, INT-03 |
| M3-PH3-TC06 | Integration (IT-D02) | Final status with no file; two files; `.php`; `shell.php.jpg`; text renamed `.png`; SVG with script named `.png`; animated GIF/APNG; zero bytes; corrupt JPEG; JPEG with appended script (separate case below) | Rejected (`422 PROOF_REQUIRED/PROOF_COUNT` or `415 PROOF_INVALID`), except that a valid JPEG with appended bytes is accepted and stored re-encoded with no trailing data; no state, history, proof row or file (staging and final empty) | M3-03, M3-08 |
| M3-PH3-TC07 | Integration (IT-D02) | 5 MiB exactly; 5 MiB + 1; 20 MP image; 20 MP + 1 pixel; decompression-bomb header; output-size limit | Boundary accepted; over-limit `413`/`415` before full buffering or costly decode; a 20-megapixel-plus image is rejected in under 1 s with less than 50 MB RSS growth (provisional numbers from the PH1 spike); unauthorized or wrong-state callers are rejected before any decode | M3-04 |
| M3-PH3-TC08 | Integration (IT-D04) | A19 as Seller owner, assigned Rider, Admin, Seller B, Rider B, anonymous; ids `../`, nonexistent; common static paths; anonymized parcel | 200 with stored bytes and `image/jpeg`, `no-store`, `nosniff`; 404 for others; 401 anonymous; 422/404 for bad IDs; no static route exists; 404 after anonymization | M3-05, P3 |
| M3-PH3-TC09 | Integration (IT-D04) | A18 as Admin, Seller, Rider, anonymous; empty database; after assignment and finalization; concurrent insert during read | Five keys with zeros; total equals sum and row count; counts move with committed changes; denial for non-Admin; no recipient fields | M3-F04, M3-02 |
| M3-PH3-TC10 | Integration (IT-D01) | A14 filters (status, riderId, needsReassignment), pagination, non-Admin callers | Correct subsets; `assignedRider.isActive` present; denied for others | M3-F01, M3-F05 |
| M3-PH3-TC11 | RLS and integration (RLS-10) | As `app_runtime` try `SELECT ... FOR UPDATE` on parcel; call `lock_delivery_target` for authorized Rider, stale version, wrong Rider, inactive Rider; second connection waits | Direct lock denied; authorized lock works and is held until commit; others rejected; second connection blocks until commit | RLS-10, REV-01 |
| M3-PH3-TC12 | Component (CMP-D02) | Admin list and dashboard: filters, dialog with real Rider data, 409, needs-reassignment highlight, zero counts, links | Behaviors as specified; stale refresh; filtered links work | M3-F01, M3-F04 |
| M3-PH3-TC13 | Component (CMP-D03) | Action panel per status; wrong type/size selected; 409; network failure; viewer mount/unmount and logout | Only permitted controls; client hints but server authoritative; refetch before resubmission; object URL revoked; no path in DOM | M3-F03 |
| M3-PH3-TC14 | Browser (E2E-D02) | INT-02: Seller registers parcel, Admin assigns, Rider (phone) starts and delivers with photo, `/track` and dashboard, Seller views proof; INT-03 on a second parcel with Failed | All steps pass; public tracking shows only status/time; counts match; Delivered timestamp null for Failed | INT-02, INT-03 |
| M3-PH3-TC15 | Browser (E2E-D02) | Admin disables Rider mid-delivery; Rider acts; Admin reassigns; new Rider finishes | Rider returned to login; parcel flagged; reassignment works; history keeps original actors | INT-05 |
| M3-PH3-TC16 | Contract (CT-03) | OpenAPI vs contract for A14-A19 and error-code registry | No drift | contract |
| M3-PH3-TC17 | CI check | Browser specs and seeds | E2E specs do not use seeded ASSIGNED fixtures; TMP-02 labeled only in non-E2E tests | TMP-02 retirement |
| M3-PH3-TC18 | Fixture (FIX-01) | Load proof datasets twice | Present once; files exist; counts match | G3 |
| M3-PH3-TC19 | Unit (UT-D05) | Dashboard aggregate with missing statuses | Zero-filled keys; total coherent | M3-F04 |
| M3-PH3-TC20 | Integration (IT-D02) | Repeated or duplicate `status` field, unknown parts, 20 parts, 300-character and null-byte filenames, missing Content-Length | Rejected safely; filename ignored; no file stored | M3-03 |
| M3-PH3-TC21 | Integration (IT-D03) | Force `update_delivery_status` error after publish (test failpoint) | Published file deleted after confirmed rollback; parcel state unchanged | M3-08 |

## 8 Deliverables and handoffs

H35 (`delivery_proof`, `hasProof`, action panel and proof viewer) to Zikri; H37 (`assign_parcel`/A15, retiring TMP-02) to all; H38 (proof fixtures) to Zikri's loader. Consumed: H30, H31, H34. Zikri confirms slots render real components; NASZ confirms audit viewer shows M3 events.

## 9 Exit criteria

- T01-T14 complete; TC01-TC21 pass in CI.
- INT-02, INT-03 and functional INT-05 pass on Compose; TMP-02 and TMP-05 retired.
- Both final outcomes keep exactly one proof, coherent history/current status and no public photo route.
- Contributes to G3 items 1-5.

## 10 Integration checkpoint

One local run through the full chain: NASZ's Seller and Admin, Zikri's registration and tracking, Qee's assignment, proof and dashboard, with the same images that will deploy. Check tracking history timestamps equal the database and dashboard totals equal the sum of statuses.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Large uploads slow on phones | Limits and timeouts configured; actual 4G measurement in PH5 |
| Lock held during file publish blocks others | Validate and prepare before locking; publish is a rename only; measure lock time in PH4 |
| A19 serves a stale file after anonymization | Authorization checks `anonymized_at` in the database before opening the file (TC08) |
| Slot components not ready | Temporary wrapper page until H34; removal tracked in G3 |

## 12 Deferred work

Full fault-injection matrix, reconciliation job, proof purge job, concurrency suites, complete upload attack corpus, backup lock and restore drill (PH4); EBS/S3, scheduled jobs and Android/4G tests (PH5).
