# Shared system contract

Contract version 3 (amendments below proposed in the phased plan set, revised after independent review, and effective once all three owners approve them in M1-PH1-T12, M2-PH1-T09 and M3-PH1-T09). Where the [v3 amendments](#contract-v3-amendments) differ from earlier text, the amendments win until the earlier text is edited in the same PR. Planning baseline for all three module folders. Changing a rule here requires review by every affected owner and updates to tests. Examples and limits are design decisions unless explicitly attributed to the case study. Required unit, integration and browser coverage is defined in the [testing strategy](testing-strategy.md).

## Architecture and code boundaries

Use one FastAPI application, React with TypeScript/Vite, PostgreSQL, SQLAlchemy with psycopg, and Alembic migrations. Use ordinary synchronous database services initially; do not block an async route with unbounded database or image-processing work. Lock compatible dependency versions at implementation time and commit Python/JavaScript lockfiles. Docker images use supported, pinned versions.

```text
backend/app/
  main.py                    shared router composition
  core/                      settings, DB unit of work, safe errors, principal, CSRF, logging
  modules/auth/              Naszrul: accounts, server-side sessions and permissions
  modules/parcels/           Zikri: parcel models, creation, seller reads and tracking
  modules/delivery/          Syauqi: assignment, updates, proof and dashboard
backend/alembic/              one ordered revision history, module-authored migrations
backend/tests/                module tests plus cross-module integration tests
frontend/src/
  app/                       router, shared shell and session provider
  shared/                    API client, types and common form/list controls
  features/auth/             Naszrul
  features/parcels/          Zikri
  features/delivery/         Syauqi
infra/                       Compose, proxy, backups and deployment configuration
docs/modules/                separate implementation plans
```

These are future source paths. Module services call shared Python services/functions directly when needed; do not make HTTP calls back into the same application. Do not duplicate User, Parcel, status enums, session helpers or API clients.

## Identity and permission rules

Application roles are SELLER, RIDER and ADMIN. Public means no authenticated account. Role and account status come from the database, not user-submitted fields. Public account registration can only create SELLER. Initial Admin is created through a one-time deployment command reading its password privately. There is no public Admin creation endpoint or general role-changing endpoint.

| Operation | Seller | Rider | Admin | Public |
| --- | --- | --- | --- | --- |
| Register parcel | Own | Denied | Denied | Denied |
| Read private parcel/detail/history | Own | Assigned | All | Denied |
| Assign/reassign unfinished parcel | Denied | Denied | Allowed | Denied |
| Change delivery status/upload proof | Denied | Assigned | Denied | Denied |
| View dashboard/manage users/audit | Denied | Denied | Allowed | Denied |
| Track status and timestamps | Allowed | Allowed | Allowed | Allowed |
| Read proof photo | Own parcel | Assigned parcel | All | Denied |

Proof reading is a proposed product rule because the brief specifies upload rights but not download rights. An inactive account has no private access. A Rider required to change their initial password may access only session details, password change, CSRF and logout until that change is complete.

### Server-side session and CSRF protocol

M1 supplies one authentication dependency and one role-check helper for all modules. Generate an opaque session token using 32 cryptographically random bytes; store only its SHA-256 digest in the session table. The browser receives a production __Host-ptl_session cookie with Secure, HttpOnly, SameSite=Lax and Path=/, without Domain. Development uses a separately named localhost-only non-Secure cookie when running HTTP; that exception must not reach production. Never store authentication tokens in browser localStorage.

GET /api/v1/auth/csrf creates or resumes a short-lived anonymous/authenticated server session and returns {"csrfToken":"..."}. Use a random synchronizer token stored with the session. React keeps it in memory and sends X-CSRF-Token for POST/PATCH/DELETE, including login, registration and logout. The read-only POST tracking lookup is exempt from the token but keeps the same-origin check (see v3 amendments). Check the header with a constant-time comparison and validate same-origin request metadata. CSRF tokens and session values are never logged. This is an explicit backend responsibility, not automatic FastAPI session behavior.

Successful login revokes the old anonymous/authenticated session and issues a new session token and CSRF token. Respond with Principal plus csrfToken. GET /auth/me returns only Principal; React obtains CSRF through /auth/csrf on reload. Logout revokes the server record and clears the cookie. Password change invalidates all that user's sessions, including the current session, then requires login again. Missing/invalid CSRF is 403 with code CSRF_INVALID; refresh the token and ask the user to resubmit rather than blindly replaying a mutation.

Login verifies a password against a specific hash/session_version snapshot. Before issuing a session, lock and re-read the account; its hash/version must still match that snapshot and it must remain active. Otherwise reject or restart verification, never attach newly read session_version to credentials verified against an obsolete hash. A session last-seen update is UPDATE-only on an existing, still-valid record; it cannot upsert a deleted/revoked session after logout.

An authenticated session records the user's session_version. Every protected request checks active account state and matching version. Disablement, incident lock or password change increments that version; old sessions fail immediately on their next request. Service transactions recheck/lock the acting account and expected session version before sensitive writes so disablement or password changes cannot be ignored by a long-running operation. Lock the acting account, then the target account, then the parcel in every flow to avoid deadlocks (see v3 amendments). Protected parcel locks are acquired by the controlled database functions below, not direct app_runtime SELECT FOR UPDATE.

Initial limits: anonymous session 10 minutes absolute; authenticated session 30 minutes idle and 8 hours absolute. These are configurable design defaults. Persist sessions and rate-limit state in PostgreSQL so backend workers share them. Rate-limit atomic counters must work across processes; no per-process-only dictionary limiter.

## Shared data model

Five business entities remain in the [ERD](../initial-erd.md). Sessions and rate-limit buckets are supporting infrastructure.

| Entity | Required fields and constraints |
| --- | --- |
| app_user | id bigint PK; username normalized lowercase unique; display_name; password_hash Argon2id; role; is_active; must_change_password; session_version; version; created_at |
| parcel | id; tracking_number unique; seller_id FK; assigned_rider_id nullable FK; recipient_name/phone/address nullable only after anonymization; weight_kg numeric(8,3); current_status; version; client_request_id UUID; creation_fingerprint nullable after anonymization; created_at; terminal_at nullable; delivered_at nullable; anonymized_at nullable; unique(seller_id,client_request_id) |
| parcel_status_history | id; parcel_id; changed_by_id; status; changed_at. Append-only through controlled operations; deterministic ordering by changed_at then id |
| delivery_proof | id; parcel_id unique FK; uploaded_by_id; storage_key unique; media_type; size_bytes; uploaded_at. At most one proof per parcel |
| audit_event | id; actor_id nullable; target_user_id nullable; parcel_id nullable; event_type; outcome; occurred_at; request_id; allowlisted details such as old/new Rider IDs. Never arbitrary request bodies |
| auth_session | token_digest PK; user_id nullable; user_session_version nullable; csrf_token; created_at; last_seen_at; expires_at; absolute_expires_at |
| rate_limit_bucket | bucket type, keyed identity/source digest, window identifier, counter and expires_at, with unique bucket key for atomic updates |

Index tracking_number; seller/status/created_at; assigned_rider/status/created_at; history(parcel_id,changed_at,id); audit timestamps; and expiry columns. Use foreign keys, valid-role/status checks, positive-weight checks and no destructive cascading deletion of business history. Accounts are disabled instead of deleted. Do not add unlisted user/parcel fields to public DTOs automatically.

## API conventions

Prefix every endpoint below with /api/v1. JSON uses camelCase; database uses snake_case. Serialize bigint IDs as strings, versions as integers, decimal weight as a string, and timestamps as ISO 8601 UTC. React formats Asia/Kuala_Lumpur time for display. Show labels such as Out for Delivery while sending OUT_FOR_DELIVERY.

Principal = {id, username, displayName, role, mustChangePassword}. Never return password hashes, session digests or account security counters. UserSummary adds isActive and version for Admin lists.

ParcelSummary = {id, trackingNumber, currentStatus, weightKg, createdAt, version}. ParcelDetail adds recipient:{name,phone,address}, assignedRider:{id,displayName,isActive} or null, history:[{status,changedAt}] (for the ADMIN role each item also carries changedBy:{id,displayName}), hasProof, anonymized and terminalAt. After anonymization recipient fields are null. Dashboard responses never contain recipient fields. Proof storage keys and filesystem paths never appear in an API response.

Paginated lists return {items,page,pageSize,total}; page starts at 1, pageSize defaults to 20 and is capped at 100. Sort newest first with id as a stable tie-breaker. Search is literal, length-limited and parameterized; wildcard characters must not broaden a search unexpectedly. Dynamic sorting uses an allowlist.

Errors return {error:{code,message,fieldErrors?},requestId}. Validation errors are 422; unauthenticated 401; wrong role/CSRF 403; absent or inaccessible parcel/proof 404; stale version/transition conflict 409; oversized upload 413; unsupported upload format 415; throttling 429 plus Retry-After. Internal errors are generic 500 with server-side diagnostics. Convert FastAPI validation exceptions to this shape without echoing passwords or complete submitted payloads. API authentication failures return JSON, not HTML redirects.

All authentication, authenticated/private and public-tracking API responses, including sensitive errors and image responses, send Cache-Control: no-store. The proxy must not cache /api responses. No service worker, persistent browser cache or localStorage may retain private payloads/photos. Static fingerprinted React assets may be cached separately; index.html must be revalidated so releases do not retain stale entry points.

### Endpoint ownership

| ID | Owner | Method and path | Access | Input and success contract |
| --- | --- | --- | --- | --- |
| A01 | M1 | GET /auth/csrf | Anyone | {csrfToken}; session bootstrap, Cache-Control: no-store |
| A02 | M1 | POST /auth/register | Public | {username,displayName,password}; 201 Principal for new SELLER; no auto-login |
| A03 | M1 | POST /auth/login | Anyone | {username,password}; 200 Principal plus csrfToken, rotated cookie |
| A04 | M1 | POST /auth/logout | Session | 204; revoke session and clear cookie |
| A05 | M1 | GET /auth/me | Authenticated | 200 Principal |
| A06 | M1 | POST /auth/password | Authenticated | {currentPassword,newPassword}; 204, all sessions revoked |
| A07 | M1 | GET /admin/users | Admin | role/isActive/page filters; paginated UserSummary |
| A08 | M1 | POST /admin/riders | Admin | {username,displayName,initialPassword}; 201 UserSummary; first-login password change required |
| A09 | M1 | PATCH /admin/users/{userId}/status | Admin | {isActive,expectedVersion}; 200 UserSummary; only Seller/Rider targets |
| A10 | M2 | POST /parcels | Seller | {recipientName,recipientPhone,recipientAddress,weightKg,clientRequestId}; 201 ParcelDetail; exact replay 200 |
| A11 | M2 | GET /seller/parcels | Seller | q/status/page filters; paginated own ParcelSummary |
| A12 | M2 | GET /parcels/{parcelId} | Authorized private reader | 200 ParcelDetail; shared detail service used by all roles |
| A13 | M2 | POST /public/tracking | Anyone (no CSRF token; same-origin check and limiter) | {trackingNumber}; 200 {history:[{status,changedAt}]}; unknown valid token 404 |
| A14 | M3 | GET /admin/parcels | Admin | status/riderId/needsReassignment/page; paginated summary plus assignedRider |
| A15 | M3 | PATCH /admin/parcels/{parcelId}/assignment | Admin | {riderId,expectedVersion}; 200 ParcelDetail |
| A16 | M3 | GET /rider/parcels | Rider | status/page filters; paginated assigned ParcelSummary |
| A17 | M3 | POST /rider/parcels/{parcelId}/status | Rider | multipart: status,expectedVersion, optional proof; 200 ParcelDetail |
| A18 | M3 | GET /admin/dashboard | Admin | {counts:{REGISTERED,ASSIGNED,OUT_FOR_DELIVERY,DELIVERED,FAILED},total,generatedAt} |
| A19 | M3 | GET /parcels/{parcelId}/proof | Authorized private reader | Image stream with fixed verified MIME, no-store and nosniff; no public static URL |
| A20 | M1 | GET /admin/audit | Admin | eventType/parcelId/page; paginated safe audit records |
| A21 | M1 | POST /admin/users/{userId}/password-reset | Admin | 200 {temporaryPassword} shown once; Seller/Rider targets only; sets must-change, revokes sessions (SHOULD) |

Public tracking uses POST to avoid putting tracking tokens into URLs/access logs. It remains read-only and, being read-only, needs no CSRF token or anonymous session. The reverse proxy and API must redact request bodies and sensitive query values from routine logs.

### Validation and operational limits

- Username: 3 to 50 lowercase ASCII letters, digits, dot, underscore or hyphen; display name: 1 to 80 Unicode characters. Normalize username once before lookup and uniqueness checks.
- Password: 10 to 128 characters, no silent truncation; reject known common choices with a maintained local list. Use Argon2id via a supported password library; benchmark settings on the deployed instance. Do not write a custom hash algorithm.
- Recipient name: 1 to 120 characters; address: 1 to 500; trim surrounding whitespace. Preserve ordinary Unicode. Phone: stored in normalized international form matching ^\+[1-9][0-9]{7,14}$; Malaysian local numbers beginning with 0 are accepted and normalized to +60 (see v3 amendments). Explain the accepted formats in the form.
- Weight: finite decimal from 0.001 to 100.000 kg, at most three decimal places; reject NaN and infinities before database access. This upper limit is a proposed project rule, not a source requirement.
- Tracking: PTL- followed by 32 uppercase hexadecimal characters generated from 16 cryptographically random bytes. Validate length/format; uniqueness is enforced in PostgreSQL with bounded collision retry.
- Throttle defaults, hashing capacity and request caps are defined in the v3 amendments (login blocking is keyed by username and source together; successes are not counted against a source). They are configurable and tested at the threshold boundaries. Generic login errors and no permanent automatic lockout prevent trivial permanent account denial.
- Proof: one decoded JPG/PNG, maximum 5 MiB input and 20 million pixels. Reject corrupt, unsupported or multi-frame input; reject unsafe/double executable extensions. Re-encode to an allowed format, strip metadata, enforce an output byte limit and generate a random filename. Original names are not retained for serving.
- Set reverse-proxy body cap to 6 MiB for upload overhead plus application streaming cap of 5 MiB per file; use a smaller JSON body limit. Account for multipart part count and filename length too. Do not fully buffer an unlimited request before checking limits.

## Status and assignment rules

| Operation | Current status | Result | Actor and effect |
| --- | --- | --- | --- |
| Register | None | REGISTERED | Seller; create parcel and first history event |
| First assignment | REGISTERED | ASSIGNED | Admin selects active Rider; increment version and append history |
| Reassignment | ASSIGNED or OUT_FOR_DELIVERY | Same status | Admin selects another active Rider; increment version and append assignment audit, not a duplicate status event |
| Start delivery | ASSIGNED | OUT_FOR_DELIVERY | Assigned active Rider; no photo allowed |
| Complete delivery | OUT_FOR_DELIVERY | DELIVERED | Assigned active Rider; one valid proof required; set terminalAt and deliveredAt |
| Fail delivery | OUT_FOR_DELIVERY | FAILED | Assigned active Rider; one valid proof required; set terminalAt, leave deliveredAt null |

DELIVERED and FAILED are terminal. No undo/delete/unassign/retry endpoint is included. Reassigning to the current active Rider with a matching expectedVersion is a no-op with no event/version change. Version mismatch is always 409. Disabling a Rider is immediate and does not modify their parcels; Admin list highlights unfinished parcels assigned to inactive Riders. Reassigning an OUT_FOR_DELIVERY parcel lets the new Rider finish it without resetting its status. Assignment audit records old/new Rider IDs and Admin actor.

Before each mutation, check expectedVersion and authorization under row locks, then atomically update parcel, version, history when status changes, proof metadata when finalizing, and audit. The actor, ownership, tracking token and server timestamps are never accepted as editable client fields. The disabled-user and assignment race tests must demonstrate that actions are ordered consistently; an operation committed before disablement is valid, later operations are denied.

Parcel creation uses clientRequestId unique per Seller and a canonical creation fingerprint. Replaying the same key and same data returns the original parcel; a different payload for that key returns 409. This prevents duplicate registration when a response is lost. After anonymization clears the fingerprint, an old key returns 409 with code REQUEST_EXPIRED rather than recreating recipient data or creating a duplicate. Other mutations use versions and UI reconciliation: after an uncertain network failure, refetch state before another submission. Never silently auto-retry a status upload or assignment.

## RLS and database privileges

Use one normal app_runtime pool for authenticated application services and session/account work, plus a separate tracking_runtime pool for A13. Migration credentials are supplied only to the one-shot migration job. Runtime has no schema ownership, BYPASSRLS, superuser, TRUNCATE, CREATE or owner-role membership.

Enable and force RLS on parcel, parcel_status_history and delivery_proof. Protected reads use the verified principal ID and the session's expected session_version in parameterized transaction-local set_config values. Policies derive the active user's role from app_user, and allow only own/assigned/all rows as appropriate. Missing/empty identity or stale session version denies access. A protected operation begins a SQLAlchemy transaction, sets context, performs all reads/writes on that same connection, converts results to DTOs and commits before returning success. No lazy database access or commit after the success response is sent. Rollback must clear context through transaction-local scope.

For parcel-domain writes, app_runtime has no direct INSERT/UPDATE/DELETE. It can execute specific functions for create_parcel (M2), assign_parcel and update_delivery_status (M3). These functions use a non-login domain_writer role, which is not a table owner or RLS bypass role. They repeat actor/field/transition checks, apply the expected version and create history/audit atomically. Do not give the runtime permission to SET ROLE to function-owner roles. Domain functions permit initial history/proof/audit inserts but never arbitrary history edits. M1 account writes are auth_fn_owner functions and session/limiter tables keep narrow direct privileges (see v3 amendments, protection of the account tables); account data is not exposed as a public database API.

For final-photo publication, M3 also exposes lock_delivery_target(parcel_id,expected_version), a narrow SECURITY DEFINER function owned by domain_writer. It locks/rechecks the active Rider account/session version before the parcel, verifies current assignment, OUT_FOR_DELIVERY state and expected version, and returns only the authorized target identifier/state. The lock remains held in the caller's existing transaction while the prepared file is published and update_delivery_status commits metadata/history. The latter repeats its checks. Only the function owner has the DML privilege needed to acquire parcel row locks; do not grant app_runtime general UPDATE merely to use SELECT FOR UPDATE.

Every SECURITY DEFINER function, including domain writes/locking, public lookup, privileged auth operations and maintenance, follows the same hardening rule: non-login/non-bypass narrowly privileged owner; fixed trusted search_path with pg_temp last; fully qualified table/function references; no untrusted dynamic SQL; and creation plus REVOKE EXECUTE FROM PUBLIC plus selective grants in one migration transaction. Runtime roles have no CREATE privilege on trusted schemas and no owner-role membership. Test function catalog properties and temporary-object shadowing, not only normal calls.

tracking_runtime may execute only lookup_tracking(token), with no direct protected-table access. Its non-login function owner has only the necessary column SELECT grants and explicit read policies for token lookup. The function returns status and timestamp only, uses exact token matching, fixes a safe search_path, qualifies references, and revokes default PUBLIC execution. The function owner has no superuser/BYPASSRLS privileges. This is a deliberate restricted read boundary and must be reviewed/tested separately.

Custom transaction settings are backend context, not unforgeable identity: SQL injection or stolen runtime credentials can undermine that trust. Continue parameterized queries, secret protection, application authorization and response allowlists. RLS also does not enforce column permissions by itself; controlled write functions establish that boundary. See [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [safe function definition](https://www.postgresql.org/docs/current/sql-createfunction.html) and [SQLAlchemy transaction management](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html).

## Proof consistency and retention

Files and PostgreSQL do not share one atomic transaction. Syauqi implements this compensating workflow: validate into private staging; begin the database transaction and call lock_delivery_target through app_runtime; under that controlled lock, move the immutable generated file into durable final storage; call update_delivery_status to insert metadata/history and commit. Delete the new file only after a rollback/non-commit is confirmed. If commit acknowledgment is lost, retain the file and reconcile via a fresh connection before cleanup; an exception alone does not prove rollback. Never delete committed proof because sending the response failed. A crash may leave an unreferenced file, so clean files older than 24 hours only after checking they are not referenced and not in an active upload. Metadata is committed only after a durable file exists. Storage failures leave the parcel's previous state intact.

Unknown-commit and orphan reconciliation use a narrowly granted maintenance helper to acquire the same parcel row lock as finalization, wait for the original transaction to resolve, then check committed storage-key references in a subsequent fresh READ COMMITTED statement while holding that lock. Only a settled unreferenced key may be deleted. Lock timeout, missing recovery context or database unavailability means preserve and retry later; seeing no row before the original transaction completes is insufficient. Function owners receive only the maintenance RLS policies/grants needed for this operation, not superuser/BYPASSRLS. Generated file keys are immutable and never reused for a new submission.

P3 requires recipient deletion/anonymization 12 months after delivery. The implementation baseline also applies 12 months after terminalAt for FAILED parcels; this extension is a design choice. A daily private maintenance command selects eligible parcels, first denies proof retrieval and clears recipient fields/creation fingerprint while marking anonymizedAt within a database transaction, then removes files with retryable cleanup. Clear proof metadata after successful file removal. Interrupted cleanup stays deny-listed and is retried; it must never make the photo accessible again. Keep non-identifying history/counts. Maintenance has a separate execute-only credential for reviewed cleanup functions, not the migration role and not a public endpoint.

## Frontend integration

One session provider boots A01 and A05, exposes Principal and CSRF state, and clears all private cached queries on logout, 401, account change or password change. The API client uses same-origin credentials, sets CSRF headers and normalizes errors. In local development Vite proxies /api to FastAPI; cloud serves both through one HTTPS origin. No permissive credentialed CORS is needed.

M1 owns /login, /register, /account/password and /admin/users. M2 owns /seller/parcels, /seller/parcels/new, /parcels/:id and /track. M3 owns /admin/parcels, /admin/dashboard and /rider/parcels; its proof viewer and Rider update panel are used inside M2's shared private detail page. The shared shell links to the correct role landing page. Must-change-password overrides all other private navigation.

Every screen handles loading, empty data, validation, forbidden/expired session and server/network failures. Lists paginate. Disable duplicate submissions; preserve non-sensitive drafts after errors; clear password fields. React displays user text normally and does not render recipient data through raw HTML. Rider screens must work at phone widths with keyboard-accessible controls and visible focus. These are implementation requirements, not a prescribed visual theme.

## Contract v3 amendments

These close gaps found while turning the plans into phases and by the independent reviews ([review resolutions](../review-resolutions.md), REV-14 onwards). Decision classes are in the [decision register](decision-register.md). Where an amendment conflicts with earlier text in this file, the amendment wins and the earlier text is corrected in the same PR.

### Migration order and database roles

Revision order is fixed and equals dependency order; a revision is "applied" once merged to `main` and is never edited afterwards (fix forward with a new revision). Dependency details are in the [dependency matrix](dependency-matrix.md#migration-and-layer-order).

| Revision | Owner | Content |
| --- | --- | --- |
| `0001_bootstrap_schema` | Zikri | Schema `app`, revoke default PUBLIC privileges, default privileges per creating role, hardening template |
| `0002_auth_core` | Naszrul | `app_user`, `auth_session`, `rate_limit_bucket`, `audit_event` (plain `parcel_id`), `system_state`, foundation functions `lock_active_actor` and `get_login_snapshot` |
| `0003_parcels` | Zikri | `parcel`, `parcel_status_history`, constraints, indexes, RLS enable and force, **all** policies (runtime-role and owner-role), grants, policy helper, `audit_event.parcel_id` foreign key |
| `0004_create_parcel` | Zikri | `create_parcel` |
| `0005_delivery_functions` | Syauqi | `update_delivery_status`, start-delivery branch only |
| `0006_delivery_proof` | Syauqi | `delivery_proof`, its policies and grants |
| `0007_delivery_final` | Syauqi | `assign_parcel`, `lock_delivery_target`, final-outcome branch, reconcile helper |
| later, named | owner of the function | `tracking_lookup`, `retention_functions` (Zikri); `proof_maintenance_functions` (Syauqi); `account_functions` (`register_account`, `change_password`, `set_user_active`), `session_cleanup_functions`, `ops_functions` (Naszrul) |

Roles. Login roles: `migration_owner` (owns the database and schema `app`), `app_runtime`, `tracking_runtime`, `maintenance_runtime`, `ops_runtime`, `backup_operator` (operator-only, never present in application containers, `BYPASSRLS` so a logical dump is complete; the single documented exception, listed in the grants snapshot) and, outside production only, `fixture_provisioner` (member of `domain_writer` with `SET` so seeding passes the same policies and no production migration references it). Non-login owners: `domain_writer`, `auth_fn_owner`, `lookup_fn_owner`, `maintenance_fn_owner`, `ops_fn_owner`. Function owners get `USAGE` and `CREATE` on schema `app` (needed for `ALTER FUNCTION ... OWNER TO`) and nothing more; runtime roles get neither. On PostgreSQL 16 or later memberships use `WITH SET TRUE`. `ALTER DEFAULT PRIVILEGES` is set for each function owner, not only for `migration_owner`.

Timeouts (`ALTER ROLE`, configurable): `app_runtime` statement 10 s, lock 3 s, idle-in-transaction 15 s; `maintenance_runtime` statement 60 s, lock 5 s (the reconciler raises `lock_timeout` up to 10 s with `SET LOCAL`); `ops_runtime` statement 60 s; `backup_operator` exempt from the idle timeout.

### Row-level security policies for owner roles and runtime roles

FORCE RLS applies to the table owner; function owners are ordinary roles subject to policies, so every function owner needs explicit policies:

- `domain_writer`: `FOR ALL ... USING (true) WITH CHECK (true)` on `parcel`, `parcel_status_history` and `delivery_proof`. The functions themselves enforce actor, role, assignment, version and transition through `lock_active_actor`; owner policies never call the principal helper.
- `lookup_fn_owner`: `SELECT` only, column grants `parcel(id, tracking_number)` and `parcel_status_history(id, parcel_id, status, changed_at)` (`id` is needed for ordering).
- `maintenance_fn_owner`: `SELECT`, and column-limited `UPDATE` on the recipient fields, fingerprint, `anonymized_at` and `version` of `parcel` and on `delivery_proof` metadata clearing.
- Runtime-role policies read identity with `NULLIF(current_setting('app.user_id', true), '')::bigint` (an unset or reset transaction-local setting reads as the empty string, which must deny and never raise), call the policy helper as a scalar sub-select so the planner evaluates it once, and implement the helper as a plain `STABLE` SQL function (no `SECURITY DEFINER`) over the column-limited `SELECT` that `app_runtime` already has on `app_user`.

### Protection of the account tables

`app_runtime` has no `INSERT`, `UPDATE` or `DELETE` on `app_user` and no `SELECT` on `password_hash`; it reads the other non-secret columns (id, username, display name, role, active flag, must-change flag, versions, created time), which also serves the Rider directory (A07) and the `assignedRider` fields. All account mutations are `auth_fn_owner` functions: `register_account` (role forced to `SELLER`; `RIDER` only when the verified context is an Admin), `change_password`, `set_user_active`; `get_login_snapshot(username)` returns the hash and versions for login. The initial Admin comes from the `ops_fn_owner` function `provision_admin`. `audit_event` is insert-only for `app_runtime` and `domain_writer` (no `UPDATE` or `DELETE` privilege and a trigger that rejects both). `auth_session` and `rate_limit_bucket` keep direct DML for `app_runtime`; the residual risk that a stolen runtime credential could forge a session is accepted and mitigated by credential custody and short lifetimes (D-33).

### Shared actor lock, lock order and trusted time

`lock_active_actor(user_id, session_version, allowed_roles, mode)` is owned by `auth_fn_owner` and executable by `domain_writer`. It locks the `app_user` row (`FOR SHARE` for ordering-only checks in domain writes, `FOR UPDATE` for login, password change and disablement), then verifies `is_active`, matching `session_version`, allowed role and, unless told otherwise, `must_change_password = false`. Lock order in every flow: acting account, then target account, then parcel. Domain functions read the actor and session version from the transaction context (`app.user_id`, `app.session_version`), never from arguments. History timestamps are taken after the parcel lock as `GREATEST(clock_timestamp(), latest earlier changed_at for that parcel)` so `changed_at, id` ordering cannot invert when a transaction waited on a lock. `as_of` parameters exist only on maintenance-role functions (D-24).

### Function registry

| Function | Owner | Callable by | Behavior summary |
| --- | --- | --- | --- |
| `lock_active_actor`, `get_login_snapshot`, `register_account`, `change_password`, `set_user_active` | `auth_fn_owner` | `app_runtime` / `domain_writer` as noted | Account checks and mutations (revision `0002`) |
| `create_parcel` | `domain_writer` | `app_runtime` | Seller only; replay-safe; inserts parcel, REGISTERED history and audit atomically (`0004`) |
| `update_delivery_status` | `domain_writer` | `app_runtime` | Assigned active Rider only; legal transitions; proof metadata on final outcomes (`0005`, final branch `0007`) |
| `assign_parcel`, `lock_delivery_target` | `domain_writer` | `app_runtime` | Admin assignment; locks and rechecks actor, assignment, OUT_FOR_DELIVERY state and version (`0007`) |
| `lookup_tracking(token)` | `lookup_fn_owner` | `tracking_runtime` only | Status and timestamps for the exact token |
| `list_retention_candidates(batch, as_of)`, `anonymize_parcel(parcel_id, as_of)` | `maintenance_fn_owner` | `maintenance_runtime` | Select and anonymize terminal parcels 12 months after `terminal_at`, and non-terminal parcels with no status change for 12 months (D-06, D-31) |
| `lock_parcel_for_reconcile(parcel_id)`, `proof_key_is_referenced(parcel_id, key)` | `maintenance_fn_owner` | `maintenance_runtime` | Take the finalization parcel lock with a bounded wait; re-read committed references in a fresh READ COMMITTED statement |
| `list_proofs_to_purge(batch)`, `clear_proof_after_purge(parcel_id)` | `maintenance_fn_owner` | `maintenance_runtime` | Anonymized parcels that still hold proof metadata; clear metadata after file removal and audit `PROOF_PURGED` |
| `purge_expired_sessions(batch)` | `maintenance_fn_owner` | `maintenance_runtime` | Delete expired sessions and rate-limit buckets |
| `set_maintenance_mode(enabled, until)`, `provision_admin`, ops lock/recover/purge functions | `ops_fn_owner` | `ops_runtime` | Operations (see below) |

### SQLSTATE mapping, error codes and timeouts (D-20)

SQL functions raise custom SQLSTATEs in class `PT`, mapped once in `core/errors.py` (Naszrul) with a unit test that the mapped set is a subset of the registry: PT001 FORBIDDEN, PT002 NOT_FOUND, PT003 VERSION_CONFLICT, PT004 INVALID_TRANSITION, PT005 INVALID_ASSIGNEE, PT006 PROOF_REQUIRED, PT007 TARGET_NOT_ALLOWED, PT008 PASSWORD_CHANGE_REQUIRED, PT009 IDEMPOTENCY_CONFLICT, PT010 REQUEST_EXPIRED, PT011 USERNAME_TAKEN, PT012 UNAUTHENTICATED (inactive account or stale session version). Lock timeout (55P03), deadlock (40P01), statement timeout (57014), advisory-lock wait timeout and connection-pool timeout map to `503 BUSY`. All modules use only registry codes; an unregistered code fails conformance test CT-03.

| Code | HTTP | Meaning |
| --- | --- | --- |
| VALIDATION_ERROR | 422 | Field validation failed; `fieldErrors` present |
| UNAUTHENTICATED | 401 | No valid session |
| AUTH_INVALID | 401 | Login failed (unknown user, wrong password or inactive account; generic) |
| FORBIDDEN | 403 | Role not permitted |
| CSRF_INVALID | 403 | Missing or invalid CSRF token or origin |
| PASSWORD_CHANGE_REQUIRED | 403 | Must change password first |
| TARGET_NOT_ALLOWED | 403 | Admin or self cannot be targeted through the web endpoint |
| NOT_FOUND | 404 | Missing or inaccessible resource (indistinguishable) |
| USERNAME_TAKEN | 409 | Registration conflict |
| VERSION_CONFLICT | 409 | Stale `expectedVersion` |
| INVALID_TRANSITION | 409 | Status change not allowed from the current state |
| IDEMPOTENCY_CONFLICT | 409 | Same `clientRequestId` with different data |
| REQUEST_EXPIRED | 409 | Creation key outlived anonymization |
| INVALID_ASSIGNEE | 422 | Target is not an active Rider |
| CURRENT_PASSWORD_INVALID | 422 | Wrong current password |
| PROOF_REQUIRED | 422 | Final outcome without a valid proof |
| PROOF_COUNT | 422 | More than one proof file or duplicate fields |
| PROOF_NOT_ALLOWED | 422 | Proof supplied for a non-final transition |
| PROOF_TOO_LARGE | 413 | Over the byte limit |
| PROOF_INVALID | 415 | Unsupported, corrupt or spoofed image |
| RATE_LIMITED | 429 | Throttled; `Retry-After` present |
| BUSY | 503 | Lock, statement, pool or hashing-capacity timeout; retry later |
| MAINTENANCE | 503 | Business mutation rejected during backup or maintenance |
| STORAGE_UNAVAILABLE | 503 | Proof storage failure with state unchanged |
| INTERNAL_ERROR | 500 | Generic failure; details in logs only |

A new password must differ from the current one (422 `VALIDATION_ERROR`, D-19).

### Audit event types (D-25)

`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGIN_THROTTLED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `USER_CREATED`, `USER_STATUS_CHANGED`, `ACCOUNT_LOCKED`, `ACCOUNT_RECOVERED`, `SESSIONS_PURGED`, `PARCEL_REGISTERED`, `PARCEL_ASSIGNED`, `PARCEL_REASSIGNED`, `STATUS_CHANGED`, `PROOF_UPLOADED`, `PARCEL_VIEWED` (Admin reads of private detail), `PROOF_VIEWED`, `RETENTION_ANONYMIZED`, `PROOF_PURGED`. Migration 0002 enforces this list with a CHECK constraint; adding a type needs a reviewed migration. Unknown usernames are never logged or stored; only a keyed digest and length.

### Rate limits, hashing capacity and abuse controls (D-18)

| Control | Default (configurable) |
| --- | --- |
| Login hard block | 5 failed logins per (username digest, source digest) per 15 minutes; a correct password during the block is also refused |
| Login username-only counter | 20 failures per username digest per 15 minutes: audit `LOGIN_THROTTLED` and alert only, never a block, so a remote attacker cannot lock out a legitimate user working from another source |
| Login per-source counter | 100 failures per source per 15 minutes; successes are not counted |
| Registration | 30 per source per hour |
| Public tracking | 30 lookups per source per minute (counts invalid tokens too) |
| Anonymous session creation | Lazy: A01 creates a session only when the client has none; at most 60 per source per minute |
| Private reads A12 and A19 | 120 per user per minute |
| Current-password attempts | 5 per user per 15 minutes |

Source is the trusted-proxy client address; IPv6 sources are keyed by their /64. Bucket keys are HMAC digests under a dedicated `RATE_LIMIT_KEY` (never reused from `FINGERPRINT_KEY`). A process-wide hashing semaphore (default 4) bounds concurrent Argon2 work; overflow returns `503 BUSY`. Passwords longer than 128 characters are rejected with 422 before any hashing on login, registration, creation and change; request bodies for JSON endpoints are capped (default 16 KiB). Containers run with memory and process limits so the database survives a flood.

### CSRF and request provenance

Unsafe-method requests require `X-CSRF-Token` (constant-time comparison) and same-origin evidence: `Origin` or `Sec-Fetch-Site` must match; when both are absent the request is rejected unless `Referer` is same-origin. `POST /public/tracking` (A13) is read-only and is **exempt from the token** (and therefore needs no anonymous session) but still requires the same-origin check and the lookup limiter; this removes the visitor-session coupling to M1 (D-09). Login, registration and every authenticated mutation keep the token.

### Backup coordination and maintenance mode (D-15)

- `unit_of_work(write=True)` (Zikri, PH1) takes `pg_advisory_xact_lock_shared(BACKUP_KEY)` first, before any row lock. Only business writes and maintenance jobs take it; session, CSRF and rate-limit housekeeping do not (sessions are purged on restore anyway). Failure-audit and limiter writes run after the main transaction closes, never nested inside it.
- `system_state.maintenance_mode` has an expiry (`set_until`) and is set and cleared through `ops_fn_owner.set_maintenance_mode`. A gate by route (not by HTTP method) rejects business mutations (A08, A09, A10, A15, A17 and password/registration writes) with `503 MAINTENANCE` while the flag is active; A01, A03, A04, A05, A13 and all reads continue. An advisory-lock wait timeout (55P03) also maps to `503 MAINTENANCE`.
- The backup tool (as `backup_operator`) holds a session-level `pg_advisory_lock(BACKUP_KEY)` for the whole dump and archive, with a bounded wait and a `trap` that clears the flag if the script dies. Staged-but-unpublished files are excluded.
- Restore is data-only: bootstrap roles, `alembic upgrade` to the manifest revision, `pg_restore --data-only --disable-triggers` as the bootstrap administrator, then `verify_grants`; policies and hardened functions always come from migrations, not from the dump.

### Proof storage and upload rules (D-13)

`storage_key` is `<parcelId>/<32 lowercase hex>.<jpg|png>` matching `^[0-9]{1,18}/[0-9a-f]{32}\.(jpg|png)$`. Staging and `final/` live under one private `PROOF_ROOT` on one filesystem (so a link or rename is atomic); the multipart spool directory is a private 0700 directory; the backend runs as a non-root user. Authorization and state are pre-checked under RLS (assigned Rider, OUT_FOR_DELIVERY, version) before the body is read or decoded, and rechecked under the lock; a process-wide upload semaphore (default 2) and a per-Rider limit shed overload with `503 BUSY`. Publication uses `os.link` (or `O_EXCL`) plus `unlink`, never overwrites, and fsyncs the directory. Trailing bytes after a valid image are discarded by re-encoding (sanitize and accept; the output contains no trailing data). Route A17 declares no `File()/Form()` parameters, so FastAPI does not parse the multipart body before authentication and CSRF dependencies run; the OpenAPI entry is declared with `openapi_extra`. The reconciler derives the parcel from the key's directory part, locks it through `lock_parcel_for_reconcile`, re-reads committed references in a fresh READ COMMITTED statement and deletes only unreferenced files older than 24 hours. A19 sends `Content-Type` from the stored verified media type, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: inline; filename="proof.<ext>"`. Upload errors: `PROOF_TOO_LARGE` (413), `PROOF_INVALID` (415), `PROOF_REQUIRED`/`PROOF_COUNT`/`PROOF_NOT_ALLOWED` (422). The client filename is never used.

### Idempotency fingerprint, search and phone input (D-14, D-08)

The creation fingerprint is HMAC-SHA256 keyed by `FINGERPRINT_KEY` over the canonical normalized request, not a plain hash of personal data. A11 `q` is 1-64 characters and matches, case-insensitively and literally with `\`, `%` and `_` escaped, a tracking-number prefix or a recipient-name substring. Phone input accepts Malaysian local numbers beginning with `0` (spaces, hyphens and parentheses ignored), normalized to `+60...`, and international numbers that begin with `+`; the stored form matches `^\+[1-9][0-9]{7,14}$` (D-34). A13 trims and uppercases the token before format validation.

### Visibility of who changed a status (SRC-08)

For the ADMIN role only, each A12 history item also carries `changedBy {id, displayName}`; Seller, Rider and public responses never include actors.

### Account lifecycle additions (D-32)

Initial passwords (A08) and reset passwords expire after 72 hours if unused. A21 `POST /admin/users/{userId}/password-reset` (Admin, Seller/Rider targets only, CSRF) generates a random one-time password returned once in the response, sets `must_change_password`, revokes the target's sessions and audits `PASSWORD_RESET`; the password is never logged.

### Operations commands, account journal and restore reconciliation (D-16)

The `ops_runtime` commands are `provision-admin`, `lock-account` (any role), `recover-account`, `purge-sessions`, `lock-accounts --from-file`, `reconcile-accounts --from-journal` and `quarantine-after-restore`. Every account-changing event (USER_CREATED, USER_STATUS_CHANGED, PASSWORD_CHANGED, PASSWORD_RESET, ACCOUNT_LOCKED, ACCOUNT_RECOVERED), whether made through the web endpoints or the commands, is also appended (user ID, event, time; never secrets) to an append-only **account journal outside the database**: a write-only S3 prefix or CloudWatch Logs stream, with local buffering when offline. After any restore: purge all sessions, replay the journal for events after the backup time (re-disable accounts disabled since; force `must_change_password` and revoke for accounts whose password changed since, because the restored hash is stale), and if the journal is unavailable run `quarantine-after-restore` (disable every Rider, force password change for all, Admin re-enables against the staff roster). The restore runbook states the recovery point objective: up to one backup interval (24 hours by default) of parcels, status changes and photos can be lost.

### Security headers and client address (D-26, D-27)

From PH1 responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'` (report-only until the first full browser regression, then enforced), HSTS in production only, and a Host allow-list. The client address used by rate limits comes only from the configured trusted proxy (`TRUSTED_PROXY_CIDRS`); forwarded headers from elsewhere are ignored.

### Test-only hooks (D-22)

The test principal override, failpoints and barrier hooks exist only in objects installed by the test app factory. No header, query parameter or cookie can enable them, the production factory has no registry, and settings refuse production startup if any test-only flag or `FAILPOINT_*` variable is set.

### Frontend API client additions

The client supports `Blob` responses (A19), leaves the `Content-Type` of multipart requests to the browser, and never retries unsafe methods automatically. `Principal` as returned to the browser is a separate DTO from the internal authentication context, which carries `sessionVersion`.

## Authoritative references

FastAPI provides dependency and validation tools; it does not complete the project's session, CSRF and permission design automatically. Use [FastAPI request dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/) and the library approach to [password hashing](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) without assuming that tutorial's JWT design is required. The chosen cookie-session design follows [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
