# M1 PH3: Complete module functionality

Owner: NASZ. Phase PH3 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

All M1 features work through the React UI and direct API against real PostgreSQL: Seller self-registration (M1-F01), login/logout for every role (M1-F02, completed in PH2), Admin creation of Riders with a forced first password change (M1-F03), password change that revokes every session (M1-F04), and user listing, disablement and reactivation plus the audit viewer (M1-F05). The Rider directory (A07) and disablement (A09) that Qee needs, and the maintenance-runner skeleton that Zikri and Qee need, are delivered early in the phase.

## 2 Entry criteria

- G2 passed: real sessions, CSRF, rate limit, audit service, authorization-matrix harness v1 in place; TMP-01 and TMP-04 retired.
- Contract v3 merged (error-code registry, audit event-type list).

## 3 Dependencies

| Needs | From | Handoff | Substitute until delivered |
| --- | --- | --- | --- |
| Domain surface to exercise must-change gate on M2/M3 endpoints (A10-A12, A16, A17) | Zikri, Qee PH2 | H22, H23 | Probe route in test factory for the gate itself; real endpoints added to matrix when merged |
| Parcel and assignment effects of disablement (reassignment flag, A14/A15) for INT-05 | Qee M3-PH3-T02, T03 | H37 | Test disablement and session rejection alone; INT-05 reassignment leg waits |
| Job modules to register in runner | Zikri M2-PH4-T03, Qee M3-PH4-T02, T04 | H40 | Runner proven with a dummy job; real jobs in PH4 |
| Backup/maintenance lock design | Qee M3-PH1-T06 | H13 | Runner checks the lock through an interface with a no-op implementation until PH4 |

