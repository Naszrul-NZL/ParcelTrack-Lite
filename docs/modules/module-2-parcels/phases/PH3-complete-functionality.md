# M2 PH3: Complete module functionality

Owner: Zikri. Phase PH3 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

All M2 functions work through the React UI and direct API on real PostgreSQL: retry-safe parcel registration (M2-F01), Seller list, literal search, filters and full private detail (M2-F02), public status tracking with no personal data (M2-F03), and the retention selection/anonymization functions with tests at the 12-month boundary (M2-F04, scheduled in PH4). The shared detail page offers slots so Syauqi's Rider action panel and proof viewer plug in without duplicating permission logic.

## 2 Entry criteria

- G2 passed; TMP-01 and TMP-04 retired; Seller registration and login real (M1-PH3-T03 for the register leg in browser tests).
- Syauqi merges migration 0006 (`delivery_proof`) early in PH3 so `hasProof` and fixtures are real; until then `hasProof` is false.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Rate-limit service v1 and audit service | Naszrul M1-PH2-T04, T07 | H21 | none (delivered in PH2) |
| `delivery_proof` table and policies, `hasProof` source | Syauqi M3-PH3-T01 | H35 | `hasProof` constant false |
| Rider action panel and proof viewer React components with the agreed props | Syauqi M3-PH3-T10 | H35 | Placeholder components in the slots |
| `assign_parcel` (real assignment) to create ASSIGNED fixtures and reassignment visibility | Syauqi M3-PH3-T03 | H37 | TMP-02 seeds |
| Maintenance runner skeleton | Naszrul M1-PH3-T10 | H33 | Retention functions are tested directly; job wiring in PH4 |
| Seller registration for browser journey | Naszrul M1-PH3-T03 | none | Seeded Seller |

