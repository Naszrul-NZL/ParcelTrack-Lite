# Shared system contract

Contract version 2, after independent plan review. Planning baseline for all three module folders. Changing a rule here requires review by every affected owner and updates to tests. Examples and limits are design decisions unless explicitly attributed to the case study. Required unit, integration and browser coverage is defined in the [testing strategy](testing-strategy.md).

## Architecture and code boundaries

Use one FastAPI application, React with TypeScript/Vite, PostgreSQL, SQLAlchemy with psycopg, and Alembic migrations. Use ordinary synchronous database services initially; do not block an async route with unbounded database or image-processing work. Lock compatible dependency versions at implementation time and commit Python/JavaScript lockfiles. Docker images use supported, pinned versions.

```text
backend/app/
  main.py                    shared router composition
  core/                      settings, DB unit of work, safe errors, principal, CSRF, logging
  modules/auth/              NASZ: accounts, server-side sessions and permissions
  modules/parcels/           Zikri: parcel models, creation, seller reads and tracking
  modules/delivery/          Qee: assignment, updates, proof and dashboard
backend/alembic/              one ordered revision history, module-authored migrations
backend/tests/                module tests plus cross-module integration tests
frontend/src/
  app/                       router, shared shell and session provider
  shared/                    API client, types and common form/list controls
  features/auth/             NASZ
  features/parcels/          Zikri
  features/delivery/         Qee
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

GET /api/v1/auth/csrf creates or resumes a short-lived anonymous/authenticated server session and returns {"csrfToken":"..."}. Use a random synchronizer token stored with the session. React keeps it in memory and sends X-CSRF-Token for POST/PATCH/DELETE, including login, registration, logout and the POST tracking lookup. Check the header with a constant-time comparison and validate same-origin request metadata. CSRF tokens and session values are never logged. This is an explicit backend responsibility, not automatic FastAPI session behavior.

Successful login revokes the old anonymous/authenticated session and issues a new session token and CSRF token. Respond with Principal plus csrfToken. GET /auth/me returns only Principal; React obtains CSRF through /auth/csrf on reload. Logout revokes the server record and clears the cookie. Password change invalidates all that user's sessions, including the current session, then requires login again. Missing/invalid CSRF is 403 with code CSRF_INVALID; refresh the token and ask the user to resubmit rather than blindly replaying a mutation.

Login verifies a password against a specific hash/session_version snapshot. Before issuing a session, lock and re-read the account; its hash/version must still match that snapshot and it must remain active. Otherwise reject or restart verification, never attach newly read session_version to credentials verified against an obsolete hash. A session last-seen update is UPDATE-only on an existing, still-valid record; it cannot upsert a deleted/revoked session after logout.

An authenticated session records the user's session_version. Every protected request checks active account state and matching version. Disablement, incident lock or password change increments that version; old sessions fail immediately on their next request. Service transactions recheck/lock the acting account and expected session version before sensitive writes so disablement or password changes cannot be ignored by a long-running operation. Lock account rows before parcel rows in a consistent ID order to avoid deadlocks. Protected parcel locks are acquired by the controlled database functions below, not direct app_runtime SELECT FOR UPDATE.

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

ParcelSummary = {id, trackingNumber, currentStatus, weightKg, createdAt, version}. ParcelDetail adds recipient:{name,phone,address}, assignedRider:{id,displayName,isActive} or null, history:[{status,changedAt}], hasProof, anonymized and terminalAt. After anonymization recipient fields are null. Dashboard responses never contain recipient fields. Proof storage keys and filesystem paths never appear in an API response.

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
| A13 | M2 | POST /public/tracking | Anyone | {trackingNumber}; 200 {history:[{status,changedAt}]}; unknown valid token 404 |
| A14 | M3 | GET /admin/parcels | Admin | status/riderId/needsReassignment/page; paginated summary plus assignedRider |
| A15 | M3 | PATCH /admin/parcels/{parcelId}/assignment | Admin | {riderId,expectedVersion}; 200 ParcelDetail |
| A16 | M3 | GET /rider/parcels | Rider | status/page filters; paginated assigned ParcelSummary |
| A17 | M3 | POST /rider/parcels/{parcelId}/status | Rider | multipart: status,expectedVersion, optional proof; 200 ParcelDetail |
| A18 | M3 | GET /admin/dashboard | Admin | {counts:{REGISTERED,ASSIGNED,OUT_FOR_DELIVERY,DELIVERED,FAILED},total,generatedAt} |
| A19 | M3 | GET /parcels/{parcelId}/proof | Authorized private reader | Image stream with fixed verified MIME, no-store and nosniff; no public static URL |
| A20 | M1 | GET /admin/audit | Admin | eventType/parcelId/page; paginated safe audit records |

Public tracking uses POST to avoid putting tracking tokens into URLs/access logs. It remains read-only. The reverse proxy and API must redact request bodies and sensitive query values from routine logs.

### Validation and operational limits

- Username: 3 to 50 lowercase ASCII letters, digits, dot, underscore or hyphen; display name: 1 to 80 Unicode characters. Normalize username once before lookup and uniqueness checks.
- Password: 10 to 128 characters, no silent truncation; reject known common choices with a maintained local list. Use Argon2id via a supported password library; benchmark settings on the deployed instance. Do not write a custom hash algorithm.
- Recipient name: 1 to 120 characters; address: 1 to 500; trim surrounding whitespace. Preserve ordinary Unicode. Phone: normalized international form matching ^\+[1-9][0-9]{7,14}$. Explain the required format in the form.
- Weight: finite decimal from 0.001 to 100.000 kg, at most three decimal places; reject NaN and infinities before database access. This upper limit is a proposed project rule, not a source requirement.
- Tracking: PTL- followed by 32 uppercase hexadecimal characters generated from 16 cryptographically random bytes. Validate length/format; uniqueness is enforced in PostgreSQL with bounded collision retry.
- Initial throttle defaults: login five failures per username-digest per 15 minutes plus 30 attempts per source per 15 minutes; tracking 30 lookups per source per minute; registration 10 attempts per source per hour; CSRF bootstrap 60 per source per minute. These must be configurable and tested at the threshold boundaries. Generic login errors and no permanent automatic lockout prevent trivial permanent account denial.
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

For parcel-domain writes, app_runtime has no direct INSERT/UPDATE/DELETE. It can execute specific functions for create_parcel (M2), assign_parcel and update_delivery_status (M3). These functions use a non-login domain_writer role, which is not a table owner or RLS bypass role. They repeat actor/field/transition checks, apply the expected version and create history/audit atomically. Do not give the runtime permission to SET ROLE to function-owner roles. Domain functions permit initial history/proof/audit inserts but never arbitrary history edits. M1 account/session and audit-login writes have their own narrowly scoped repository privileges; account data is not exposed as a public database API.

For final-photo publication, M3 also exposes lock_delivery_target(parcel_id,expected_version), a narrow SECURITY DEFINER function owned by domain_writer. It locks/rechecks the active Rider account/session version before the parcel, verifies current assignment, OUT_FOR_DELIVERY state and expected version, and returns only the authorized target identifier/state. The lock remains held in the caller's existing transaction while the prepared file is published and update_delivery_status commits metadata/history. The latter repeats its checks. Only the function owner has the DML privilege needed to acquire parcel row locks; do not grant app_runtime general UPDATE merely to use SELECT FOR UPDATE.

Every SECURITY DEFINER function, including domain writes/locking, public lookup, privileged auth operations and maintenance, follows the same hardening rule: non-login/non-bypass narrowly privileged owner; fixed trusted search_path with pg_temp last; fully qualified table/function references; no untrusted dynamic SQL; and creation plus REVOKE EXECUTE FROM PUBLIC plus selective grants in one migration transaction. Runtime roles have no CREATE privilege on trusted schemas and no owner-role membership. Test function catalog properties and temporary-object shadowing, not only normal calls.

tracking_runtime may execute only lookup_tracking(token), with no direct protected-table access. Its non-login function owner has only the necessary column SELECT grants and explicit read policies for token lookup. The function returns status and timestamp only, uses exact token matching, fixes a safe search_path, qualifies references, and revokes default PUBLIC execution. The function owner has no superuser/BYPASSRLS privileges. This is a deliberate restricted read boundary and must be reviewed/tested separately.

Custom transaction settings are backend context, not unforgeable identity: SQL injection or stolen runtime credentials can undermine that trust. Continue parameterized queries, secret protection, application authorization and response allowlists. RLS also does not enforce column permissions by itself; controlled write functions establish that boundary. See [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [safe function definition](https://www.postgresql.org/docs/current/sql-createfunction.html) and [SQLAlchemy transaction management](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html).

## Proof consistency and retention

Files and PostgreSQL do not share one atomic transaction. Qee implements this compensating workflow: validate into private staging; begin the database transaction and call lock_delivery_target through app_runtime; under that controlled lock, move the immutable generated file into durable final storage; call update_delivery_status to insert metadata/history and commit. Delete the new file only after a rollback/non-commit is confirmed. If commit acknowledgment is lost, retain the file and reconcile via a fresh connection before cleanup; an exception alone does not prove rollback. Never delete committed proof because sending the response failed. A crash may leave an unreferenced file, so clean files older than 24 hours only after checking they are not referenced and not in an active upload. Metadata is committed only after a durable file exists. Storage failures leave the parcel's previous state intact.

Unknown-commit and orphan reconciliation use a narrowly granted maintenance helper to acquire the same parcel row lock as finalization, wait for the original transaction to resolve, then check committed storage-key references in a subsequent fresh READ COMMITTED statement while holding that lock. Only a settled unreferenced key may be deleted. Lock timeout, missing recovery context or database unavailability means preserve and retry later; seeing no row before the original transaction completes is insufficient. Function owners receive only the maintenance RLS policies/grants needed for this operation, not superuser/BYPASSRLS. Generated file keys are immutable and never reused for a new submission.

P3 requires recipient deletion/anonymization 12 months after delivery. The implementation baseline also applies 12 months after terminalAt for FAILED parcels; this extension is a design choice. A daily private maintenance command selects eligible parcels, first denies proof retrieval and clears recipient fields/creation fingerprint while marking anonymizedAt within a database transaction, then removes files with retryable cleanup. Clear proof metadata after successful file removal. Interrupted cleanup stays deny-listed and is retried; it must never make the photo accessible again. Keep non-identifying history/counts. Maintenance has a separate execute-only credential for reviewed cleanup functions, not the migration role and not a public endpoint.

## Frontend integration

One session provider boots A01 and A05, exposes Principal and CSRF state, and clears all private cached queries on logout, 401, account change or password change. The API client uses same-origin credentials, sets CSRF headers and normalizes errors. In local development Vite proxies /api to FastAPI; cloud serves both through one HTTPS origin. No permissive credentialed CORS is needed.

M1 owns /login, /register, /account/password and /admin/users. M2 owns /seller/parcels, /seller/parcels/new, /parcels/:id and /track. M3 owns /admin/parcels, /admin/dashboard and /rider/parcels; its proof viewer and Rider update panel are used inside M2's shared private detail page. The shared shell links to the correct role landing page. Must-change-password overrides all other private navigation.

Every screen handles loading, empty data, validation, forbidden/expired session and server/network failures. Lists paginate. Disable duplicate submissions; preserve non-sensitive drafts after errors; clear password fields. React displays user text normally and does not render recipient data through raw HTML. Rider screens must work at phone widths with keyboard-accessible controls and visible focus. These are implementation requirements, not a prescribed visual theme.

## Authoritative references

FastAPI provides dependency and validation tools; it does not complete the project's session, CSRF and permission design automatically. Use [FastAPI request dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/) and the library approach to [password hashing](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) without assuming that tutorial's JWT design is required. The chosen cookie-session design follows [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
