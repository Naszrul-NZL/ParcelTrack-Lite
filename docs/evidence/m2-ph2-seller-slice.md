# M2 PH2 Seller slice and shared handoffs

Verified on the isolated Supabase test stack on 19 November 2026 with Node.js 24.14.0. The registration code is in [PR #23](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/23) at `25837d0`. The read services are in [PR #24](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/24) at `fdc9fce`. The Seller screens and real HTTP journey are in [PR #25](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/25). All four M2 PRs, #22 to #25, are merged into `main` (`84fdce2`, `2827205`, `fc7983e`, `7808e3d`).

| Check | Observed result |
| --- | --- |
| Build and static checks | Production build, lint, type checking, SQL hardening, OpenAPI snapshot, 32 Airway contrast pairs and browser-asset credential scan passed. |
| Unit and component tests | 393 passed with one worker. TC12/TC13 covered field errors, pending submit, request ID reuse, list states, pagination, identity changes and literal recipient text. |
| Integration suite | 82 passed. A10–A12 and the matrix used checked runtime credentials, actual session rows and per-case database clones. |
| Playwright TC14 and walkthrough | Seller A signed in, rejected invalid weight, registered a parcel, saw the token and reread it after refresh. Seller B saw only their own records and received the private-detail not-found view for Seller A’s parcel. Rider and Admin each received 403 from A10 over HTTP. |
| Airway browser review | Seller list, registration and private detail reflowed on desktop and at 320 CSS px in both themes. Tab focus was visible on weight, Enter submitted, and focus moved to the confirmation heading. Synthetic captures remain in ignored Playwright output. |

The Seller list uses flat records with tracking number, status and timestamp in reading order. The registration form groups the four inputs into a single work surface, and the confirmation and private detail reuse the shared lavender docket. The detail page uses a separate work surface for private delivery fields. The established Airway typography, colors and focus tokens apply in both themes.

| Handoff | Producer | M2 consumer evidence and remaining checks |
| --- | --- | --- |
| H10 | [M3 foundation in PR #16](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/16) | Zikri used isolated migrated clones and restricted runtime pools in `parcel-registration.test.ts` and `parcel-reads.test.ts`. The PH2 tests proved audit rollback, cross-Seller reads and Rider assignment under RLS. |
| H20 and H24 | [M1 login and matrix in PR #17](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/17) | Zikri used `loginAs` through A01/A03 in both M2 test suites, added A10–A12 rows to the shared authorization matrix and ran the Seller HTTP/browser journey with real cookies and CSRF. The inactive matrix control still uses a fixture session. Other consumers and overall TMP-04 retirement remain pending. |
| H22 | [Registration](m2-ph2-parcel-registration.md) and [private reads in PR #24](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/24) | The assigned Rider received private detail and an unassigned Rider received the uniform 404 in the M2 case. Syauqi can confirm A12 from the Rider branch after merge. |
| H25 | [Fixture loader in PR #22](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/22) at `d928412` | The local repeat held four profile parcel identities, seven history rows and existing account hashes unchanged. Syauqi’s consumer acceptance is tracked in issue #13. |

The Seller part of INT-13 and the cross-Seller negative of INT-14 ran locally. The full group journey still needs the registered Rider migration and real Rider Start delivery. H13 acceptance and group gates still need the remaining consumer work and owner review.

## Issue #9 close-out (26 November 2026)

Rerun on the isolated Supabase test stack from `main` at `7808e3d`, plus the TC17 tests added by the close-out PR. Node.js 22.23.4 ran locally; CI uses Node.js 24.

| Completion check | Evidence |
| --- | --- |
| TC10 private detail | `M2-PH2-TC10` in `tests/integration/parcel-reads.test.ts`. Seller B, a missing ID, and the unassigned Rider receive the same 404. The owner, the assigned Rider and Admin receive 200, and Admin reads are audited. |
| TC11 Seller list | `M2-PH2-TC11` in the same file. With 25 own parcels and 5 for Seller B, page 1 returns 20 newest first, `total` is 25, `pageSize=500` is capped at 100, and Seller B's rows are absent. |
| TC15 matrix | The A10–A12 rows in `tests/integration/authz_matrix/parcel.rows.ts` run with real sessions. |
| TC16 fixture rerun (H25) | `npm run db:fixtures -- --profile=rider-assigned` ran twice. Both runs gave the same parcel IDs, 12 parcels, 15 history rows, 7 accounts and the same password-hash digest. |
| TC17 SQL safety | `tests/unit/parcel-sql-safety.test.ts` parses `src/server/modules/parcels` and allows only constant SQL text in `.query(...)`. A negative control shows that it flags interpolated, concatenated and computed SQL. `M2-PH2-TC17` sends injection strings in the A12 path and A11 `page`/`pageSize`. Each returns 422, or 404 for a well-formed hidden ID. An oversized numeric `pageSize` is clamped to 100 and returns only the caller's rows. The parcel count is unchanged and no response is a 500. |

The real-session requirement from H20 is met: every case above uses `loginAs`. The inactive control in the matrix still uses a fixture session, as recorded under H20 and H24. Issue #13 owns the Rider consumer acceptance of H25. Its owner confirms that from the Rider branch. Group gates are not marked complete by this issue.
