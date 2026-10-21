# M1 PH4: Security, failure handling and regression coverage

Owner: NASZ. Phase PH4 of [phase framework](../../../shared/phase-framework.md). Status: Planned. PH4 expands and proves controls that PH2/PH3 already introduced; it does not postpone any essential control.

## 1 Objective

Every M1 security requirement (M1-01 to M1-12, M1 portions of S-01 to S-09) passes under hostile and concurrent conditions with recorded evidence; the whole-application authorization matrix A01 to A20 passes for every identity; private incident and restore-support commands exist and are tested; regression suites run in CI.

## 2 Entry criteria

- G3 passed (all M1 features work; TMP-01/TMP-03 retired; contract frozen).
- Maintenance-runner skeleton exists (M1-PH3-T10); owners have registered authorization-matrix rows for their PH3 endpoints.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Matrix rows for A10-A19 (expected outcomes per identity) | Zikri M2-PH4-T11, Qee M3-PH4-T11 | H43 | Rows contributed in PH2/PH3 are used; gaps listed as failing "missing row" checks |
| Domain functions to race against disablement (`update_delivery_status`, `create_parcel`) | Qee M3, Zikri M2 PH2/PH3 | H22, H23 | None; real functions exist at G3 |
| Backup lock implementation the runner must honor | Qee M3-PH4-T07 | H41 | No-op interface from PH3 |
| Local restore drill to consume session purge | Qee M3-PH4-T07 | H44 | Run purge command against a manual restore until the drill exists |

