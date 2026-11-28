# M3 Rider outcomes and security-row evidence

Recorded 28 November 2026 on `feat/m3-ph3-rider-outcomes` for issue #53.

## Delivered scope

- The H34 parcel-detail slot now uses the real Rider action panel.
- An assigned Rider can start delivery. An Out for delivery parcel exposes only Delivered or Failed plus one required JPG/PNG proof.
- The client gives immediate feedback for missing, empty, wrong-type, double-extension and over-3-MiB files. A17 remains authoritative and performs bounded multipart parsing, assignment/version checks, decoded-image validation, sanitization and private storage.
- A 409 or uncertain result refreshes A12 before another deliberate submission. The selected file is retained while the action remains available, and no request is replayed automatically.
- `docs/security-tests.md` records observed results for M3-01 through M3-09. M3-10 remains a PH4 concurrency row.

## Automated evidence

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit and component suite, one worker | 35 files, 445 tests passed |
| Focused M3 integration (`rider-delivery`, `delivery-final`, `delivery-proof-dashboard`, authorization matrix) | 4 files, 36 tests passed against the isolated Supabase/PostgreSQL stack |
| Rider phone Playwright suite | 3 tests passed, including real assignment, Start, Delivered with JPEG, Rider isolation, `shell.php.jpg` rejection and 3 MiB + 1 byte rejection |
| Production build | Passed with Next.js 16.4.6 |
| SQL hardening, shared contract and Airway token/contrast checks | Passed |

The phone journey recorded exactly two A17 requests: the intentional Start and the valid Delivered submission. Selecting `shell.php.jpg` and the oversized fixture produced no request.

## UI delivery evidence

- Verified at 320 px and 375 px widths with no horizontal overflow.
- Verified in light and dark themes; the freight docket and action panel remain legible in both.
- Verified at 200% root text size with no horizontal overflow.
- The real file input, both outcome radios and the submit action are keyboard reachable; focus remains visible.
- Controls meet the 44 px minimum target, errors are inline and announced, and failed submit focus moves to the error summary.
- Motion is limited to the shared color transitions and respects the existing reduced-motion behavior.

Screenshots and Playwright traces remain under ignored `.local/test-results`; they contain only synthetic fixture data.
