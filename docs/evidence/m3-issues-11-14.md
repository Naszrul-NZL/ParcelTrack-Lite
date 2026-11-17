# M3 foundation and Rider slice working evidence

Recorded 17 November 2026. Baseline `571c4a5f8a000f6ba3aacde59e3c7320457040eb`. [Issue #11](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/11), [issue #12](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/12), [issue #13](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/13) and [issue #14](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/14) remain open.

| Issue and task | Work prepared | Acceptance still due |
| --- | --- | --- |
| #11 · M3-PH1-T01/T02/T05/T09 · H10/H13 | HAR-01 checks for audit isolation and overlapping connections, plus benchmark reporting and fixture manifest checks. The CI foundation smoke passed. The [foundation evidence](m3-ph1-foundation.md) records the harness teardown race and its correction. | Rerun the corrected harness. Measure the benchmark with the full isolated Supabase stack running and record the two owners' contract review and consumer runs. H20 real HTTP and later recovery/failpoint evidence remain separate. |
| #12 · M3-PH2-T02/T03 · H23 | Draft `0006` and A17 handler. The tests exercise the restricted Rider role, a race between two writes at the same version, audit/history, SQL/rule parity, role and CSRF denial, and body caps. The multipart OpenAPI operation is ready for route registration. | Run draft integration tests. Promote `0006` after M2's `0005` merges and the grants are reviewed. Mount A17 and verify the live route using H20 and the shared A12 detail handoff. |
| #13 · M3-PH2-T01/T04 · H25/TMP-02 | Seeded idempotent Rider A/B profile and Registered example, with a synthetic manifest. A16 handler and service use explicit assignment filtering, RLS, status validation, stable pagination and the summary DTO. The tests include reuse of a session cookie after account disablement. | Run service and fixture integration tests, connect the H25 loader hook, and exercise A16 and its authorization matrix with H20. |
| #14 · M3-PH2-T05 · TC08 | Airway Rider list component using shared controls and statuses. Component cases cover loading, empty/error and pending states, private detail navigation, refresh after success or conflict, and no automatic retry after uncertain writes. Mocks are confined to tests. | Run component tests and review both themes, keyboard use and narrow/desktop widths. Wire the page after A16/A17, H20 and A12 are ready. Run TC09 with real logins on the phone project. |

## Checks run in this checkout

| Check | Result |
| --- | --- |
| Documentation checker | Zero errors or warnings |
| SQL hardening lint | Current migrations and the draft `0006` pass the static lint |
| Airway token checker | 32 contrast pairs, theme parity and generated CSS match |
| TypeScript | Syntax checks passed locally and the original PR head passed dependency-aware CI type checking. |
| Node multipart probe | Seven checks on the handler's native `Request`/`FormData` parsing passed after removing stream cancellation on oversized input. The checks covered both declared and streamed size caps. The schema boundary was stubbed, so this did not run Zod or the authorization wrapper. |
| Existing pure delivery rules | All 250 role/state/proof combinations checked for allowed transitions using Node.js 24.22.1. |
| GitHub Actions on `e380e1e` | Type checking, unit tests, contract checks, migration checks, secret scan and foundation browser smoke passed. Push integration passed with the fixture-backed SQL parity case. PR integration exposed the harness teardown race. App CI failed because the Rider tests selected both the filter option and the parcel status badge. The tests now scope the assertion to the parcel. [Initial PR workflow](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/44042631232) |
| Local follow-up | `npm run check` passed on Windows x64 with Node 24.22.1 and npm 11.9.0. It ran type checking, ESLint, 320 unit/component tests, SQL lint, the contract snapshot check and 32 Airway contrast checks. The standalone image probe passed all 17 fixtures. [Image measurements](m3-ph1-foundation.md) |

G1 and G2 remain pending. The `0006` draft is outside the registered migration directory, the Rider handlers and page are unmounted, and TMP-02/TMP-04 are confined to the isolated tests. The authorization tests invoke the same handler functions with real database fixture sessions once Supabase is running. Live login acceptance uses H20.

Before mounting A17, reconcile the HTTP server's 60-second request limit with the database's 15-second idle-in-transaction limit. The handler currently reads the request body inside the authenticated transaction.
