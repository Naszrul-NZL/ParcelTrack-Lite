# M2 PH1: Foundation and shared contracts

Owner: Zikri (Zikri809). Phase PH1 of [phase framework](../../../shared/phase-framework.md). Status: In progress locally, 22 October 2026; foundation code/tests exist, remaining cases and review/CI pending. See [actual evidence](../../../phase-1-progress.md). `(CP)` marks work required for the 22 October checkpoint. T01 and T02 are the first items on the critical path for the whole group because Naszrul's migration 0002 and Syauqi's function drafts depend on them.

## 1 Objective

The group has one database model that cannot be bypassed accidentally: idempotent role bootstrap, one ordered node-pg-migrate history with a hardened-function template and an automated lint, a transaction-scoped RLS context helper, shared constants with parity tests, the parcel/history schema (migration 0003), synthetic fixtures with a safe loader, and DTO models for parcels and public tracking.

## 2 Entry criteria

- Reviewed plans merged; contract v3 amendments proposed.
- Repository skeleton from M1-PH1-T01 available (or created by Naszrul in parallel; Zikri's work in `infra/db/`, `db/migrations/`, `src/server/core/db.ts`).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Repo skeleton and Compose with PostgreSQL | Naszrul M1-PH1-T01, T03 | H01 | Run bootstrap against a throwaway local PostgreSQL container |
| Migration 0002 (`app_user`, `audit_event`) before 0003 can merge | Naszrul M1-PH1-T06 | H03 | Draft 0003 on a branch; merge after 0002 |
| Vitest harness for role-asserting tests | Syauqi M3-PH1-T01 | H10 | Minimal local fixtures; move to harness before G1 |
| Password service to hash seeded fixture passwords | Naszrul M1-PH1-T10 | H14 | Loader accepts precomputed hashes in test config until delivered (never committed) |

Independent now: T01, T02, T04, T08 (no other deliverable needed).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH1-T01 (CP) | Idempotent application-role bootstrap inside initialized full Supabase PostgreSQL: app schema owner, runtime/tracking/maintenance/ops/backup roles and non-login function owners; generate private passwords. Preserve vendor database roles, auth/storage schemas and service ownership. Exclude app from public Data API/GraphQL schemas and Realtime; revoke anon/authenticated/service_role app-schema access. Existing data/credentials must survive rerun | Verify catalog and direct Supabase gateway denial; runtime has no owner/bypass membership | TC01, TC02 | H01 |
| M2-PH1-T02 (CP) | node-pg-migrate conventions and migration `0001_bootstrap_schema`: single linear history, descriptive revision names, rule "never edit an applied revision", head-merge protocol owned by Zikri, merge order 0001 bootstrap, 0002 auth_core (Naszrul), 0003 parcels (Zikri), 0005 delivery functions and 0006 delivery proof (Syauqi). 0001: application schema, revoke default `PUBLIC` privileges, default privileges for owners. Hardened-function template (`SECURITY DEFINER`, owner role, `SET search_path = pg_catalog, app, pg_temp` equivalent, schema-qualified references, `REVOKE ALL ... FROM PUBLIC`, selective `GRANT EXECUTE`, all in the migration transaction) and `LINT-01` static check that fails CI for any `SECURITY DEFINER` function missing those properties; the template also reminds authors that a function owner is subject to RLS and needs an explicit owner-role policy (see the contract) | Lint negative controls fail; template passes; applies after bootstrap | TC03, TC06 | T01 |
| M2-PH1-T03 (CP) | src/server/core/db.ts: pg pools per runtime role with bounded max/connection timeout and no unbounded overflow. An async unit_of_work callback checks out one client, BEGINs, sets transaction-local app.user_id/session_version with parameters, takes shared backup lock before row locks for writes, executes all statements on that client, COMMITs before success, ROLLBACKs on error and releases in finally. Tracking uses a separate pool; private jobs use separate credentials. Assert actual connected role | Commit/rollback/pooled reuse and client release tests; no context leakage or queries through pool.query inside the transaction | TC04 | H01 |
| M2-PH1-T04 (CP) | One browser-safe src/shared/constants.ts exports role/status literal values, transition table, format/size limits and strict Zod schemas; infer TypeScript types. CT-01 compares these values with DB CHECK constraints and contract; no separate Python/TypeScript mirror | Changing any schema/DB/contract enum without matching updates fails CI | TC05 | M1-PH1-T01 |
| M2-PH1-T05 (CP) | Migration `0003_parcels`, complete and merged after 0002: `parcel`, `parcel_status_history`, constraints (status set, `weight_kg` 0.001-100.000, `unique(seller_id, client_request_id)`, unique `tracking_number`, version >= 1), indexes from the contract, foreign keys without cascading deletes, `audit_event.parcel_id` foreign key, RLS enabled and forced, plain `STABLE` SQL helper `app.current_principal_role()` over the column-limited `app_user` SELECT, runtime-role policies (Seller own / Rider assigned / Admin all; identity read as `NULLIF(current_setting('app.user_id', true), '')::bigint`; helper called as a scalar sub-select) and **owner-role policies** (`domain_writer` `FOR ALL` with `USING (true) WITH CHECK (true)`; `lookup_fn_owner` SELECT only; `maintenance_fn_owner` SELECT and column-limited UPDATE), column-limited grants (including `id` for ordering), runtime has `SELECT` only on parcel/history; owner is `migration_owner`; never edited after merge | Applies on empty DB after 0002; runtime cannot INSERT/UPDATE/DELETE; `domain_writer` can; empty identity yields zero rows | TC06, TC11, TC12 | H03 |
| M2-PH1-T06 (CP) | Fixture loader and dataset specification (`app.cli load-fixtures --profile`): idempotent; non-production only; seeds by `SET ROLE domain_writer` through the `fixture_provisioner` membership so the same policies apply and no production migration mentions the provisioner; refuses `APP_ENV=production` and non-test database names; passwords from environment, hashed via the shared password service; the users profile is built from Naszrul's synthetic account manifest (M1-PH1-T10, no dependency on 0003), parcel profiles (REGISTERED parcels for Seller A and B) need 0003; later profiles in PH2 and PH3; synthetic names, `+60` phone numbers in reserved test ranges, fake addresses; the harness builds one migrated and seeded template database that tests clone per test | Run twice: identical counts and unchanged hashes; clone works | TC07 | H14, T05 |
| M2-PH1-T07 (CP) | Shared strict Zod DTO/request schemas: ParcelSummary, ParcelDetail and PublicTrackingResponse with exact field allowlists, camelCase, string IDs and decimal-string weight. Generate an OpenAPI snapshot from these schemas plus the explicit Route Handler registry; inferred TypeScript types need no second generated model set | Extra sensitive fields rejected; HTTP outputs conform to schemas; OpenAPI/route drift fails CI | TC08 | M1-PH1-T04 |
| M2-PH1-T08 (CP) | Validators and token generator: tracking token `PTL-` + 32 uppercase hex from `node:crypto randomBytes(16)`; input normalization (trim, uppercase, format check) for lookups; recipient field validation (trim, Unicode kept, lengths 1-120/1-500); phone normalization (Malaysian numbers starting with 0 become `+60...`, other numbers must start with `+`; spaces, hyphens and parentheses ignored); weight parsing to `Decimal` with three places, rejecting non-finite values and exponent forms | Boundary table passes | TC09, TC10 | T04 |
| M2-PH1-T09 | Review and merge the contract v3 amendments for M2: migration order, `audit_event.parcel_id` FK location, keyed idempotency fingerprint (HMAC with `FINGERPRINT_KEY`), search fields, trusted time for maintenance functions only, tracking token normalization, error codes | All three owners approve; open points recorded in the [decision register](../../../shared/decision-register.md) | review PR | none |

## 5 Affected components

`src/server/core/db.ts`, `src/shared/{constants,schemas}.ts`, `src/server/modules/parcels/`, `db/migrations/`, private app-role bootstrap and fixture scripts, `infra/supabase/` exposure settings, CT-01/LINT-01 and API snapshot checks. Application migrations do not replace vendor Supabase migrations.

## 6 Security requirements

Runtime roles cannot bypass RLS or own objects; every privileged function follows the hardening template from the first function; identity context is transaction-local and parameterized; tracking tokens come from a cryptographic generator; fixtures use synthetic data and refuse production; DTO allowlists prevent accidental disclosure. Policies P1, P3, P4.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH1-TC01 | Integration (RLS-01) | Bootstrap on empty cluster (production mode and test mode); inspect `pg_roles`, memberships, schema `CREATE` privilege, `backup_operator` attributes, provisioner membership; missing password variable | Runtime roles lack superuser/bypass/create/ownership/owner membership; only `backup_operator` has BYPASSRLS; provisioner membership exists only in test mode; attributes as specified; missing secret aborts | RLS-01, REV-07 |
| M2-PH1-TC02 | Migration (MIG-02) | Rerun bootstrap and `npm run db:migrate -- --to head` twice on existing volume; compare password hashes and grant snapshot | No change, no error | REV-06, REV-07 |
| M2-PH1-TC03 | Lint (LINT-01) | Fixture migrations: definer function without `search_path`, without `REVOKE ... FROM PUBLIC`, owned by superuser, with dynamic SQL from arguments; template version | Four negatives fail the lint; template passes | RLS-09 prep |
| M2-PH1-TC04 | Integration (RLS-05 skeleton) | Pool size 1: Seller A transaction commit, rollback, then anonymous transaction; inspect `current_setting('app.user_id', true)`; static scan of context SQL | Empty identity after each transaction end; only bind parameters used | RLS-05 |
| M2-PH1-TC05 | Contract (CT-01) | Compare shared TypeScript constants, TS constants, DB CHECK constraints | Equal sets; adding a status in one place fails | contract |
| M2-PH1-TC06 | Migration (MIG-01) | Apply 0001-0003 on empty DB, then run `SET ROLE` as each owner role to read and write through the owner-role policies; try insert weight 0, status `SHIPPED`, duplicate token, duplicate (seller, request id); check RLS flags, owners, runtime privileges | Constraints reject; RLS enabled and forced; owner `migration_owner`; runtime SELECT only; `audit_event` FK present | M2-F01, RLS-01 |
| M2-PH1-TC07 | Fixture (FIX-01) | Loader twice; with `APP_ENV=production`; against database named like production | Idempotent, hashes unchanged; refuses; no password in repository scan | S-03, P4 |
| M2-PH1-TC08 | Unit (UT-P04) | Serialize DTOs; send extra fields; compare OpenAPI to snapshot | Exact public field set; strict Zod validation returns 422; camelCase, string IDs, decimal-string weight | M2-06, M2-09 |
| M2-PH1-TC09 | Unit (UT-P02) | Token generator with injected cryptographic random-byte source; format and normalization cases (`ptl-` lower case, whitespace, 31 characters, non-hex) | Uses `randomBytes(16)`; correct format; normalization/rejection as specified | M2-05 |
| M2-PH1-TC10 | Unit (UT-P01) | Phone `+60123456789`, `012-345 6789` (normalized to `+60123456789`), `+0123`, `60123456789` (no plus, no leading zero), 16 digits; weight `0`, `0.001`, `100`, `100.001`, `1.0001`, `-1`, `NaN`, `1e2`; names 0, 1, 120, 121 characters; address 500/501 | Valid accepted and normalized; others 422 with field names | M2-03 |
| M2-PH1-TC11 | Integration (RLS-04, RLS-05) | Pool of one: set identity, commit, then query `parcel` with the setting now reading as the empty string; query with no setting ever set; garbage value | Zero rows with no error in each case (the empty string is treated as no identity) | RLS-04, RLS-05 |
| M2-PH1-TC12 | Integration | As `domain_writer` insert a parcel and history row and read them back with `RETURNING`; as `lookup_fn_owner` select an unlisted column; as `maintenance_fn_owner` update a non-listed column | Writes and returning pass under the owner policies; unlisted columns denied | RLS-06, RLS-09 |

## 8 Deliverables and handoffs

H02 (roles, node-pg-migrate conventions, template, lint) to everyone first; H07 (`unit_of_work`), H08 (constants), H09 (0003), H11 (fixtures), H12 (DTOs) as listed in the [dependency matrix](../../../shared/dependency-matrix.md). Naszrul confirms by creating 0002 on top of 0001; Syauqi by running the harness against bootstrapped roles.

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
| node-pg-migrate head conflicts between owners | Zikri merges heads, owners rebase unmerged revisions only |
| RLS helper recursion or slow policy | Keep policy helper hardened and single-purpose; EXPLAIN in M2-PH4-T08 |
| Superuser credentials leak into Compose | Bootstrap credential only in a local untracked file or prompt; CI uses ephemeral values |

## 12 Deferred work

`create_parcel`, parcel APIs and UI (PH2); replay safety, search, tracking function, retention functions (PH3); full RLS suites and retention job (PH4); production bootstrap (PH5).
