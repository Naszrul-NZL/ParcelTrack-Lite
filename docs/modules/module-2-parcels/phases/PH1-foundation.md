# M2 PH1: Foundation and shared contracts

Owner: Zikri (Zikri809). Phase PH1 of [phase framework](../../../shared/phase-framework.md). Status: Planned, nothing implemented. `(CP)` marks work required for the 22 October checkpoint. T01 and T02 are the first items on the critical path for the whole group because Naszrul's migration 0002 and Syauqi's function drafts depend on them.

## 1 Objective

The group has one database model that cannot be bypassed accidentally: idempotent role bootstrap, one ordered Alembic history with a hardened-function template and an automated lint, a transaction-scoped RLS context helper, shared constants with parity tests, the parcel/history schema (migration 0003), synthetic fixtures with a safe loader, and DTO models for parcels and public tracking.

## 2 Entry criteria

- Reviewed plans merged; contract v3 amendments proposed.
- Repository skeleton from M1-PH1-T01 available (or created by Naszrul in parallel; Zikri's work in `infra/db/`, `backend/alembic/versions/`, `backend/app/core/db.py`).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Repo skeleton and Compose with PostgreSQL | Naszrul M1-PH1-T01, T03 | H01 | Run bootstrap against a throwaway local PostgreSQL container |
| Migration 0002 (`app_user`, `audit_event`) before 0003 can merge | Naszrul M1-PH1-T06 | H03 | Draft 0003 on a branch; merge after 0002 |
| Pytest harness for role-asserting tests | Syauqi M3-PH1-T01 | H10 | Minimal local fixtures; move to harness before G1 |
| Password service to hash seeded fixture passwords | Naszrul M1-PH1-T10 | H14 | Loader accepts precomputed hashes in test config until delivered (never committed) |

Independent now: T01, T02, T04, T08 (no other deliverable needed).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH1-T01 (CP) | Operator-only role bootstrap (`infra/db/bootstrap_roles`): idempotent; takes a separate bootstrap administrator credential; creates the database and schema `app` owned by `migration_owner`; login roles `migration_owner`, `app_runtime`, `tracking_runtime`, `maintenance_runtime`, `ops_runtime`, operator-only `backup_operator` (`BYPASSRLS`, never mounted in application containers, the one documented exception) and, only when the environment is not production, `fixture_provisioner` as a member of `domain_writer` with `SET`; non-login roles `domain_writer`, `auth_fn_owner`, `lookup_fn_owner`, `maintenance_fn_owner`, `ops_fn_owner` with `USAGE` and `CREATE` on schema `app` (needed to assign function ownership) and `ALTER DEFAULT PRIVILEGES` per owner; PostgreSQL 16+ memberships use `WITH SET TRUE`; passwords from private environment input with no defaults in SQL; runtime roles `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, no membership in owner roles, no `CREATE` on schemas; per-role timeouts from the contract (`app_runtime` statement 10 s, lock 3 s, idle-in-transaction 15 s); on an existing volume verify roles and attributes without resetting passwords | Rerun changes nothing; missing secret fails closed; production mode creates no provisioner membership | TC01, TC02 | H01 (or throwaway DB) |
| M2-PH1-T02 (CP) | Alembic conventions and migration `0001_bootstrap_schema`: single linear history, descriptive revision names, rule "never edit an applied revision", head-merge protocol owned by Zikri, merge order 0001 bootstrap, 0002 auth_core (Naszrul), 0003 parcels (Zikri), 0005 delivery functions and 0006 delivery proof (Syauqi). 0001: application schema, revoke default `PUBLIC` privileges, default privileges for owners. Hardened-function template (`SECURITY DEFINER`, owner role, `SET search_path = pg_catalog, app, pg_temp` equivalent, schema-qualified references, `REVOKE ALL ... FROM PUBLIC`, selective `GRANT EXECUTE`, all in the migration transaction) and `LINT-01` static check that fails CI for any `SECURITY DEFINER` function missing those properties; the template also reminds authors that a function owner is subject to RLS and needs an explicit owner-role policy (see the contract) | Lint negative controls fail; template passes; applies after bootstrap | TC03, TC06 | T01 |
| M2-PH1-T03 (CP) | `core/db.py`: engine and pool per runtime role (explicit `pool_size`, `max_overflow`, `pool_timeout` mapped to `503 BUSY`, sized below `max_connections`); synchronous `unit_of_work(user_id, session_version, write=False)` context manager (takes primitives, not M1's `Principal` type) that opens one transaction, sets `app.user_id` and `app.session_version` with parameterized transaction-local `set_config`, takes `pg_advisory_xact_lock_shared(BACKUP_KEY)` first when `write=True`, yields the connection/session, commits before returning success and rolls back on error; `expire_on_commit=False`; no lazy loading after commit; public variant without identity for `tracking_runtime`; maintenance and ops variants; assertion helper `assert_connected_role(expected)`; failure-audit and limiter writes are made by the caller after the main transaction has closed | Pooled reuse test shows no identity leak across commit and rollback; SQL for context uses bind parameters only; advisory-lock mode proven | TC04 | H01 |
| M2-PH1-T04 (CP) | `core/constants.py`: `Role`, `ParcelStatus`, legal transition table, validator regexes (username, phone, tracking token), limits; TypeScript mirror in `frontend/src/shared/constants.ts`; CT-01 parity test comparing Python enums, TS constants, database CHECK constraints (by introspection once migrations exist) and the contract status table | Mismatch in any one place fails CI | TC05 | M1-PH1-T01 |
| M2-PH1-T05 (CP) | Migration `0003_parcels`, complete and merged after 0002: `parcel`, `parcel_status_history`, constraints (status set, `weight_kg` 0.001-100.000, `unique(seller_id, client_request_id)`, unique `tracking_number`, version >= 1), indexes from the contract, foreign keys without cascading deletes, `audit_event.parcel_id` foreign key, RLS enabled and forced, plain `STABLE` SQL helper `app.current_principal_role()` over the column-limited `app_user` SELECT, runtime-role policies (Seller own / Rider assigned / Admin all; identity read as `NULLIF(current_setting('app.user_id', true), '')::bigint`; helper called as a scalar sub-select) and **owner-role policies** (`domain_writer` `FOR ALL` with `USING (true) WITH CHECK (true)`; `lookup_fn_owner` SELECT only; `maintenance_fn_owner` SELECT and column-limited UPDATE), column-limited grants (including `id` for ordering), runtime has `SELECT` only on parcel/history; owner is `migration_owner`; never edited after merge | Applies on empty DB after 0002; runtime cannot INSERT/UPDATE/DELETE; `domain_writer` can; empty identity yields zero rows | TC06, TC11, TC12 | H03 |
| M2-PH1-T06 (CP) | Fixture loader and dataset specification (`app.cli load-fixtures --profile`): idempotent; non-production only; seeds by `SET ROLE domain_writer` through the `fixture_provisioner` membership so the same policies apply and no production migration mentions the provisioner; refuses `APP_ENV=production` and non-test database names; passwords from environment, hashed via the shared password service; the users profile is built from Naszrul's synthetic account manifest (M1-PH1-T10, no dependency on 0003), parcel profiles (REGISTERED parcels for Seller A and B) need 0003; later profiles in PH2 and PH3; synthetic names, `+60` phone numbers in reserved test ranges, fake addresses; the harness builds one migrated and seeded template database that tests clone per test | Run twice: identical counts and unchanged hashes; clone works | TC07 | H14, T05 |
| M2-PH1-T07 (CP) | Pydantic models: `ParcelSummary`, `ParcelDetail`, `PublicTrackingResponse` (exactly `{history:[{status,changedAt}]}`), request models with `extra=forbid`, camelCase aliases, string IDs, decimal-string weight; OpenAPI snapshot committed and diffed in CI | Allowlist tests; snapshot drift fails CI | TC08 | M1-PH1-T04 |
| M2-PH1-T08 (CP) | Validators and token generator: tracking token `PTL-` + 32 uppercase hex from `secrets.token_bytes(16)`; input normalization (trim, uppercase, format check) for lookups; recipient field validation (trim, Unicode kept, lengths 1-120/1-500); phone normalization (Malaysian numbers starting with 0 become `+60...`, other numbers must start with `+`; spaces, hyphens and parentheses ignored); weight parsing to `Decimal` with three places, rejecting non-finite values and exponent forms | Boundary table passes | TC09, TC10 | T04 |
| M2-PH1-T09 | Review and merge the contract v3 amendments for M2: migration order, `audit_event.parcel_id` FK location, keyed idempotency fingerprint (HMAC with `FINGERPRINT_KEY`), search fields, trusted time for maintenance functions only, tracking token normalization, error codes | All three owners approve; open points recorded in the [decision register](../../../shared/decision-register.md) | review PR | none |

## 5 Affected components

- Database: roles, migrations 0001 and 0003, helper functions; `infra/db/bootstrap_roles.*`.
- Backend: `core/db.py`, `core/constants.py`, `modules/parcels/{schemas.py,validators.py,tokens.py}`, fixture CLI.
- Frontend: `shared/constants.ts`, shared DTO types.
- CI: LINT-01 and CT-01 jobs; OpenAPI snapshot check.

## 6 Security requirements

Runtime roles cannot bypass RLS or own objects; every privileged function follows the hardening template from the first function; identity context is transaction-local and parameterized; tracking tokens come from a cryptographic generator; fixtures use synthetic data and refuse production; DTO allowlists prevent accidental disclosure. Policies P1, P3, P4.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH1-TC01 | Integration (RLS-01) | Bootstrap on empty cluster (production mode and test mode); inspect `pg_roles`, memberships, schema `CREATE` privilege, `backup_operator` attributes, provisioner membership; missing password variable | Runtime roles lack superuser/bypass/create/ownership/owner membership; only `backup_operator` has BYPASSRLS; provisioner membership exists only in test mode; attributes as specified; missing secret aborts | RLS-01, REV-07 |
| M2-PH1-TC02 | Migration (MIG-02) | Rerun bootstrap and `alembic upgrade head` twice on existing volume; compare password hashes and grant snapshot | No change, no error | REV-06, REV-07 |
| M2-PH1-TC03 | Lint (LINT-01) | Fixture migrations: definer function without `search_path`, without `REVOKE ... FROM PUBLIC`, owned by superuser, with dynamic SQL from arguments; template version | Four negatives fail the lint; template passes | RLS-09 prep |
| M2-PH1-TC04 | Integration (RLS-05 skeleton) | Pool size 1: Seller A transaction commit, rollback, then anonymous transaction; inspect `current_setting('app.user_id', true)`; static scan of context SQL | Empty identity after each transaction end; only bind parameters used | RLS-05 |
| M2-PH1-TC05 | Contract (CT-01) | Compare Python enums, TS constants, DB CHECK constraints | Equal sets; adding a status in one place fails | contract |
| M2-PH1-TC06 | Migration (MIG-01) | Apply 0001-0003 on empty DB, then run `SET ROLE` as each owner role to read and write through the owner-role policies; try insert weight 0, status `SHIPPED`, duplicate token, duplicate (seller, request id); check RLS flags, owners, runtime privileges | Constraints reject; RLS enabled and forced; owner `migration_owner`; runtime SELECT only; `audit_event` FK present | M2-F01, RLS-01 |
| M2-PH1-TC07 | Fixture (FIX-01) | Loader twice; with `APP_ENV=production`; against database named like production | Idempotent, hashes unchanged; refuses; no password in repository scan | S-03, P4 |
| M2-PH1-TC08 | Unit (UT-P04) | Serialize DTOs; send extra fields; compare OpenAPI to snapshot | Exact public field set; `extra=forbid` returns 422; camelCase, string IDs, decimal-string weight | M2-06, M2-09 |
| M2-PH1-TC09 | Unit (UT-P02) | Token generator with patched `secrets`; format and normalization cases (`ptl-` lower case, whitespace, 31 characters, non-hex) | Uses `token_bytes(16)`; correct format; normalization/rejection as specified | M2-05 |
| M2-PH1-TC10 | Unit (UT-P01) | Phone `+60123456789`, `012-345 6789` (normalized to `+60123456789`), `+0123`, `60123456789` (no plus, no leading zero), 16 digits; weight `0`, `0.001`, `100`, `100.001`, `1.0001`, `-1`, `NaN`, `1e2`; names 0, 1, 120, 121 characters; address 500/501 | Valid accepted and normalized; others 422 with field names | M2-03 |
| M2-PH1-TC11 | Integration (RLS-04, RLS-05) | Pool of one: set identity, commit, then query `parcel` with the setting now reading as the empty string; query with no setting ever set; garbage value | Zero rows with no error in each case (the empty string is treated as no identity) | RLS-04, RLS-05 |
| M2-PH1-TC12 | Integration | As `domain_writer` insert a parcel and history row and read them back with `RETURNING`; as `lookup_fn_owner` select an unlisted column; as `maintenance_fn_owner` update a non-listed column | Writes and returning pass under the owner policies; unlisted columns denied | RLS-06, RLS-09 |

## 8 Deliverables and handoffs

H02 (roles, Alembic conventions, template, lint) to everyone first; H07 (`unit_of_work`), H08 (constants), H09 (0003), H11 (fixtures), H12 (DTOs) as listed in the [dependency matrix](../../../shared/dependency-matrix.md). Naszrul confirms by creating 0002 on top of 0001; Syauqi by running the harness against bootstrapped roles.

## 9 Exit criteria

- T01-T09 merged; TC01-TC12 pass in CI. CP subset: T01-T08.
- Naszrul and Syauqi have used H02, H03, H07, H08, H11 from their own branches without local forks of the definitions.
- Contributes to G1 items 2, 3, 4, 5.

## 10 Integration checkpoint

On a clean volume run: bootstrap, migrate to 0003, load fixtures, start the backend; call a test-only route that opens `unit_of_work` for Seller A and prove an unfiltered `SELECT` returns only Seller A rows (RLS-02 preview). Syauqi's harness asserts `current_user`.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Bootstrap too slow for the critical path | Ship T01 minimal (roles and attributes) first; add per-role timeouts after |
| Alembic head conflicts between owners | Zikri merges heads, owners rebase unmerged revisions only |
| RLS helper recursion or slow policy | Keep policy helper hardened and single-purpose; EXPLAIN in M2-PH4-T08 |
| Superuser credentials leak into Compose | Bootstrap credential only in a local untracked file or prompt; CI uses ephemeral values |

## 12 Deferred work

`create_parcel`, parcel APIs and UI (PH2); replay safety, search, tracking function, retention functions (PH3); full RLS suites and retention job (PH4); production bootstrap (PH5).