Independent now: T02, T04, T05, T07, T08, T10, T11.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH4-T01 | Complete the authorization matrix for A01-A20 x identities (anonymous, Seller A, Seller B, Rider A, Rider B, Admin, inactive, must-change): success where valid, wrong role, wrong ownership, expired/revoked session, missing/invalid CSRF on unsafe methods, malformed fields, unexpected sensitive fields; compare nonexistent versus inaccessible parcel/proof IDs; assert no unintended DB/file change and exact error shape | Matrix fails when any implemented endpoint lacks a row or an expectation differs from the contract | TC01, TC20 | H43 |
| M1-PH4-T02 | Session and CSRF hardening suites: attacker-chosen cookie not adopted (fixation), unknown cookie ignored, idle/absolute expiry over HTTP with a controlled clock, multi-device invalidation, `Origin`/`Host` validation, CSRF on every unsafe route including multipart and tracking POST | Matches contract session protocol | TC02, TC03, TC20, TC21 | T01 |
| M1-PH4-T03 | Race suite with barriers and separate connections: login versus password change, login versus disablement, logout versus last-seen touch, same-username registration (PH3), pending Rider write versus disablement (with Qee's function); at least five forced orderings per race using barriers (randomized interleavings beyond that are STRETCH) | Obsolete credential never yields a current session; revoked row never recreated; operation committed before disablement is valid, later ones denied | TC04-TC07 | H03, H23 |
| M1-PH4-T04 | Failure independence: failed-login audit and limiter counters survive a rejected request; audit-store failure means no session issued; two real server processes share the limiter | Fault injection around the real transaction boundary, not a mock of the whole service | TC08, TC09 | T01 |
| M1-PH4-T05 | Private operations commands using `ops_runtime` (never the web credential), as `ops_fn_owner` functions: `lock-account` (any role including Admin: disable, bump `session_version`, delete sessions, audit `ACCOUNT_LOCKED`), `recover-account` (privately reset credential, require password change, reactivate only after the operator confirms investigation, audit `ACCOUNT_RECOVERED`), `purge-sessions` (all sessions, audit `SESSIONS_PURGED`), `lock-accounts --from-file`, `reconcile-accounts --from-journal` and `quarantine-after-restore` (disable every Rider, force password change for all). Every account-changing event from the web endpoints and the commands is appended to the off-database account journal (write-only S3 prefix or CloudWatch Logs, buffered locally when offline; user ID, event and time only). No HTTP route exists | Route enumeration proves no public lock/recover path; hardened functions pass RLS-09; reconciliation proven by TC11 | TC10, TC11 | H03 |
| M1-PH4-T06 | Register M1 jobs in the runner: `purge_expired_sessions` (revision `session_cleanup_functions`) deleting expired sessions and rate-limit buckets in small batches, run hourly; a security-alert job every 5 minutes that checks the audit table for bursts (more than 20 `LOGIN_FAILED` per username or source, any Admin `LOGIN_THROTTLED`, more than 200 Admin `PARCEL_VIEWED` per hour) and notifies the recipient recorded for job failures; idempotent; logs counts only; honors the backup lock | Run twice, interrupt, concurrent copy blocked; burst alert fires on injected audit rows | TC16, TC22 | H33, H41 |
| M1-PH4-T07 | Enforce what PH1 introduced: switch CSP from report-only to enforced once the first full browser regression shows no violations (policy in the contract, with `img-src 'self' blob:` for proof images), Playwright fixtures fail on any `securitypolicyviolation` event, Host allow-list tests, `Referrer-Policy`, `nosniff`, HSTS only in production. Verify rendering of hostile display names in every M1 view | Headers present on API and HTML; zero violations during journeys | TC12, TC13 | none |
| M1-PH4-T08 | Canary scan and repository review: run the complete suite with canary passwords, tokens, addresses and a canary typed into the username field; scan captured application logs, proxy and PostgreSQL logs, audit rows, error bodies and test artifacts; the scanner has a positive control (a test-only route guarded by CT-02 logs a canary that the scan must find, and every scanned source must contain a minimum number of lines); run secret scanning on tree and history; confirm `.env.example` placeholders only (S-03, S-04, S-05) | Zero canary hits; positive control found; scan result stored with the run | TC14 | all suites |
| M1-PH4-T09 | M1 browser regression (Playwright): register, login, logout, Back button, session expiry mid-use, account switching in separate contexts, must-change flow, 403 CSRF refresh path | Runs in CI against Compose | TC15 | H10 |
| M1-PH4-T10 | Enforce CI gates and security tooling for M1: dependency audit (pip-audit, npm audit) blocks high/critical reachable findings, backend coverage gate (85 percent line, 80 percent branch) with the scenario lists above treated as required test names, frontend gate for auth features; run Bandit or Semgrep on `modules/auth`, Trivy and hadolint on the images and Compose, OWASP ZAP baseline and sqlmap against login, registration and the user-management routes on the Compose stack; record tool, version and output summary for the test document | A deliberate failing scenario blocks merge in a test PR; tool outputs stored | TC17, TC23 | T01-T09 |
| M1-PH4-T11 | Incident runbook (S-06): reporting to the Admin within one hour, who may run the private commands, custody of the operations credential so one locked Admin cannot block recovery, evidence preservation, post-restore reconciliation using the operations log; tabletop walk-through recorded | Reviewed by Zikri and Qee; contact channel recorded privately (placeholder only in Git) | TC19 | T05 |
| M1-PH4-T12 | Consolidated execution of worksheet rows M1-01 to M1-12 plus M1 shares of S-01, S-03 to S-06, S-08 against the same commit; update actual-result columns and attach safe evidence | Every row Pass or an open defect; no unexecuted row marked Pass | TC18 | T01-T11 |

## 5 Affected components

Backend `modules/auth/{ops_commands.py,jobs.py}`, `core/security_headers.py`, matrix and race tests under `backend/tests/{integration/auth,integration/cross_module}`; frontend headers/CSP-compatible build; `docs/runbooks/incident.md`; `tests/e2e/auth/`.

## 6 Security requirements

Controls verified or completed: fixation resistance, expiry, rotation, revocation, CSRF everywhere, credential/disablement races, failure-independent audit and rate limiting, shared limiter state, private incident commands, secure headers/CSP, safe rendering, secret/log hygiene, dependency gating. Policies P1, P2, P4, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH4-TC01 | Integration (IT-A01 matrix) | Every A01-A20 endpoint x 8 identities incl. wrong ownership, stale session, malformed, extra sensitive fields | Outcome equals contract; denied calls change nothing; nonexistent and inaccessible IDs indistinguishable | P1, M1-05, INT-04 |
| M1-PH4-TC02 | Integration (IT-A02) | Send arbitrary pre-set cookie then login; unknown cookie on `/auth/me`; request with foreign session token | New token issued after login; unknown cookie treated as anonymous; none adopted | M1-07 |
| M1-PH4-TC03 | Integration (IT-A02) | Controlled clock through HTTP: anonymous 10 min, idle 30 min, absolute 8 h; replay expired cookie; two devices | Boundaries exact; expired cookie 401; one device's expiry leaves others | S-02 |
| M1-PH4-TC04 | Concurrency (IT-A03) | Barrier: login verified on old hash while password change commits | No session derived from the obsolete hash; login restarts or fails | M1-11 |
| M1-PH4-TC05 | Concurrency (IT-A03) | Barrier: login versus disablement | Either login precedes disablement and the session is dead after it, or login fails | M1-11, M1-09 |
| M1-PH4-TC06 | Concurrency (IT-A03) | Barrier: logout versus last-seen touch | Row stays deleted; no upsert | M1-11 |
| M1-PH4-TC07 | Concurrency (IT-A03) | Rider start-delivery write versus Admin disablement, at least five forced orderings via barrier points | Writes committed before disablement are valid; later ones 401; no partial rows | INT-05, P1 |
| M1-PH4-TC08 | Integration (IT-A04) | Fail audit insert during login; wrong password then audit inspection; limiter after rolled-back request | No cookie when audit fails; failure audit and counter present | P5, M1-04 |
| M1-PH4-TC09 | Integration (IT-A04) | Run two server processes; 3 failures to each for one username | Sixth attempt throttled across both | M1-04 |
| M1-PH4-TC10 | Integration (IT-A03) | `ops_runtime` lock-account on a test Admin; old cookie; `recover-account`; route enumeration for lock/recover | Admin disabled, sessions gone, old cookie 401; recovery requires new password and fresh login; no HTTP route; audit and operations log entries | M1-12, REV-10 |
| M1-PH4-TC11 | Integration | Backup-style restore simulation (snapshot the database, then after the snapshot: Admin disables a Rider through A09, a user changes password through A06, an Admin is locked by command; restore the snapshot); run `purge-sessions`, `reconcile-accounts --from-journal`; repeat with the journal missing and run `quarantine-after-restore` | No session remains; the Rider disabled after the snapshot is disabled again; the user whose password changed is forced to change it; the locked Admin is locked; with the journal missing every Rider is disabled and all passwords must change; replay of a pre-restore cookie 401 | S-09, P1, P2 |
| M1-PH4-TC12 | Integration / browser | Response headers on API, HTML and static assets; browser console during journeys | Required headers present; no CSP violations; HSTS only in production config | S-02, S-08 |
| M1-PH4-TC13 | Browser (E2E-A03) | Display names `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>` in nav, list, audit, confirm dialog | Rendered as text; no dialog/script execution | M1-06 |
| M1-PH4-TC14 | Operations / scan | Full-suite canary scan including logs of all components and a username-field canary, with a positive control; secret scan of tree and history; static scan of `modules/auth` for string-built SQL | Zero canary hits in logs/audit/artifacts; no secrets; no SQL assembled from request values | S-03, S-04, S-05, M1-01 |
| M1-PH4-TC15 | Browser (E2E-A03) | Journey regression: expiry mid-use, account switching, Back after logout, CSRF refresh | No private data after logout/switch; deliberate resubmission only | S-08, INT-06 |
| M1-PH4-TC16 | Operations (OPS-03) | Cleanup job: expired versus live rows; twice; interrupted; concurrent copy | Only expired rows removed; idempotent; lock respected | REV-08 |
| M1-PH4-TC17 | CI gate | Test PR with failing required scenario, high-severity dependency fixture, coverage drop | Merge blocked in each case | testing strategy gates |
| M1-PH4-TC18 | Consolidated run | Execute M1-01 to M1-12 and M1 shares of shared rows | Worksheet rows have actual result, commit, environment, evidence | rubric criterion 3 |
| M1-PH4-TC19 | Review | Incident runbook tabletop (suspected Admin compromise) | Steps executable by two people without the compromised account; one-hour clock stated; evidence kept | S-06, P5 |
| M1-PH4-TC20 | Integration (S-01) | POST/PATCH without valid CSRF on A02, A06, A08, A09, A10, A15, A17 (multipart); A13 is exempt from the token and instead rejects a foreign `Origin` | 403 `CSRF_INVALID`; no state change | S-01 |
| M1-PH4-TC21 | Integration | Requests with unlisted `Host`; foreign `Origin` on unsafe methods | Rejected before routing; no side effects | S-02 |
| M1-PH4-TC22 | Operations (OPS-03) | Insert 25 `LOGIN_FAILED` rows for one username and an Admin `LOGIN_THROTTLED`; run the alert job | Notification sent to the recorded recipient within one run; no secrets in the message | P5, S-06 |
| M1-PH4-TC23 | Operations / tooling | Run Bandit or Semgrep, pip-audit, npm audit, Trivy, hadolint, ZAP baseline and sqlmap per T10 | No unresolved high finding; outputs stored with tool versions; findings triaged with owner | SRC-17, rubric 3 |

## 8 Deliverables and handoffs

H42 (private lock/recover/purge commands) to Qee for the restore drill and to the incident runbook; the authorization matrix runner with all rows to the group; runner jobs registered. Consumers confirm: Qee runs `purge-sessions` in OPS-05; Zikri's retention job runs under the same runner.

## 9 Exit criteria

- T01-T12 complete; TC01-TC23 pass on the same commit (TC23 tool runs may be nightly); worksheet rows M1-01 to M1-12 have actual results.
- Matrix reports zero missing rows and zero unexpected outcomes across all identities.
- Contributes to G4 items 1-6.

## 10 Integration checkpoint

Cross-module run on one commit: INT-04, INT-06 and INT-09 pass; INT-05 races pass with Qee's functions; incident commands operate against the same database used by Zikri's and Qee's suites; the CI job list matches the names recorded for branch protection.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Flaky race tests | Barrier-based, no sleeps; failures treated as defects; no rerun masking |
| CSP breaks the Vite build | Adjust build to external scripts and hashed assets; do not weaken to `unsafe-inline` |
| Operations credential lost | Custody rules in the runbook; two named holders recorded privately |
| Matrix contributors late | Missing-row check fails CI, making the gap visible |

## 12 Deferred work

HTTPS/proxy behavior, secrets handling on the host, Argon2 benchmark, release pipeline, post-restore reconciliation on AWS, cloud incident drill (PH5); final evidence (PH6).
