# M1 PH1: Foundation and shared contracts

Owner: Naszrul (Naszrul-NZL). Phase PH1 of [phase framework](../../../shared/phase-framework.md). Status: In progress locally, 22 October 2026; foundation code/tests exist, remaining cases and review/CI pending. See [actual evidence](../../../phase-1-progress.md). `(CP)` marks work required for the 22 October checkpoint.

## 1 Objective

A clean checkout builds one full-stack Next.js application and starts the full local Supabase Docker stack. All owners share TypeScript schemas, same-origin routes and server services. Naszrul supplies custom username accounts, opaque sessions, CSRF, permissions, Argon2id, safe errors/logging and the shell/session provider. Supabase Auth runs as infrastructure but is not a second app identity source.

## 2 Entry criteria

- Reviewed Next.js/local-Supabase plan and contract; no cloud account needed.
- Existing React checkpoint demo retained as frontend-only evidence; Next.js and Supabase implementation remain to be built.
- One application tree and npm lockfile agreed; preserve the full upstream Supabase Docker setup and vendor schemas.

## 3 Dependencies

| Needs | From | Handoff | Substitute until delivered |
| --- | --- | --- | --- |
| DB roles bootstrap and function-owner roles (`auth_fn_owner`) before `lock_active_actor` can be created | Zikri M2-PH1-T01 | H02 | Draft SQL in a branch; merge only after H02 |
| node-pg-migrate chain, migration 0001, hardened-function template | Zikri M2-PH1-T02 | H02 | Create node-pg-migrate configuration in T01; 0001 content owned by Zikri |
| Role/status constants for CHECK constraints | Zikri M2-PH1-T04 | H08 | Role set (`SELLER`,`RIDER`,`ADMIN`) is fixed by the contract; copy until constants land, then replace |
| Vitest harness (disposable DB, role-asserting connection) | Syauqi M3-PH1-T01 | H10 | Local ad-hoc fixtures for T06/T07 tests; migrate to the harness before G1 |

