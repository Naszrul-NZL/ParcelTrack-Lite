# M1 PH2: Initial working checkpoint slice

Owner: Naszrul. Phase PH2 of [phase framework](../../../shared/phase-framework.md). Status: Planned. This is the 22 October checkpoint slice, not M1 completion.

## 1 Objective

A seeded Admin, Seller or Rider logs in through the real server-side session mechanism, lands on a role-specific protected page, survives refresh, is refused on wrong credentials or missing CSRF, and loses access after logout. The same `require_authenticated`/`require_role` dependencies, CSRF check, rate-limit and audit services are consumed by Zikri's and Syauqi's slices, replacing the PH1 test principal (TMP-01).

## 2 Entry criteria

- G1 checkpoint-critical subset done: M1-PH1 T01-T03, T06-T08, T10; M2-PH1 T01-T06; M3-PH1 T01, T03.
- Migration 0002 applied in the shared dev database; fixture loader runs (H11).

## 3 Dependencies

| Needs | From | Handoff | Substitute until delivered |
| --- | --- | --- | --- |
| Fixture loader and dataset format | Zikri M2-PH1-T06 | H11 | Local SQL seed through a test-only provisioner role; no committed passwords |
| `unit_of_work(principal)` context helper | Zikri M2-PH1-T03 | H07 | Skip T08 integration test until delivered; unit-test the dependency with a fake |
| Pytest harness with role-asserting connections, controlled clock, Playwright skeleton | Syauqi M3-PH1-T01, T02 | H10 | Ad-hoc fixtures (not carried into G2) |
| Role landing routes (`/seller/parcels`, `/rider/parcels`, `/admin/dashboard`) | Zikri M2-PH2-T05, Syauqi M3-PH2-T05 | none | Placeholder "landing" component per role until pages exist |