Independent now: T01, T02, T04, T08 (database and services).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH3-T01 | Replay-safe creation: compute the creation fingerprint as HMAC-SHA256, keyed by `FINGERPRINT_KEY`, over the canonical normalized request (trimmed fields, normalized phone, three-place weight); store it on the parcel; `create_parcel` returns the original parcel when `(seller_id, client_request_id)` exists with the same fingerprint (API 200), conflicts with a different fingerprint (409 `IDEMPOTENCY_CONFLICT`), and returns 409 `REQUEST_EXPIRED` when the fingerprint was cleared by anonymization; concurrency safe through the unique constraint; React keeps one client request ID per intended registration | Replay, conflict and expiry cases pass | TC01, TC02 | PH2 |
| M2-PH3-T02 | A11 search/filter/sort: `q` (1-64 characters) matches the tracking number as a case-insensitive literal prefix or the recipient name as a literal substring, with `\`, `%` and `_` escaped so wildcards never broaden results (design choice D-08); `status` from the enum; `sort` from an allowlist (`createdAt` desc default, `currentStatus`) with id tie-break; pagination page >= 1, pageSize cap 100; add a supporting prefix index only if EXPLAIN at scale demands it | Invalid parameters 422; own rows only | TC03, TC04 | PH2 |
| M2-PH3-T03 | A12 complete: for ADMIN each history item also carries `changedBy {id, displayName}` (never for other roles); `assignedRider` (`id`, `displayName`, `isActive`) or null, `hasProof`, `anonymized`, `terminalAt`, history ordered by `changed_at` then `id`; inaccessible/nonexistent uniform 404; shared service used by Seller, Rider and Admin; publish the slot contract in `shared/types` (props of `RiderActionPanel` and `ProofViewer`: `parcel: ParcelDetail`, `onChanged(): void`) so the detail page imports Syauqi's components without circular type dependencies | Same service for all roles; DTO allowlist test | TC05, TC11 | H35 |
| M2-PH3-T04 | Revision `tracking_lookup`: `lookup_tracking(token)` hardened function owned by `lookup_fn_owner` with column-limited SELECT on parcel (`id`, `tracking_number`) and history (`id`, `parcel_id`, `status`, `changed_at`; `id` is needed for ordering) and explicit read policies for that owner; exact token match, returns rows ordered by time then id; `EXECUTE` granted only to `tracking_runtime`; separate `tracking_runtime` pool in the backend | `tracking_runtime` cannot read tables or enumerate; hostile search_path ignored | TC06 | H02 |
| M2-PH3-T05 | A13 `POST /public/tracking` `{trackingNumber}`: no CSRF token and no anonymous session (read-only), but the same-origin check applies; normalize/validate token (422 on bad format); rate limit 30 lookups per source per minute through the shared limiter (source from the trusted-proxy rule, invalid tokens counted too); call `lookup_tracking` via `tracking_runtime`; unknown valid token 404; response exactly `{history:[{status,changedAt}]}`; `no-store`; token never written to logs or URLs; never uses the private detail serializer | Public body allowlist test across all statuses | TC07, TC08 | H21 |
| M2-PH3-T06 | React `/track`: form, POST lookup (no token or session bootstrap needed), timeline with Malaysia time, distinct messages for 404, 422, 429 and network failure, no token in URL/referrer/analytics, nothing stored in browser storage, `Referrer-Policy: no-referrer` honored | Browser tests inspect DOM and network | TC09, TC10 | T05 |
| M2-PH3-T07 | React search/filter UI on `/seller/parcels` (debounce, pagination reset on filter change, ignore stale responses), full `/parcels/:id` with slots (`RiderActionPanel` for assigned Rider while status allows an action, `ProofViewer` when `hasProof`), anonymized view, 401/404/422/429 handling | Component tests with slot doubles; real components in G3 journeys | TC11 | H35 |
| M2-PH3-T08 | Revision `retention_functions` (`maintenance_fn_owner`, executable only by `maintenance_runtime`): `list_retention_candidates(batch, as_of)` selecting terminal parcels whose `terminal_at + interval '12 months'` has passed and `anonymized_at IS NULL` (DELIVERED and FAILED alike, D-06; SHOULD: non-terminal parcels with no status change for 12 months as well, D-31); `anonymize_parcel(id)` sets recipient name, phone and address to null, clears the fingerprint, sets `anonymized_at`, increments version, audits `RETENTION_ANONYMIZED`; `as_of` accepted only through the maintenance role so no request path can move the clock; idempotent; never touches history | Boundary tests incl. month-end and leap year | TC12, TC13 | H02 |
| M2-PH3-T09 | Full fixture dataset: parcels in all five statuses, an anonymized parcel, two ownership groups, zero-count and non-zero dashboard datasets, parcels with proof rows created through real flows where possible and test-provisioner DML otherwise (TMP-06, test-only); Syauqi supplies proof-file fixtures | Dataset loads on empty database; contains no real data | TC18 | H35, H38 |
| M2-PH3-T10 | Execute and record feature-level security rows: M2-01, M2-02 (API/DOM-literal side), M2-03, M2-04 (list, search, detail, history), M2-05, M2-06 (API side), M2-07 (basic boundary), M2-08, M2-09, RLS-07, RLS-08 (initial), S-01 for A10/A13 | Worksheet updated with actual results and commit | TC03, TC06-TC08, TC14, TC15 | T01-T06 |
| M2-PH3-T11 | Run and record the integrated journeys that include M2: INT-01 (register, login, create, refresh), INT-04 (cross-user parcel, partial), INT-07 (public privacy, API and DOM for all statuses) with Syauqi's and Naszrul's pieces | Playwright specs pass on Compose | TC16, TC09 | G3 inputs |
| M2-PH3-T12 | Conformance of A10-A13 to the contract (paths, schemas, status codes, error-code registry) | CT-03 passes | TC17 | M1-PH3-T13 |

## 5 Affected components

- Database: `create_parcel` replay logic, `lookup_tracking`, `list_retention_candidates`, `anonymize_parcel`, policies for `lookup_fn_owner` and `maintenance_fn_owner`.
- Backend: `modules/parcels/{service.py,repository.py,tracking.py,retention.py,routes.py}`, tracking pool wiring.
- Frontend: `features/parcels/{SellerParcelListPage,ParcelDetailPage,TrackPage}.tsx`, slot types.

## 6 Security requirements

Keyed idempotency fingerprint that is not a plain hash of personal data; literal parameterized search with allowlisted sort/filter; uniform 404; separate restricted tracking role with a single hardened function; public response allowlist; lookup throttling; no tokens in logs/URLs; text-only rendering of recipient data; retention functions unreachable from request paths; server-chosen time. Policies P1, P3, P4.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH3-TC01 | Integration and concurrency (IT-P01) | Same key + same payload; same key + changed payload; two simultaneous identical requests; same UUID from Seller B; replay after anonymization | 200 original; 409 `IDEMPOTENCY_CONFLICT`; one parcel and both callers get it; B creates independent parcel; 409 `REQUEST_EXPIRED` | M2-F01, INT-09 |
| M2-PH3-TC02 | Unit (UT-P02) | Fingerprint over equivalent inputs (spacing, `+60 12-345 6789` forms, `1.5` vs `1.500`) and different inputs; compare stored value with plain SHA-256 of the payload; change `FINGERPRINT_KEY` | Equivalent inputs equal; different differ; stored value is not the plain hash; key change changes value | P3 |
| M2-PH3-TC03 | Integration (IT-P02) | `q` = prefix of own token, name fragment, `%`, `_`, `\`, `' OR 1=1--`, `'; DROP TABLE parcel;--`, 65 characters; invalid `status`; `sort=createdAt;DROP` | Matching rows only; wildcards literal (no broadening); injection returns normal empty/422; no SQL error; table intact | M2-01, M2-F02 |
| M2-PH3-TC04 | Unit and integration (UT-P03) | page 0, pageSize 0/101/20, page beyond total, equal timestamps | 422 or cap per contract; empty items beyond total; stable order using id tie-break | M2-F02 |
| M2-PH3-TC05 | Integration (IT-P02) | Detail for registered, assigned, final and anonymized parcels as Seller, assigned Rider, Admin; reassigned old Rider | Fields per contract; `changedBy` present for Admin and absent for Seller, Rider and public; anonymized recipient null with `anonymized: true`; old Rider 404 after reassignment | M2-F02, M3-F05 |
| M2-PH3-TC06 | RLS (RLS-07, RLS-08) | As `tracking_runtime`: SELECT parcel/history, UPDATE, call `lookup_tracking` valid/unknown/malformed, list all; catalog check of owner, `search_path`, PUBLIC execute, `app_runtime` execute; hostile `pg_temp` object | Table access denied; function returns only status/time for the exact token; cannot enumerate; only intended callers execute; shadowing ignored | RLS-07, RLS-08 |
| M2-PH3-TC07 | Integration (IT-P03) | POST tracking for each of five statuses and an anonymized parcel; unknown valid token; malformed (`' OR '1'='1`, 31 chars); lowercase; foreign `Origin`; no `Origin` and no `Sec-Fetch-Site`; read headers | Body keys exactly `history[].status/changedAt`; 404/422 as specified; lowercase normalized; no token or session needed; foreign Origin rejected; `Cache-Control: no-store` | M2-06, M2-F03 |
| M2-PH3-TC08 | Integration (UT-A05 link) | 30 then 31 lookups from one source in a minute; advance clock; second source; invalid tokens count | 31st gives 429 with `Retry-After`; resumes after window; other source unaffected; no DB errors | M2-07 |
| M2-PH3-TC09 | Browser (E2E-P02) | `/track` for each status and anonymized parcel; capture responses, DOM, storage, URL, referrer | No name, phone, address, actor ID, proof link; token not in URL or storage; POST used | M2-06, INT-07 |
| M2-PH3-TC10 | Component (CMP-P03) | Tracking form (no session bootstrap): pending, 404, 422, 429, network, page left open for 30 minutes; timestamp `2026-10-21T16:00:00Z` | Distinct safe messages; shows 22 Oct 2026 00:00 Malaysia time; no token persistence | M2-F03 |
| M2-PH3-TC11 | Component (CMP-P04) | Detail page with slot doubles for each role/status; search race (slow first response); filter change | Slots render only when allowed; anonymized state; stale response ignored; pagination resets | M2-F02 |
| M2-PH3-TC12 | Integration (IT-P04) | Terminal parcels at 12 months minus 1 s, exact, plus 1 s; 2028-02-29 and month-end dates; DELIVERED and FAILED; non-terminal parcels with and without a status change in the last 12 months; already anonymized; call as `app_runtime` and with `as_of` from a request path | Eligibility per rule; only maintenance role may call; no request path can set `as_of` | M2-10, M2-F04 |
| M2-PH3-TC13 | Integration (IT-P04) | `anonymize_parcel` twice; inspect row, history, audit; A12 and A13 afterwards; old creation key | Recipient fields and fingerprint null, `anonymized_at` set, version incremented, history intact; detail shows anonymized; tracking still works; `REQUEST_EXPIRED`; second call no-op | M2-10 |
| M2-PH3-TC14 | Integration / static | Hostile strings in name and address (`<script>`, `'; --`, 10 000 characters); static scan for string-built SQL in `modules/parcels` | Stored and returned literally within limits; oversize 422; scan finds none | M2-01, M2-02, P4 |
| M2-PH3-TC15 | Integration (IT-P02) | Seller B: list with A's token, A's ID in detail, guess nearby IDs | Empty list; uniform 404; no side channel in totals | M2-04 |
| M2-PH3-TC16 | Browser (E2E-P03) | Seller registers (UI), logs in, creates parcel, searches it, opens detail | Journey passes; search finds it; detail shows history | INT-01 |
| M2-PH3-TC17 | Contract (CT-03) | OpenAPI vs contract for A10-A13 | No drift | contract |
| M2-PH3-TC18 | Fixture (FIX-01) | Load full dataset; track each parcel | Five statuses and anonymized parcel exist; public histories correct | G3 |
| M2-PH3-TC19 | Integration (IT-P03) | Take a real token and probe its neighbours: last hex digit +1/-1, `PTL-` + 32 zeros, 200 sequential values, two consecutive generated tokens | Uniform 404 for each, all counted against the lookup limiter and 429 after the limit; consecutive tokens share no structure | M2-05 |
| M2-PH3-TC20 | Integration (IT-P02) | Admin, Seller, assigned Rider and anonymous read a parcel with three history events | Only the Admin response has `changedBy` with ID and display name; others never; public body unchanged | SRC-08, D-37 |

