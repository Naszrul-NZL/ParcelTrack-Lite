# M3 PH3 Admin UI evidence

Recorded 28 November 2026 for M3-PH3-T09 and M3-PH3-TC12 on `feat/m3-ph3-admin-ui`, stacked on the proof/dashboard backend branch while its pull request completes review.

## Implemented scope

- `/admin/parcels` is a real Admin workspace over A14 and A15. Status, Rider, needs-reassignment and page changes issue fresh reads; terminal parcels expose no assignment action.
- Rider filters load the complete paginated A07 Rider directory. Assignment choices come from the separate `role=RIDER&isActive=true` A07 query, also followed across pages, so TMP-05 is not present.
- The Base UI dialog provides focus trapping, Escape dismissal and focus return. It names the parcel, exposes active Riders only, disables duplicate submission while pending and keeps the chosen Rider across a conflict refresh.
- A 409 or uncertain mutation result never replays the PATCH. The UI refetches A14, replaces the displayed parcel/version, announces the result and requires a new deliberate submission. A successful assignment closes the dialog, announces success and refreshes the current list. An `INVALID_ASSIGNEE` race refreshes A07.
- `/admin/dashboard` reads A18 and renders the total, all five canonical statuses including zero counts, the Kuala Lumpur generation time and links to `/admin/parcels?status=<STATUS>`.
- Both workspaces use `RouteGuard role="ADMIN"`. A07, A14, A15 and A18 continue to enforce the role on the server; the shared session client supplies the in-memory CSRF token to A15.

## Verification

| Check | Observed result |
| --- | --- |
| Focused Admin component suite | 8 passed: filters, active-only dialog, terminal action hiding, success refresh, 409 refresh/no replay, terminal/disabled-Rider races, read retries/empty state, zero counts and filtered links |
| Full unit/component suite | 28 files and 418 tests passed |
| Focused A14/A15/A18 integration regression | 2 files and 10 tests passed against the test Compose profile |
| TypeScript and changed-file ESLint | Passed |
| Production build | Passed; route inventory includes `/admin/dashboard` and `/admin/parcels` |
| Authenticated real-stack browser case | Desktop and 320px phone projects passed together; a separate phone rerun also passed |
| Browser interaction evidence | Real Seller registration, Seller denial at the Admin route, Admin dashboard filter link, real A15 assignment, refreshed Assigned row, dialog keyboard Enter/Escape/focus return, both themes, no horizontal overflow and 200% text enlargement |
| Visual review | Desktop light/dark dashboard, phone dashboard/list and the phone dialog were inspected from Playwright screenshots; records remain flat, controls reflow to one column and long tracking identifiers wrap |

The browser case runs against the test Compose profile with real cookies, PostgreSQL, A07/A14/A15/A18 and the shared CSRF client. Screenshots, traces and credentials remain under ignored `.local` paths.

## Remaining PH3 work

- T10 remains dependent on Zikri's H34 detail-slot contract for `RiderActionPanel` and `ProofViewer`.
- T11 to T14 still own the disable/reassign continuity closeout, shared proof fixture profiles, security worksheet execution and the complete INT-02/INT-03/INT-05 browser/conformance record.