Independent now: T01-T04, T06, T07, T10 (own tables and services).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH3-T01 | A07 `GET /admin/users`: filters `role`, `isActive`, `page`, `pageSize` (default 20, max 100), newest first with id tie-break; response `UserSummary` = Principal fields plus `isActive` and `version` only; Admin only; reads the column-limited `app_user` view of columns (never the hash). First task so Qee can build the assignment picker (`role=RIDER&isActive=true`) | Field allowlist test; Seller/Rider/anonymous denied; parameterized filters | TC09, TC12 | PH2 deps |
| M1-PH3-T02 | A09 `PATCH /admin/users/{userId}/status` `{isActive, expectedVersion}` through `set_user_active` (revision `account_functions`, shared with T03 and T06): Seller and Rider targets only (`403 TARGET_NOT_ALLOWED` for Admin or self); lock target row (after actor), compare version (`409 VERSION_CONFLICT`), set flag, increment `version` and `session_version`, delete the target's `auth_session` rows, audit `USER_STATUS_CHANGED` and append to the off-database account journal; reactivation does not revive sessions; no parcel changes | Disablement takes effect on the next request of the old cookie; stale version and double-submit safe | TC11, TC22 | H03, H20 |
| M1-PH3-T03 | A02 `POST /auth/register` `{username, displayName, password}` through `register_account` (role forced `SELLER` inside the function): strict schema (`extra=forbid`), normalized username, policy from password service, role forced `SELLER`, duplicate-safe via unique constraint (concurrent winners/losers return `201`/`409 USERNAME_TAKEN`, never 500), no auto-login, audit `USER_CREATED`, registration throttle 30 per source per hour (configurable), CSRF required | Role-injection fields rejected; no account for rejected requests | TC01-TC05, TC20 | H20, H21 |
| M1-PH3-T04 | A08 `POST /admin/riders` `{username, displayName, initialPassword}` through `register_account` (the function accepts `RIDER` only when the verified context is an Admin): Admin only; same validation; role `RIDER`, `must_change_password=true`; initial password expires after 72 hours if unused; never echoed or logged; response `UserSummary`; audit `USER_CREATED` and journal entry. Also (SHOULD) A21 `POST /admin/users/{userId}/password-reset` for Seller/Rider targets: random one-time password returned once, must-change set, sessions revoked, audit `PASSWORD_RESET`, 72-hour expiry. Also the private `provision-admin` command (revision `ops_functions`): reads the password privately, creates a named Admin with `must_change_password`, rerun for an existing username is a no-op, supports the two Admins of the case study | Role cannot be supplied; duplicate 409; expired initial password cannot log in; Admin creation only via the command | TC10, TC23, TC24 | T01 |
| M1-PH3-T05 | Complete the must-change-password gate that `require_authenticated` introduced in PH2: add the full test set across every M2 and M3 route and the allow-list (A01, A04, A05, A06 only); multipart and tracking exceptions documented (A13 is public and unaffected) | Gate enforced server-side for direct calls to every route that uses the dependency | TC08, TC18 | M2/M3 endpoints (matrix rows) |
| M1-PH3-T06 | A06 `POST /auth/password` `{currentPassword, newPassword}` through `change_password`: verify current password (attempts counted against the per-user limiter), policy, new != current (`422`), hash, clear `must_change_password`, increment `version` and `session_version`, delete all user sessions including the caller's, audit `PASSWORD_CHANGED` without values plus a journal entry, `204`; no automatic re-login | Wrong current password changes nothing; all devices lose access | TC06, TC07 | PH2 deps |
| M1-PH3-T07 | A20 `GET /admin/audit`: filters `eventType`, `parcelId`, `page`; safe fields only (id, event type, outcome, actor/target IDs, parcel ID, timestamp, request ID, allowlisted details); Admin only; includes events written by M2/M3 functions | No payload or secret fields; Seller/Rider denied | TC13 | H21 |
| M1-PH3-T08 | React screens: `/register` (confirmation field is usability only), `/account/password` (kept there for must-change users), `/admin/users` (paginated list with role/active filters, create-Rider form with initial password cleared after submit and never displayed again, disable/reactivate confirmation naming the target, refresh on 409, audit panel); labeled inputs, field errors, keyboard operation, pending states, passwords cleared after submit | Component and browser tests; no raw-HTML rendering of names | TC14-TC17 | T01-T07 |
| M1-PH3-T09 | Shared shell: navigation by role to landing pages, session-expiry handling (401 -> login with message), identity-change cache clear, must-change redirect overriding all private navigation, replace TMP-03 mocks for auth screens; M2 and M3 retire their own mocks in their screen tasks, and this task performs the combined check before G3 | Browser test covers account switch without stale private data | TC15, TC17 | H34/H35 slot placement |
| M1-PH3-T10 | Maintenance-runner skeleton and maintenance gate: `python -m app.maintenance run <job>`; job registry interface; PostgreSQL advisory lock per job so two copies cannot overlap; jobs take the shared backup lock and refuse to start while the exclusive backup lock is held; structured result log with counts and opaque IDs only; separate `maintenance_runtime` credential; exit codes for scheduler alerts. Also the route-based maintenance gate (rejects only business mutations with `503 MAINTENANCE`; A01, A03, A04, A05, A13 and reads continue) driven by `system_state.maintenance_mode` with expiry, and the `set_maintenance_mode` function (revision `ops_functions`) | Dummy-job test: lock contention, interruption, backup-lock hold; gate allow-list proven | TC19, TC25 | H13 |
| M1-PH3-T11 | Execute and record feature-level security rows: M1-02, M1-05, M1-06 (JSON side), M1-08, M1-09, M1-10, S-01 for A02/A06/A08/A09 | Worksheet actual results with commit | TC01-TC03, TC06, TC09, TC11 | T01-T07 |
| M1-PH3-T12 | Walking-skeleton AWS deployment (needs the EXT-04 decision before PH3 starts; unconditional once decided): deploy the PH3 build behind HTTPS on a **disposable** instance, verify login for three roles and cookie flags, record go/no-go for PH5, then destroy the instance and its credentials (PH5 uses fresh ones). If EXT-04 is still unresolved, record the blocker and the 5-mark consequence and escalate at G3 | Result recorded either way | TC21 | EXT-04 |
| M1-PH3-T13 | Contract conformance for A01-A09 and A20: OpenAPI paths, methods, request/response schemas, status codes and error codes match the contract and the registry | CT-03 fails the build on drift | TC18 | PH1 CT tooling |

## 5 Affected components