## 8 Deliverables and handoffs

H34 (complete A12 and slot contracts) to Syauqi; H36 (retention functions) to Syauqi and Naszrul; the full fixture dataset to everyone; A13 and `/track` to the integrated journeys. Consumers confirm: Syauqi plugs real components into the slots (TC11 with real components in G3), Syauqi's purge job reads `anonymized_at` in PH4.

## 9 Exit criteria

- T01-T12 complete; TC01-TC20 pass in CI.
- Public tracking returns only status/timestamps for all statuses on API and DOM; searching is literal; creation replay is safe.
- INT-01 and INT-07 pass; contribution to INT-04 recorded.
- Contributes to G3 items 1-5.

## 10 Integration checkpoint

Compose run: Naszrul's registered Seller creates parcels, Syauqi's Admin assigns and Rider finalizes, Zikri's `/track` shows the same history with identical timestamps, and retention functions applied to a backdated copy keep tracking working. All with the same images and fixtures.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Slot integration blocked by Syauqi's components | Placeholder components behind the agreed props; replace before G3 |
| Search query slow without index | Add index through a reviewed additive migration after EXPLAIN evidence |
| Tracking source address wrong behind proxy | Rate limiting keyed to proxy address would throttle everyone; blocked until M1-PH5-T12 verifies; local tests use socket address |
| Fingerprint key rotated | Existing fingerprints no longer match replays; document that key rotation expires replay protection, acceptable because replays happen within minutes |

## 12 Deferred work

Full RLS/grant suites, retention job and scheduling, concurrency/rollback matrix, privacy regression with logs, scale checks (PH4); production bootstrap and cloud verification (PH5).
