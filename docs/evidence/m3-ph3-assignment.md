# M3 PH3 assignment evidence

Owner: Syauqi (`Qee110`)

Scope: M3-PH3-T01 verification and M3-PH3-T02 to T04; A14, A15, TC01 to TC03, TC10, TC11 and TC17; handoff H37.

## Implemented behavior

- `GET /api/v1/admin/parcels` is Admin-only and accepts strict `status`, `riderId`, `needsReassignment`, `page` and `pageSize` parameters. The SQL is fixed and parameterized, newest-first with an ID tie-break. Unknown parameters, including an uncontracted sort value, are rejected rather than interpolated.
- Each A14 item contains only `ParcelSummary` plus `assignedRider {id, displayName, isActive}` or null. Recipient name, phone and address are not selected or serialized.
- `PATCH /api/v1/admin/parcels/{parcelId}/assignment` accepts only `{riderId, expectedVersion}`, requires an Admin session plus CSRF and same-origin evidence, and calls `app.assign_parcel` inside the shared protected transaction.
- A15 returns the committed `ParcelDetail`. Its response read does not add `PARCEL_VIEWED`; the only new audit event is the assignment or reassignment event written by the function. Same-Rider assignment is a no-op, reassignment does not add a duplicate status-history row, and stale or terminal work remains governed by revision 0007.
- The Rider phone browser path creates a Registered parcel through A10, selects Rider A from A07, assigns it through A15, then signs in as Rider A and starts it through A17. Browser code no longer writes parcel rows, switches to `domain_writer`, or calls the TMP-02 seed profile.
- The OpenAPI snapshot and authorization matrix include A14 and A15. The static delivery SQL scanner covers hostile A14 filter values, and a browser-fixture policy test keeps direct assignment out of E2E specs.

## Local verification

Run on 28 November 2026 on Windows with Node.js 24 and the repository's test Supabase Compose profile.

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed with zero diagnostics |
| Unit and component projects | 24 files, 404 tests passed |
| Targeted A14/A15 integration | 5 tests passed |
| Delivery, assignment, disablement regression | 4 files, 22 tests passed |
| Authorization matrix | 17 rows passed, including A14 and A15 for all eight identities |
| Full isolated integration project | 21 files, 135 tests passed |
| SQL hardening | Passed; every delivery query uses constant SQL text |
| OpenAPI/route/DTO/import parity | Snapshot matches with A14 and A15 |
| Airway generated theme check | 32 contrast pairs and token parity passed; no UI was changed in this slice |
| Test database and Storage setup | Bootstrap, migrations, restricted-role/catalog verification, synthetic fixtures and private bucket initialization passed |
| Phone browser path | 2 tests passed, including real A10 to A15 to A17 assignment/start and Rider B isolation |
| Production build | Passed; Next.js route inventory includes both new Admin parcel routes |

Remote CI and teammate review are not local evidence.

## H37 handoff

Consumers can call A15 or `app.assign_parcel` for real assignment and use A14 to find unfinished parcels whose assigned Rider is inactive. The A15 response is the shared `ParcelDetail`, so later Admin UI work can refresh version and Rider state from one response. Browser journeys must use A15; the labeled TMP-02 profile remains only for isolated unit/integration cases.

## Remaining work and limitations

- T05 to T08 still own proof sanitization/publication, final outcomes, private proof access and dashboard aggregation.
- T09 and T10 still own the Airway Admin screens and H34 Rider action/proof components.
- T11 to T14 still own the full disable/reassign/finalize continuity journey, proof fixtures, security worksheet rows and Compose conformance journeys.
- No group gate is signed off by this slice. H37 consumer confirmation, remote CI and owner review remain pending.