Independent now: T02, T03, T04, T07 (pure services plus tables from 0002).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH2-T01 (CP) | Seed accounts for the shared dataset: Admin, Seller A, Seller B, Rider A, Rider B, one inactive account, one must-change Rider. Real Argon2id hashes generated at load time from passwords read from environment variables named in `.env.example`; none committed | Loader refuses `APP_ENV=production`; re-run changes no credentials and creates no duplicates | TC16, TC17 | H11, M1-PH1-T10 (H14) |
| M1-PH2-T02 (CP) | Session store service: token of 32 random bytes encoded URL-safe; persist only SHA-256 digest, `csrf_token`, `user_id`, `user_session_version`, created/last-seen/expires/absolute-expires; cookie settings by environment (production `__Host-ptl_session`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain; dev localhost-only name, non-Secure, refused in production); last-seen touch is UPDATE-only against an unexpired row; idle 30 min, absolute 8 h, anonymous 10 min absolute (configurable) | Expiry boundaries inclusive/exclusive as in contract; touch cannot recreate a revoked row | TC01, TC11 | none |
| M1-PH2-T03 (CP) | A01 `GET /auth/csrf`: create an anonymous session only when the client has none (lazy; otherwise resume), return `{csrfToken}`, `Cache-Control: no-store`; `verify_csrf` dependency: header `X-CSRF-Token` compared in constant time with the session token, plus `Origin`/`Sec-Fetch-Site` same-origin check against configured origin; an unsafe request carrying neither `Origin` nor `Sec-Fetch-Site` is rejected unless `Referer` is same-origin; failures `403 CSRF_INVALID` | Missing, wrong and cross-session tokens rejected; same-origin check rejects foreign `Origin` | TC07, TC19 | T02, T04 |
| M1-PH2-T04 (CP) | Rate-limit service v1 in PostgreSQL: atomic `INSERT ... ON CONFLICT DO UPDATE` counters keyed by HMAC digests (`RATE_LIMIT_KEY`) of bucket type, identity and source (IPv6 sources by /64), window id; returns allow/deny with `Retry-After`; defaults from the contract: login hard block 5 failures per (username, source) per 15 minutes, username-only counter 20 failures (audit `LOGIN_THROTTLED` and alert only, never a block), per-source 100 failures with successes not counted; anonymous-session creation 60 per source per minute; clock injectable. Source IP comes only from the trusted-proxy rule (socket address in dev). Throttle events are audited | Threshold-1, threshold and over-threshold; window expiry; an attacker at source B cannot block the victim at source A; keys never contain raw usernames or IPs | TC05, TC19, TC20 | H05 |
| M1-PH2-T05 (CP) | A03 `POST /auth/login`: reject passwords over 128 characters before hashing; normalize username; parameterized lookup through `get_login_snapshot`; Argon2id verify (hashing semaphore) or constant-work dummy verify; generic `401 AUTH_INVALID` for unknown user, wrong password and inactive account; lock the account row `FOR UPDATE` and re-read hash and `session_version` before issuing (snapshot must match, account active); revoke the anonymous session, issue new session and CSRF token; response `PrincipalDTO` plus `csrfToken`; failure counters and failure audit run in their own transaction **after** the main transaction closes (never nested); no session if the audit store fails; unknown usernames are not logged, only a keyed digest; provisional Argon2 parameters set here | Matches contract A03 and session protocol | TC01-TC05, TC10, TC12, TC21 | T02-T04, T07 |
| M1-PH2-T06 (CP) | A04 logout (204; revoke row, expire cookie), A05 `GET /auth/me`; implement `require_authenticated` (active account, matching `session_version`, not expired, returns `AuthContext`; 401 JSON never HTML; **must-change gate**: while `must_change_password` is set only A01, A04, A05 and A06 are allowed and every other route gets `403 PASSWORD_CHANGE_REQUIRED`, so M2/M3 routes are protected from their first PH2 version) and `require_role` (403 for wrong role) | Contract statuses; old cookie unusable after logout; gate proven on a probe route | TC06, TC08, TC10, TC22 | T02, T03 |
| M1-PH2-T07 (CP) | Audit service v1: allowlisted event types (`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`) with actor, outcome, request ID, timestamp, allowlisted details; rejects unknown keys; domain SQL functions of M2/M3 insert their own events through the same schema | Logs and rows never contain passwords, full addresses or raw bodies | TC12, TC13 | none |
| M1-PH2-T08 (CP) | Explicit unit of work in services (not a yield dependency, whose commit timing varies between FastAPI versions): helper `with principal_uow(auth_context) as db:` that calls Zikri's `unit_of_work(user_id, session_version)` so `app.user_id` and `app.session_version` are set transaction-locally; commit happens inside the `with` before the response is built; verify a bumped `session_version` denies both the dependency and RLS reads | No identity from request parameters or headers; commit-before-response test | TC09 | H07 |
| M1-PH2-T09 (CP) | Retire TMP-01 and TMP-04: provide `login_as(role)` test helper that uses the real endpoints and returns cookie jar plus CSRF; an import-graph test (not a grep) fails if any module under `backend/tests/integration` can import the principal override; fixture seed passwords are refused when `APP_ENV` is not `test` | Guard test proves override unreachable from integration tests | TC16 | T05, H10 |
| M1-PH2-T10 (CP) | React: `/login` form (username, password, pending state, generic failure message, 429 retry hint, password cleared after submit), real session provider using A01/A05, role landing redirect, logout control, route guards, identity-change cache clear | Component and browser tests; CSRF token held in memory only | TC14, TC15 | H06 |
| M1-PH2-T11 | Execute and record the PH2 security baseline in the worksheet (M1-01, M1-03, M1-04 login part, M1-07, S-01 login/logout, S-04, S-05 login events); everything else stays Planned | Actual result column updated with commit and environment; no claim beyond PH2 scope | TC03-TC07, TC12, TC13, TC17 | T05, T06 |
| M1-PH2-T12 | Authorization-matrix harness v1 (`tests/integration/authz_matrix`): table of endpoint x identity (anonymous, Seller A, Seller B, Rider A, Rider B, Admin, inactive, must-change) x expectation; each owner registers rows with their endpoint; PH2 rows: A01-A05, A10-A12, A16, A17 | Harness fails if an implemented endpoint has no row | TC18 | T06, H10 |
| M1-PH2-T13 | M1 checkpoint demo script: failed login (SQL-injection string and wrong password), successful login as each role, refresh, logout then old-cookie reuse, Seller opening an Admin route denied, CSRF-less POST rejected | Script ran against the checkpoint commit; unimplemented functions named as planned | demo notes | all above |