- Backend: `modules/auth/{routes_register.py,routes_password.py,routes_admin.py,audit_routes.py,users.py}`, `core/security_deps.py`, `maintenance/{runner.py,locks.py}`.
- Database: possibly additive migration for indexes (`app_user(role,is_active,created_at)`, `audit_event(event_type,occurred_at)`) via Zikri's chain.
- Frontend: `features/auth/{RegisterPage,PasswordPage,AdminUsersPage,AuditPanel}.tsx`, shell and navigation.

## 6 Security requirements

Role forced server-side; strict request schemas; password policy and common-password list; per-user limiter on current-password attempts; all-session revocation on password change; immediate disablement through `session_version`; Admin-only management endpoints; Admin and self never disabled through the web path; audit without secrets; passwords never echoed. Registration abuse limited by per-source throttle. Policies P1, P2, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH3-TC01 | Integration (IT-A01) | Register with 9-character and 10-character passwords | 9: 422 `fieldErrors.password`, no row; 10: 201 Seller, no session cookie | M1-02, M1-F01 |
| M1-PH3-TC02 | Integration (IT-A01) | Registration body with extra `role`, `isActive`, `mustChangePassword` values | 422 unknown field; no account; valid body gives role `SELLER` | M1-08 |
| M1-PH3-TC03 | Integration (IT-A01) | `ALICE` vs existing `alice`; two simultaneous registrations for one username | `409 USERNAME_TAKEN`; exactly one 201, one 409, no 500 | M1-F01 |
| M1-PH3-TC04 | Unit (UT-A01) | Usernames `a`, `a b`, Cyrillic homoglyph, 51 characters, SQL characters; display name 0 and 81 characters; common passwords | 422 each with field errors | M1-F01, P2 |
| M1-PH3-TC05 | Integration (UT-A05) | 11 registrations from one source in an hour | 11th `429` with `Retry-After` | M1-04 related |
| M1-PH3-TC06 | Integration (IT-A02) | Password change with wrong current password, then with correct one; repeated wrong attempts | Wrong: 422 `CURRENT_PASSWORD_INVALID`, old credential still works; repeated: 429; correct: 204 | M1-10, M1-F04 |
| M1-PH3-TC07 | Integration (IT-A02/A03) | User with two active sessions changes password | Both cookies 401; new password logs in, old fails; `must_change_password` false; audit has no values | M1-F04, INT-06 |
| M1-PH3-TC08 | Integration (IT-A01) | Must-change Rider calls `/auth/me`, `/auth/password`, then A16, A17, A12 and a Seller-only route | Allowed set works; others `403 PASSWORD_CHANGE_REQUIRED`; applies to M2/M3 routes | M1-F03, REV gate |
| M1-PH3-TC09 | Integration (IT-A03) | Seller opens `GET /admin/users`, posts `/admin/riders`, patches status; anonymous repeats | 403 / 401; no Rider created | M1-05 |
| M1-PH3-TC10 | Integration (IT-A01) | Admin creates Rider; short initial password; duplicate; extra `role` field | 201 `RIDER` with `mustChangePassword: true`; others 422/409; password absent from response and logs | M1-F03 |
| M1-PH3-TC11 | Integration (IT-A03) | Disable logged-in Rider and Seller; try old cookies and new login; reactivate; stale version; Admin and self as target | Old cookies 401 immediately; login generic 401; after reactivation old cookies stay invalid and fresh login works; stale 409 `VERSION_CONFLICT`; Admin/self 403 `TARGET_NOT_ALLOWED` | M1-09, M1-F05 |
| M1-PH3-TC12 | Integration (IT-A04) | List users by role/active/page; pageSize 500 | Only Admin; exact `UserSummary` fields; size capped at 100; stable order | M1-F05 |
| M1-PH3-TC13 | Integration | Audit list after login, creation, disablement and an M2/M3 event | Admin sees events with safe fields; filter by type; Seller denied | M1-F05, P5 |
| M1-PH3-TC14 | Component (CMP-A03) | Register form: mismatch confirmation, 9 characters, server duplicate error, pending | Inline errors from server field names; one submit; passwords cleared | M1-F01 |
| M1-PH3-TC15 | Component (CMP-A04) | Password page for normal and must-change user | Success redirects to login and clears cache; must-change user cannot navigate away | M1-F04 |
| M1-PH3-TC16 | Component (CMP-A05) | Admin users page: list/filter, create Rider, disable confirmation, 409, audit panel, display name `<img src=x onerror=alert(1)>` | Initial password field cleared and not shown after; confirmation names target; 409 refetches; payload shown as text | M1-06, M1-F05 |
| M1-PH3-TC17 | Browser (E2E-A02) | New Seller registers through `/register` and logs in; Admin creates Rider; Rider forced password change; Rider logs in with new password; Admin disables Rider; Rider acts again | Registration and first login work; forced change enforced; landing page after change; next Rider action returns to login | M1-F01, M1-F03, M1-F05, INT-05 |
| M1-PH3-TC18 | Contract (CT-03) | Compare OpenAPI to contract tables and error-code registry for A01-A09, A20 | No drift; unknown codes fail | contract |
| M1-PH3-TC19 | Operations (OPS-03 skeleton) | Dummy job twice concurrently; interrupt mid-run; hold backup lock | Second run exits as locked; interrupted job leaves no stale lock; runner refuses to start under backup lock; logs contain counts only | REV-08 |
| M1-PH3-TC20 | Unit (UT-A04) | Display name with HTML stored and returned | JSON contains literal text (encoded by JSON), never interpreted server-side | M1-06 |
| M1-PH3-TC21 | Operations | Walking-skeleton deployment: HTTPS login for Seller, Rider, Admin, then instance destroyed | Login works; cookie `Secure`, `HttpOnly`, `__Host-`; result recorded as pass, fail or blocked | rubric 1b |
| M1-PH3-TC22 | Integration (IT-A03) | Two Admin requests disable the same Rider with the same `expectedVersion` | One 200, one 409; one audit event | M1-F05 |
| M1-PH3-TC23 | Integration (IT-A01) | Admin resets a Seller's password (A21); old password; temporary password after 72 hours; reset on an Admin target | One-time password returned once and never logged; sessions revoked; must-change set; expired temporary or initial password cannot log in; Admin target `TARGET_NOT_ALLOWED`; audit `PASSWORD_RESET` | M1-F05, P1 |
| M1-PH3-TC24 | Integration | `provision-admin` for two usernames, rerun for one, wrong environment, weak password | Two Admins with must-change; rerun is a no-op and changes nothing; weak password rejected; command unreachable over HTTP | M1-F03, P1 |
| M1-PH3-TC25 | Integration (OPS-04) | With maintenance mode on: A08, A09, A10, A15, A17 and password change versus A01, A03, A04, A05, A13 and reads; expiry of the flag | Business mutations `503 MAINTENANCE`; allow-listed routes work; flag expires on its own | REV-08, D-15 |

