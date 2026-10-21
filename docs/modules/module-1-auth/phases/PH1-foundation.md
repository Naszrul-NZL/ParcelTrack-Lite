# M1 PH1: Foundation and shared contracts

Owner: NASZ (Naszrul-NZL). Phase PH1 of [phase framework](../../../shared/phase-framework.md). Status: Planned, nothing implemented. `(CP)` marks work required for the 22 October checkpoint.

## 1 Objective

A clean checkout builds and starts one local stack (PostgreSQL, FastAPI, React dev server). The shared auth foundation exists so Zikri and Qee can code against real tables, a stable authentication interface and a common frontend client: migration 0002 (accounts, sessions, rate-limit buckets, audit events), the `lock_active_actor` database function, an Argon2id password service, error/logging conventions and the React API client skeleton.

## 2 Entry criteria

- Reviewed plan set in `docs/` merged; contract v3 amendments proposed ([system contract](../../../shared/system-contract.md#contract-v3-amendments)).
- Repository contains docs only; no application code exists.
- Team agrees the stack and directory layout in the contract (React/TypeScript/Vite, FastAPI, SQLAlchemy/psycopg/Alembic, PostgreSQL, Docker Compose).

## 3 Dependencies

| Needs | From | Handoff | Substitute until delivered |
| --- | --- | --- | --- |
| DB roles bootstrap and function-owner roles (`auth_fn_owner`) before `lock_active_actor` can be created | Zikri M2-PH1-T01 | H02 | Draft SQL in a branch; merge only after H02 |
| Alembic chain, migration 0001, hardened-function template | Zikri M2-PH1-T02 | H02 | Create `alembic.ini`/`env.py` in T01; 0001 content owned by Zikri |
| Role/status constants for CHECK constraints | Zikri M2-PH1-T04 | H08 | Role set (`SELLER`,`RIDER`,`ADMIN`) is fixed by the contract; copy until constants land, then replace |
| Pytest harness (disposable DB, role-asserting connection) | Qee M3-PH1-T01 | H10 | Local ad-hoc fixtures for T06/T07 tests; migrate to the harness before G1 |

Independent right now: T01-T05, T10, T11 (no other deliverable needed).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH1-T01 (CP) | Create repository skeleton exactly as the contract tree: `backend/app/{main.py,core,modules/{auth,parcels,delivery}}`, `backend/alembic`, `backend/tests/{unit,integration}/...`, `frontend/src/{app,shared,features/{auth,parcels,delivery}}`, `infra/`, `tests/{e2e,operations}`. Python project file with locked dependency file; `package.json` with `package-lock.json`; record Python, Node and PostgreSQL versions in `infra/VERSIONS.md`; extend `.gitignore` (`.env`, `*.pem`, storage dirs, caches, `node_modules`, build output). Create `alembic.ini` and `env.py` (migration URL from env only) | Directory names match [contract](../../../shared/system-contract.md#architecture-and-code-boundaries); no secret-like file tracked | TC11, TC12 | none |
| M1-PH1-T02 (CP) | Settings module (typed environment settings, no defaults for secrets): app environment (`dev`/`test`/`production`), origin, DB URLs per role, cookie names, lifetimes, throttle limits, trusted proxy CIDRs, `FINGERPRINT_KEY`, `RATE_LIMIT_KEY` (separate secrets), proof directory, log level. Production startup fails closed when any test-only flag or `FAILPOINT_*` variable is set, a required secret is missing, or a localhost cookie name is selected. `.env.example` contains names and inert placeholders only | Fail-closed matrix: production+test flag, production+failpoint variable, production+missing secret, dev+missing optional; error text never prints secret values | TC03, TC07 | none |
| M1-PH1-T03 (CP) | Dev Compose stack: pinned PostgreSQL image, backend with source mount and reload, frontend Vite server proxying `/api` to backend, named volumes; DB port bound to 127.0.0.1 only and optional; health check; one `make`/script entry `scripts/dev-up` documented in README | `docker compose up` yields reachable `/api/v1` health and Vite page; `docker compose config` shows no real secrets | TC11 | T01, T02 |
| M1-PH1-T04 (CP) | Core API conventions: error envelope `{error:{code,message,fieldErrors?},requestId}`; request-ID middleware (generate, return `X-Request-Id`, add to logs); handler mapping FastAPI validation errors to 422 envelope without echoing password or full payload; generic 500; SQLSTATE-to-code mapping for the `PT` class and the lock, deadlock and timeout states (`core/errors.py`, unit-tested against the registry); `Cache-Control: no-store` for everything under `/api/v1`; security headers from the first response (`nosniff`, `Referrer-Policy: no-referrer`, CSP in report-only mode with the exact policy in the contract, HSTS only in production) and the Host allow-list; JSON camelCase aliasing helper; bigint-as-string serializer | Shapes equal [contract API conventions](../../../shared/system-contract.md#api-conventions); only registry codes; headers present on API and HTML | TC01, TC13, TC15 | T01 |
| M1-PH1-T05 (CP) | Logging: structured JSON logs, redaction filter for keys `password`, `newPassword`, `currentPassword`, `token`, `csrf`, `cookie`, `authorization`, `recipient*`, `phone`, `address`; request bodies never logged; access log excludes query strings; attempted usernames of unknown accounts are never logged or stored (keyed digest and length only), because users sometimes type passwords into the username field; Docker log rotation (`max-size`, `max-file`) configured in Compose | Canary values in a logged dict, exception message, header and a username field never appear in output | TC02 | T01 |
| M1-PH1-T06 (CP) | Migration `0002_auth_core`: tables `app_user`, `auth_session`, `rate_limit_bucket`, `audit_event` (`parcel_id` is a plain nullable bigint; Zikri's 0003 adds the FK) and single-row `system_state(maintenance_mode, set_until)`. Constraints: lowercase username check `^[a-z0-9._-]{3,50}$`, role check from the shared constants, unique username, positive versions, session expiry ordering, bucket unique key, audit event-type CHECK from the contract list. Indexes per contract. **Privileges:** `app_runtime` has no INSERT/UPDATE/DELETE on `app_user` and no SELECT on `password_hash` (column-limited SELECT on the other columns, which also serves the Rider directory); `audit_event` is insert-only (no UPDATE/DELETE privilege plus a rejecting trigger); direct DML on `auth_session` and `rate_limit_bucket` only | Migration applies on bootstrapped empty database via migration role; constraint violations rejected; privilege assertions pass | TC05, TC14 | M2-PH1-T01, T02 (H02), M2-PH1-T04 (H08) |
| M1-PH1-T07 (CP) | In the same revision, hardened functions owned by `auth_fn_owner`: `lock_active_actor(user_id, session_version, allowed_roles, mode)` (locks the `app_user` row `FOR SHARE` for ordering-only checks or `FOR UPDATE` for login, password change and disablement; verifies `is_active`, matching `session_version`, allowed role and optionally not `must_change_password`; returns the role or raises the registered `PT` error) and `get_login_snapshot(username)` (the only path that returns the password hash and versions). `SECURITY DEFINER`, fixed `search_path` with `pg_temp` last, qualified names, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` (`domain_writer` for the lock; `app_runtime` for the snapshot), all in the 0002 transaction. Lock order rule in the function comment: acting account, target account, then parcel | Hardening lint passes; behavior tests | TC06 | M2-PH1-T01, T02 |
| M1-PH1-T08 (CP) | Authentication interface for other modules: `PrincipalDTO` (`id`,`username`,`displayName`,`role`,`mustChangePassword`; what the browser receives) separate from the internal `AuthContext` (adds `sessionVersion`), `require_authenticated`, `require_role(*roles)` and `verify_csrf` dependency signatures with documented behavior. Provide **TMP-01** test principal override, installed only by `create_app(env="test")`/pytest fixtures through FastAPI `dependency_overrides`; test hooks (failpoints, barriers) live in the same test-only registry; there is no header, query or cookie switch and the production factory does not import them | Production factory has an empty registry; request carrying a spoof header gets 401; `sessionVersion` never serialized | TC07 | T02, T04 |
| M1-PH1-T09 (CP) | Frontend foundation: typed `apiClient` (same-origin credentials, `X-CSRF-Token` on POST/PATCH/DELETE, error normalization, `Blob` responses for A19, multipart left to the browser, no automatic mutation retry), session provider skeleton, route-guard skeleton, query-cache clear on identity change/401, OpenAPI-to-TypeScript generation script with drift check (types for DTOs appear once routes exist), MSW mocks for early UI work (**TMP-03**), excluded from production bundles by a build assertion | No private payload or token in `localStorage`/`sessionStorage`; mocks only in dev/test builds | TC08, TC09, TC10 | T01, T04 |
| M1-PH1-T10 (CP) | Password service on a maintained Argon2id library: hash, verify, `needs_rehash`, constant-work dummy verify for unknown users using the same parameters as real hashes, parameters from settings (provisional production values chosen in PH2, benchmarked in PH5), process-wide hashing semaphore (default 4) that sheds overflow with `503 BUSY`, rejection of passwords over 128 characters before any hashing, common-password list loader (local file), policy check 10-128 characters counted as characters with no truncation. Also provides the synthetic account manifest (usernames and roles for Admin, Seller A/B, Rider A/B, inactive user, must-change Rider; no passwords) consumed by Zikri's loader | `$argon2id$` prefix; boundary, common-password and capacity cases | TC04 | T01, T02 |
| M1-PH1-T11 | CI skeleton (GitHub Actions, third-party actions pinned by commit SHA): jobs `backend-lint-type` (ruff, mypy), `backend-unit`, `backend-migrations` (PostgreSQL service, bootstrap + upgrade head), `frontend-check` (tsc, eslint with security plugin, vitest, build), `compose-smoke`, `secret-scan` (gitleaks over tree and history), `dependency-audit` (pip-audit, npm audit; report-only until PH4). Later jobs (`backend-integration`, `authz-matrix`, `e2e-core`, `ci-contract`) are added in the phases listed in the [CI job list](../../../shared/testing-strategy.md#ci-and-release-gates). Qee wires the harness into `backend-integration` as soon as H10 exists. Add `.github/CODEOWNERS` mapping module directories to owners and shared directories to all three | First PR run green; negative control (planted canary secret on a throwaway branch, including one only in history) fails `secret-scan` | TC12 | T01 |
| M1-PH1-T12 | Review and merge contract v3 amendments covering M1 parts: error-code registry, security headers and CSP rules, trusted-proxy client-IP rule, maintenance-mode middleware rule, `lock_active_actor`, migration order | All three owners approve in the PR; conflicts recorded in the [decision register](../../../shared/decision-register.md) | review PR | none |
| M1-PH1-T13 | External checks (no code), started on the first day because of lead time: confirm and record status of EXT-01 allocation submission, EXT-02 written lecturer acceptance of FastAPI/PostgreSQL together with the Week 14 date (EXT-08), EXT-03 branch protection, EXT-04 AWS access and budget decision, EXT-05 identities for the allocation sheet. Write results into the [decision register](../../../shared/decision-register.md). Do not mark any as done without receipt | Register rows updated with date and evidence reference or "unverified" | register diff | none |

## 5 Affected components

- Backend: `core/settings.py`, `core/errors.py`, `core/logging.py`, `core/principal.py`, `core/security_deps.py` (interfaces), `modules/auth/password.py`, `modules/auth/models.py`, `main.py` app factory.
- Database: migration `0002_auth_core`; function `lock_active_actor`; table `system_state`.
- Frontend: `shared/api/client.ts`, `app/SessionProvider.tsx`, `app/RouteGuard.tsx`, generated `shared/api/types.ts`.
- Infra/config: `infra/compose.dev.yml`, `.env.example`, `infra/VERSIONS.md`, `.github/workflows/ci.yml`, `.github/CODEOWNERS`.

## 6 Security requirements

- P4: no secrets or usable passwords in source, `.env.example` or CI logs; generic errors; fixtures use synthetic data.
- P2: password policy encoded once in the password service.
- Fail-closed configuration (test principal cannot reach production).
- Hardened SECURITY DEFINER function pattern applied to the first function (RLS-09 preparation).
- Redaction and no-store defaults on from the first endpoint.
- Account lock ordering rule recorded before any other module takes locks.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH1-TC01 | Unit (UT-A04) | Validation error with `password` field; unhandled exception raised inside a handler | 422 envelope with `fieldErrors`, `requestId`; password value absent; 500 body generic, no stack, trace only in log | S-04 |
| M1-PH1-TC02 | Unit (UT-A04) | Log a dict, an exception and headers containing canary password, token, cookie, address | Output contains redaction markers; canaries absent | S-05, P4 |
| M1-PH1-TC03 | Unit | Settings with production + test flag; production + `FAILPOINT_*` variable; production + missing `FINGERPRINT_KEY`; `.env.example` scan | Startup refuses without printing values; every example value is empty or `change-me-*` | S-03 |
| M1-PH1-TC04 | Unit (UT-A01) | Passwords of 9, 10, 128, 129 characters and a 1 MB body; common password; Unicode 10 characters; verify wrong/right; unknown-user dummy path (same parameters as a real hash); 100 concurrent hashes | 9 and 129+ rejected before hashing, 10 and 128 accepted; common rejected; `$argon2id$` prefix; dummy path invokes the hasher; semaphore caps concurrency and sheds overflow with `BUSY` | M1-02, M1-03 |
| M1-PH1-TC05 | Migration (MIG-01) | Apply bootstrap, 0001, 0002 on empty database as migration role; insert `Admin` username, role `ROOT`, duplicate username, bad audit event type | Tables exist; each bad insert rejected by constraint; `audit_event` has no foreign key to `parcel` | M1-F01, REV-07 |
| M1-PH1-TC06 | Integration (IT-A03, RLS-09 prep) | On a privileged test connection run `SET ROLE domain_writer` and call `lock_active_actor` for active, inactive, wrong-version, wrong-role and must-change users in both lock modes; confirm `app_runtime`, `tracking_runtime` and PUBLIC cannot execute it; hostile `pg_temp` shadow table; second connection updating the same user | Defined `PT` error for each bad case; non-executable by the other roles; shadow ignored; `FOR UPDATE` mode blocks the second connection until the first transaction ends | RLS-09 |
| M1-PH1-TC07 | Contract (CT-02) | Build production app; send request with spoof headers `X-Test-User`/cookie; inspect override registry; build test app | Production: 401 and empty registry; override works only in test factory | M1-F02 |
| M1-PH1-TC08 | Component (CMP-A01) | API client with mocked transport: POST; 401; network error; 422 | CSRF header on unsafe methods; 401 clears query cache and emits identity-cleared; normalized error object; no automatic retry of POST | S-01, S-08 |
| M1-PH1-TC09 | Component (CMP-A01) | Session provider: `/auth/me` 200, 401, must-change flag | States loading, authenticated, anonymous; guard redirects wrong role; must-change forced to `/account/password` | M1-F02 |
| M1-PH1-TC10 | Contract (CT-01) | Add field to a DTO without regenerating types | Drift check fails in CI | contract |
| M1-PH1-TC11 | Operations (OPS-01) | Clean checkout, `docker compose up --build`; probe health; scan published ports; inspect `docker compose config` | Health 200; 5432 not reachable from non-loopback; no real secret values | G1.1 |
| M1-PH1-TC12 | CI | First PR run; throwaway branch with planted canary (working tree) and another with a canary only in an earlier commit | All jobs green; both canary branches fail secret scan | G1.6 |
| M1-PH1-TC13 | Unit | Request `/api/v1/...` success and error; request static asset | API responses have `Cache-Control: no-store`; static asset not forced | S-08 |
| M1-PH1-TC14 | Integration (RLS-01, RLS-06 prep) | As `app_runtime`: `SELECT password_hash FROM app_user`; `UPDATE app_user SET role='ADMIN'`; `INSERT INTO app_user`; `UPDATE` and `DELETE` on `audit_event`; call `get_login_snapshot` | First four denied by privileges (and the trigger for audit); the snapshot function returns the hash and versions for the auth repository only | RLS-01, RLS-06 |
| M1-PH1-TC15 | Integration | Responses from API routes and the HTML shell | `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, report-only CSP with the contract policy; Host not in the allow-list rejected; HSTS absent outside production | S-02, S-08 |

## 8 Deliverables and handoffs

H01 (skeleton/Compose, to all), H03 (migration 0002 and `lock_active_actor`, to Zikri and Qee), H04 (auth interface and TMP-01, to all), H05 (error/log/no-store conventions, to all), H06 (frontend client, to all), H14 (password service, to fixture loader). Each handoff is accepted by the consumer commenting on the merged PR after running a smoke import/call (see [dependency matrix](../../../shared/dependency-matrix.md)).

## 9 Exit criteria

- T01-T11 merged; T12 approved; T13 recorded. CP subset: T01, T02, T03, T04, T05, T06, T07, T08, T09, T10.
- TC01-TC15 pass in CI (TC11 locally and in `compose-smoke`).
- Zikri and Qee confirm they can import `Principal`, `require_role`, error codes, API client and apply migration 0002.
- Contributes to G1 items 1, 2, 3, 6.

## 10 Integration checkpoint

Run: bootstrap roles (Zikri), migrate 0001-0002, start stack, call a trivial authenticated test endpoint under the test factory with TMP-01 and confirm production factory rejects the same call. Zikri's `unit_of_work` and Qee's harness both run against the same database.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| 0002 blocked by role bootstrap | Develop against a throwaway superuser database for SQL drafting only; do not merge until H02; never keep superuser credentials in Compose defaults |
| Migration conflicts with 0001/0003 heads | Single-head rule; Zikri resolves ordering per Alembic conventions; renumber unmerged revisions only |
| Argon2 parameters too heavy in dev containers | Configurable parameters; production values chosen in M1-PH5-T05 by benchmark; tests that need speed use low parameters only through a test-only setting refused in production |
| Checkpoint time pressure | Complete CP subset first; mark non-CP tasks planned and disclose |

## 12 Deferred work

Real login/session behavior (PH2); registration, password change, admin screens (PH3); incident commands and race suites (PH4); production proxy and secrets (PH5).