## 5 Affected components

- Backend: `modules/auth/{sessions.py,csrf.py,rate_limit.py,audit.py,routes.py,deps.py}`, `core/deps.py` (`principal_uow`).
- Database: tables from 0002 (no new migration expected; small corrective migration only through Zikri's chain).
- Frontend: `features/auth/{LoginPage,LandingRedirect}.tsx`, `app/SessionProvider.tsx`, `app/RouteGuard.tsx`.
- Tests: `backend/tests/{unit,integration}/auth/`, `tests/e2e/auth/`, `tests/integration/authz_matrix`.

## 6 Security requirements

Server-side sessions with digest-only storage; cookie flags; session rotation at login and revocation at logout; Argon2id; parameterized queries; generic login errors; login throttling (rate limit) shared in PostgreSQL; CSRF on login and logout; server-side role checks; stale `session_version` denial; audit of login success/failure without secrets; generic 500 responses. Maps to rubric 2a for M1 and policies P1, P2, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH2-TC01 | Integration (IT-A02) | Login as Seller A | 200 Principal and `csrfToken`; Set-Cookie HttpOnly, SameSite=Lax, Path=/, no Domain (Secure and `__Host-` under production config); stored value is SHA-256 digest, not the cookie | S-02 (local), M1-03 |
| M1-PH2-TC02 | Integration (IT-A02) | Capture anonymous session token, login, reuse old token | Token after login differs; old token rejected | M1-07 |
| M1-PH2-TC03 | Integration (IT-A04) | Login username `' OR '1'='1` with any password | 401 `AUTH_INVALID`; no session row; failure audit row; no SQL text in body | M1-01 |
| M1-PH2-TC04 | Integration | Unknown user vs wrong password vs inactive account | Same status, code and message; all increment limiter | M1-04, P5 |
| M1-PH2-TC05 | Unit and integration (UT-A05) | 4 then 5 failures for one (username, source), 6th attempt with the correct password; the same username from a second source; 150 failures from one source with distinct usernames; 50 successful logins from one source; advance controlled clock past window | 6th is 429 with `Retry-After` and a `LOGIN_THROTTLED` audit event; the second source is unaffected; the per-source failure cap triggers only on failures; successful logins are not throttled; success after window | M1-04 |
| M1-PH2-TC06 | Integration (IT-A02) | Logout, then `GET /auth/me` with old cookie | 204 then 401; cookie expired in response; row revoked | M1-07 |
| M1-PH2-TC07 | Integration (IT-A02) | `POST /auth/login` and `/auth/logout` with no token, wrong token, token from another session, foreign `Origin`, and with neither `Origin` nor `Sec-Fetch-Site` (non-browser client) | 403 `CSRF_INVALID` each; the no-header case is accepted only with a same-origin `Referer`; no state change | S-01 |
| M1-PH2-TC08 | Integration (IT-A03) | Probe Admin-only route as anonymous, Seller, Admin | 401, 403, 200 | M1-05 (prep), P1 |
| M1-PH2-TC09 | Integration (RLS-04 link) | Increment user's `session_version` in the database, then call `/auth/me` and a `principal_uow` read | Both 401/denied | M1-09 prep, RLS-04 |
| M1-PH2-TC10 | Integration | Login as inactive user; deactivate a logged-in user | Generic 401 at login; existing cookie 401 next request | M1-09 prep |
| M1-PH2-TC11 | Unit (UT-A02) | Controlled clock: anonymous 10 min; idle 29:59 vs 30:00; absolute 8 h with continuous activity; touch on deleted row | Boundaries as specified; touch never recreates | S-02 |
| M1-PH2-TC12 | Integration (IT-A04) | Failed and successful login; inspect `audit_event` and logs | One event each, no password, token or body; failure event persisted | S-05, P5 |
| M1-PH2-TC13 | Unit (UT-A04) | Force a handler exception in a test route | Generic 500 `INTERNAL_ERROR` with request ID; stack only in log | S-04 |
| M1-PH2-TC14 | Component (CMP-A02) | Login form: empty fields, pending, 401, 429, success | Field errors; submit disabled while pending; generic failure copy; password cleared; no token in storage | M1-F02 |
| M1-PH2-TC15 | Browser (E2E-A01) | Playwright: log in as each role, refresh, logout, press Back, open protected URL logged out | Role landing; session survives refresh; Back shows login not private content; protected URL redirects to login | M1-F02, S-08 |
| M1-PH2-TC16 | Integration / static | `login_as` helper; grep guard for principal override | Helper works with real endpoints; import-graph guard fails if the override is reachable from integration tests; seed passwords refused outside test | TMP-01 retirement |
| M1-PH2-TC17 | Integration | Query `app_user.password_hash` for seeded accounts; search DB dumps/logs for the seed passwords | `$argon2id$` prefix; no plaintext anywhere | M1-03 |
| M1-PH2-TC18 | Integration (IT-A01 matrix) | Matrix rows A01-A05, A10-A12, A16, A17 for each identity | Statuses match contract; harness fails when a route lacks a row | authz matrix |
| M1-PH2-TC19 | Integration | Repeated `GET /auth/csrf` with the same cookie, then 61 cookie-less calls from one source in a minute | Existing session is reused (no new row); the 61st cookie-less call is 429 with `Retry-After` | S-01, rate limits |
| M1-PH2-TC20 | Integration (UT-A05) | Attacker from source B sends 5 bad logins for a victim username while the victim logs in correctly from source A | Victim's correct login from A succeeds; only B is blocked; `LOGIN_THROTTLED` recorded for the username-only counter at 20 | M1-04 |
| M1-PH2-TC21 | Integration (capacity) | 100 concurrent logins with a 1 MB password body; 100 concurrent valid logins | Oversized bodies get 413/422 before hashing with bounded memory; valid logins beyond the semaphore either wait or get `503 BUSY`, never exhausting memory | M1-04, P4 |
| M1-PH2-TC22 | Integration (IT-A01) | Probe route plus A05, A04, A06 stub and one non-allowed route for a must-change user | Allowed set works; every other route returns `403 PASSWORD_CHANGE_REQUIRED` | M1-F03 |

## 8 Deliverables and handoffs

H20 (real session auth, `login_as`, retires TMP-01) to Zikri and Syauqi; H21 (rate-limit and audit services) to all; H24 (authorization-matrix harness) to all. The consumers confirm by switching their slice tests to `login_as` and removing the principal override.

## 9 Exit criteria

- T01-T13 complete; TC01-TC22 pass in CI.
- Zikri's A10/A11/A12 and Syauqi's A16/A17 slice tests run under `login_as` with no principal override (INT-CP-01).
- Worksheet rows executed in T11 show actual results with commit hash; unexercised rows remain Planned.
- Contributes to G2 items 1, 2, 3, 4.

## 10 Integration checkpoint

INT-CP-01 login leg: Seller A, Rider A, Admin each log in against the shared dev database and receive working cookies; Zikri's parcel creation and Syauqi's start-delivery calls succeed with those cookies and fail for the wrong role or missing CSRF (INT-CP-02). See [integration tests](../../../shared/integration-tests.md).

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Slice integration slips and consumers need cookies earlier | Use TMP-04 (provisioner inserts a real session row) in early PH2 only; remove by T09 |
| Rate limiter counts committed inside rolled-back login transaction | Keep limiter and failure audit in their own transaction; TC05 and TC12 fail the build otherwise |
| `__Host-` cookie cannot be tested over HTTP in dev | Separate dev cookie name through settings; production flags verified by TC01 using production settings and by PH5 on HTTPS |
| Argon2 slow in CI | Low-cost parameters through a test-only setting refused in production (TC03 in PH1) |

## 12 Deferred work

Registration, password change, must-change gate, Rider creation, user list/disable, audit viewer, runner (PH3); full CSRF/session/race suites, incident commands (PH4); HTTPS verification (PH5).