Independent right now: T01-T05, T10, T11 (no other deliverable needed).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH1-T01 (CP) | Create the one root Next.js App Router/TypeScript project and contract directories: src/app, src/features, src/shared, src/server, db/migrations, scripts, tests and infra/supabase. Keep checkpoint-demo separate. One package.json and npm lockfile; record Node/Next/Supabase upstream commit and pinned image versions in infra/VERSIONS.md. Server modules import server-only; browser-safe code cannot import server code. Configure node-pg-migrate without embedding credentials | Clean build and directory/import-boundary checks; no separate Python API | TC11, TC12 | none |
| M1-PH1-T02 (CP) | Typed server settings validated with Zod: environment, origin, app/tracking DB URLs, Supabase Storage URL/private key/bucket, cookie lifetimes, fingerprint/rate-limit keys, byte/pixel limits and local trusted proxy. Separate application .env.local from private Supabase .env; inert examples only. Reject production test/failpoint flags, missing secrets and dev cookies. Private ops/migration/maintenance credentials are not web settings | Fail-closed matrix; no secret values in errors, public env or browser bundle | TC03, TC07 | none |
| M1-PH1-T03 (CP) | Implement local dev setup from docs/local-development.md: preserve the full official pinned Supabase Docker service set, generate private secrets, bind gateway/Studio and optional DB/pooler ports to loopback, persist DB and Storage volumes, and wait for readiness. Run Next.js locally against that stack. For real source-IP limit checks use the documented trusted loopback proxy/custom Node adapter, with the app listener restricted behind it; direct dev-server mode alone does not prove forwarding trust. Provide documented root scripts for the actual setup; no separate Vite-to-API proxy | Clean checkout starts all intended services; production Next.js build also runs locally; ordinary restart preserves data | TC11 | T01, T02 |
| M1-PH1-T04 (CP) | Shared Route Handler/server error envelope, request ID and redacted logging. Map strict Zod errors to safe 422 field errors and custom SQLSTATE/timeout codes once in src/server/core/errors.ts. Never echo sensitive input. Server Component boundaries show generic errors; internal diagnostics stay protected | Envelope and error registry tests; generic 500; no password or recipient canaries | TC01, TC02 | none |
| M1-PH1-T05 (CP) | Logging: structured JSON logs, redaction filter for keys `password`, `newPassword`, `currentPassword`, `token`, `csrf`, `cookie`, `authorization`, `recipient*`, `phone`, `address`; request bodies never logged; access log excludes query strings; attempted usernames of unknown accounts are never logged or stored (keyed digest and length only), because users sometimes type passwords into the username field; Docker log rotation (`max-size`, `max-file`) configured in Compose | Canary values in a logged dict, exception message, header and a username field never appear in output | TC02 | T01 |
| M1-PH1-T06 (CP) | Migration `0002_auth_core`: tables `app_user`, `auth_session`, `rate_limit_bucket`, `audit_event` (`parcel_id` is a plain nullable bigint; Zikri's 0003 adds the FK) and single-row `system_state(maintenance_mode, set_until)`. Constraints: lowercase username check `^[a-z0-9._-]{3,50}$`, role check from the shared constants, unique username, positive versions, session expiry ordering, bucket unique key, audit event-type CHECK from the contract list. Indexes per contract. **Privileges:** `app_runtime` has no INSERT/UPDATE/DELETE on `app_user` and no SELECT on `password_hash` (column-limited SELECT on the other columns, which also serves the Rider directory); `audit_event` is insert-only (no UPDATE/DELETE privilege plus a rejecting trigger); direct DML on `auth_session` and `rate_limit_bucket` only | Migration applies on bootstrapped empty database via migration role; constraint violations rejected; privilege assertions pass | TC05, TC14 | M2-PH1-T01, T02 (H02), M2-PH1-T04 (H08) |
| M1-PH1-T07 (CP) | In the same revision, hardened functions owned by `auth_fn_owner`: `lock_active_actor(user_id, session_version, allowed_roles, mode)` (locks the `app_user` row `FOR SHARE` for ordering-only checks or `FOR UPDATE` for login, password change and disablement; verifies `is_active`, matching `session_version`, allowed role and optionally not `must_change_password`; returns the role or raises the registered `PT` error) and `get_login_snapshot(username)` (the only path that returns the password hash and versions). `SECURITY DEFINER`, fixed `search_path` with `pg_temp` last, qualified names, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` (`domain_writer` for the lock; `app_runtime` for the snapshot), all in the 0002 transaction. Lock order rule in the function comment: acting account, target account, then parcel | Hardening lint passes; behavior tests | TC06 | M2-PH1-T01, T02 |
| M1-PH1-T08 (CP) | Shared server-only auth interface: PrincipalDTO separate from AuthContext with sessionVersion; require_authenticated, require_role and principal_uow call shared services directly. Test-only dependency injection (TMP-01) exists only in tests and cannot be activated by headers/cookies/flags in production. Check every Route Handler and any Server Component service entry; layouts alone do not authorize | Production build rejects test principal; browser serialization exposes only PrincipalDTO | TC07 | H02, H03 |
| M1-PH1-T09 (CP) | One browser-safe same-origin API client and session provider for Client Components; shared Zod schemas supply inferred TypeScript request/response types. CSRF headers on mutations; no automatic unsafe retries; identity changes clear private state. Server Components use authorized server services directly without loopback HTTP. Test mocks (TMP-03) stay outside production bundles | Client/component tests and schema/route conformance; no duplicate frontend/backend model sets | TC08, TC09, TC10 | T04 |
| M1-PH1-T10 (CP) | Password service on a maintained Argon2id library: hash, verify, `needs_rehash`, constant-work dummy verify for unknown users using the same parameters as real hashes, parameters from settings (provisional production values chosen in PH2, benchmarked in PH5), process-wide hashing semaphore (default 4) that sheds overflow with `503 BUSY`, rejection of passwords over 128 characters before any hashing, common-password list loader (local file), policy check 10-128 characters counted as characters with no truncation. Also provides the synthetic account manifest (usernames and roles for Admin, Seller A/B, Rider A/B, inactive user, must-change Rider; no passwords) consumed by Zikri's loader | `$argon2id$` prefix; boundary, common-password and capacity cases | TC04 | T01, T02 |
| M1-PH1-T11 | CI skeleton with pinned GitHub Actions: server-lint-type (TypeScript/ESLint), server-unit (Vitest), db-migrations (full disposable Supabase, app bootstrap/migrations), app-check (component/build), local-stack-smoke, secret-scan and dependency-audit (npm audit; report-only until PH4). Add server-integration, authz-matrix, e2e-core and ci-contract per the testing strategy. CODEOWNERS maps UI and server module folders plus module migrations to their owners | Green initial CI and planted-secret negative controls in tree/history; no migration secret in app build | TC12 | T01 |
| M1-PH1-T12 | Review and merge contract v3 amendments covering M1 parts: error-code registry, security headers and CSP rules, trusted-proxy client-IP rule, maintenance-mode middleware rule, `lock_active_actor`, migration order | All three owners approve in the PR; conflicts recorded in the [decision register](../../../shared/decision-register.md) | review PR | none |
| M1-PH1-T13 | Record EXT-01 allocation receipt, EXT-02 lecturer acceptance of Next.js/PostgreSQL and later deployment topology, EXT-03 branch protection, EXT-04 cloud deferred until local acceptance, EXT-05 identities and EXT-08 Week 14 date. Documentation changes are authorized; do not claim external approvals or require a cloud account for local work | Decision register has dated evidence or unverified/deferred status | register diff | none |

## 5 Affected components

`src/app/`, `src/server/core/`, `src/server/modules/auth/`, `src/features/auth/`, `src/shared/`, `db/migrations/0002_auth_core`, `scripts/`, `infra/supabase/`, `.env.example`, `infra/VERSIONS.md`, CI/CODEOWNERS. These paths now contain Phase 1 code; later workflows remain planned.

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
| M1-PH1-TC11 | Operations (OPS-01) | Clean checkout: full Supabase services, app bootstrap/migrations, Next.js dev and production build/start; inspect Compose port bindings | All intended services healthy; loopback-only administrative endpoints; no public keys/secrets; restart preserves data | G1.1 |
| M1-PH1-TC12 | CI | First PR run; throwaway branch with planted canary (working tree) and another with a canary only in an earlier commit | All jobs green; both canary branches fail secret scan | G1.6 |
| M1-PH1-TC13 | Unit | Request `/api/v1/...` success and error; request static asset | API responses have `Cache-Control: no-store`; static asset not forced | S-08 |
| M1-PH1-TC14 | Integration (RLS-01, RLS-06 prep) | As `app_runtime`: `SELECT password_hash FROM app_user`; `UPDATE app_user SET role='ADMIN'`; `INSERT INTO app_user`; `UPDATE` and `DELETE` on `audit_event`; call `get_login_snapshot` | First four denied by privileges (and the trigger for audit); the snapshot function returns the hash and versions for the auth repository only | RLS-01, RLS-06 |
| M1-PH1-TC15 | Integration | Responses from API routes and the HTML shell | `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, report-only CSP with the contract policy; Host not in the allow-list rejected; HSTS absent outside production | S-02, S-08 |

## 8 Deliverables and handoffs

H01 (Next.js/full Supabase skeleton, to all), H03 (migration 0002 and `lock_active_actor`, to Zikri and Syauqi), H04 (auth interface and TMP-01, to all), H05 (error/log/no-store conventions, to all), H06 (frontend client, to all), H14 (password service, to fixture loader). Each handoff is accepted by the consumer commenting on the merged PR after running a smoke import/call (see [dependency matrix](../../../shared/dependency-matrix.md)).

## 9 Exit criteria

- T01-T11 merged; T12 approved; T13 recorded. CP subset: T01, T02, T03, T04, T05, T06, T07, T08, T09, T10.
- TC01-TC15 pass in CI (TC11 locally and in `local-stack-smoke`).
- Zikri and Syauqi confirm they can import `Principal`, `require_role`, error codes, API client and apply migration 0002.
- Contributes to G1 items 1, 2, 3, 6.

## 10 Integration checkpoint

Run: bootstrap roles (Zikri), migrate 0001-0002, start stack, call a trivial authenticated test endpoint under the test factory with TMP-01 and confirm production import graph rejects the same call. Zikri's `unit_of_work` and Syauqi's harness both run against the same database.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| 0002 blocked by role bootstrap | Develop against a throwaway superuser database for SQL drafting only; do not merge until H02; never keep superuser credentials in Compose defaults |
| Migration conflicts with 0001/0003 heads | Single-head rule; Zikri resolves ordering per node-pg-migrate conventions; renumber unmerged revisions only |
| Argon2 parameters too heavy in dev containers | Configurable parameters; production values chosen in M1-PH5-T05 by benchmark; tests that need speed use low parameters only through a test-only setting refused in production |
| Checkpoint time pressure | Complete CP subset first; mark non-CP tasks planned and disclose |

## 12 Deferred work

Real login/session behavior (PH2); registration, password change, admin screens (PH3); incident commands and race suites (PH4); production proxy and secrets (PH5).