## 8 Deliverables and handoffs

H30 (A07 Rider directory) and H31 (A09 disablement) to Qee in the first days of PH3; H32 (must-change gate) to all; H33 (maintenance runner skeleton) to Zikri and Qee. Qee confirms the assignment picker uses real A07 data (TMP-05 retired).

## 9 Exit criteria

- T01-T11 and T13 complete; T12 recorded as result or documented blocker; TC01-TC25 pass (TC21 only if EXT-04 resolved).
- No M1 route renders mock data (TMP-03 gone from auth screens).
- INT-05 session-rejection leg and INT-06 (password change and logout paths) pass; INT-01 registration leg passes.
- Contributes to G3.

## 10 Integration checkpoint

Full journey in one local stack: register Seller, Admin creates Rider, Rider changes password, Seller registers parcel (Zikri), Admin assigns (Qee), Admin disables Rider and the old cookie fails. Matrix harness includes rows for every A01-A09/A20 endpoint and the must-change case for A10-A12, A16-A19.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Admin password handoff leaks | Initial passwords only in the creation request; forced change; document private channel in the incident runbook |
| Disablement races with a parcel write | Domain functions call `lock_active_actor`; race proven in M1-PH4-T03 |
| Registration enumeration | Registration is allowed to reveal duplicates (unavoidable); throttle and audit; login remains generic |
| Last Admin disabled or compromised | Web endpoint cannot target Admins; private commands in PH4 |

## 12 Deferred work

Full matrix, race and fixation suites, failure-audit independence, incident and session-purge commands, runner jobs, security headers (PH4); HTTPS/production verification (PH5).
