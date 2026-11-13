# ParcelTrack Lite database design

Agreed database design, with USER specialized into SELLER, RIDER and ADMIN subclasses. Migration `0004_integrated_erd` implements the subclass tables, backfills existing accounts, redirects role-specific foreign keys and creates DELIVERY_PROOF. USER maps to the existing SQL table `app.app_user`; its shared attributes remain there. The [shared system contract](shared/system-contract.md) defines field constraints and operations. Session, migration, rate-limit and `system_state` (maintenance flag) infrastructure is omitted from the business-entity diagram. The migration order is `0002_auth_core` (USER and AuditEvent), `0003_parcels` (PARCEL, ParcelStatusHistory and the AuditEvent-to-Parcel foreign key), then `0004_integrated_erd` (subclasses, DeliveryProof and history enforcement). See the [dependency matrix](shared/dependency-matrix.md#migration-and-layer-order).

## Table ERD with numeric multiplicities

This view uses UML-style table boxes with gray headers and field lists, matching the supplied reference. All eight entities appear exactly once in one connected diagram: USER, SELLER, RIDER, ADMIN, PARCEL, PARCEL_STATUS_HISTORY, DELIVERY_PROOF and AUDIT_EVENT. The hollow generalization triangle points from the three subclasses toward USER. SELLER connects directly to PARCEL; RIDER connects directly to PARCEL and DELIVERY_PROOF; ADMIN connects directly to PARCEL through a dashed assignment-operation link. Nine stored business associations show their type (`1:N` or `1:1`) and numeric endpoint multiplicities.

![Integrated ParcelTrack Lite ERD with USER, its three subclasses and their related entities](assets/parceltrack-integrated-erd.svg)

[Download PDF](assets/parceltrack-integrated-erd.pdf) | [Download complete ERD PNG](assets/parceltrack-integrated-erd.png) | [Download complete ERD SVG](assets/parceltrack-integrated-erd.svg)

Read each endpoint label as the number of instances of that entity allowed for one instance at the other endpoint: `1..1` = exactly one, `0..1` = optional one, `0..*` = zero or many, `1..*` = one or many. For example, SELLER `1..1` - creates - `0..*` PARCEL means each parcel has one seller and each seller may create zero or many parcels. Lines connect table boxes; the foreign keys below identify the specific linked fields. The diagram describes the agreed business model; the implementation boundary is recorded above.

### USER superclass and role subclasses

USER holds the shared account fields. SELLER, RIDER and ADMIN each inherit all USER fields and have a `user_id` that is both their primary key and a foreign key to `USER.id`. The specialization is **complete and disjoint**: every USER belongs to exactly one of these subclasses. `USER.role` remains a discriminator and must agree with subclass membership. Database triggers create the matching subclass on account insertion, synchronize permitted role changes, and reject mismatched membership or removal of a user's required subclass. Existing parcel/proof references prevent changing a referenced Seller or Rider to another role. Account disablement retains subclass membership and historical references.

| Subclass | Parent | Key | Membership |
| --- | --- | --- | --- |
| SELLER | USER | `seller.user_id` PK + FK to `USER.id` | Exactly one USER per SELLER; 0..1 SELLER per USER |
| RIDER | USER | `rider.user_id` PK + FK to `USER.id` | Exactly one USER per RIDER; 0..1 RIDER per USER |
| ADMIN | USER | `admin.user_id` PK + FK to `USER.id` | Exactly one USER per ADMIN; 0..1 ADMIN per USER |

The optional membership of each individual subclass is constrained by the complete, disjoint rule: a USER must appear in one subclass and cannot appear in two. No additional role-specific attributes are assumed.

### Relationship types and meaning

| Relationship | Type | First entity per second entity | Second entity per first entity | Foreign key |
| --- | --- | --- | --- | --- |
| SELLER CREATES PARCEL | One-to-many (1:N) | Exactly 1 Seller per parcel | 0..* parcels per Seller | `parcel.seller_id` to `SELLER.user_id` |
| RIDER IS ASSIGNED TO PARCEL | One-to-many (1:N), optional assignment | 0..1 Rider per parcel | 0..* parcels per Rider | `parcel.assigned_rider_id` to `RIDER.user_id` |
| PARCEL RECORDS PARCEL_STATUS_HISTORY | One-to-many (1:N) | Exactly 1 parcel per history entry | 1..* history entries per parcel | `parcel_status_history.parcel_id` |
| USER CHANGES PARCEL_STATUS_HISTORY | One-to-many (1:N) | Exactly 1 acting user per history entry | 0..* history entries per user | `parcel_status_history.changed_by_id` |
| PARCEL HAS DELIVERY_PROOF | One-to-one (1:1), optional proof | Exactly 1 parcel per proof | 0..1 proof per parcel | `delivery_proof.parcel_id` (unique) |
| RIDER UPLOADS DELIVERY_PROOF | One-to-many (1:N) | Exactly 1 uploader per proof | 0..* proofs per Rider | `delivery_proof.uploaded_by_id` to `RIDER.user_id` |
| USER ACTS IN AUDIT_EVENT | One-to-many (1:N), optional actor | 0..1 actor per event | 0..* events per user as actor | `audit_event.actor_id` |
| USER IS TARGET OF AUDIT_EVENT | One-to-many (1:N), optional target | 0..1 target user per event | 0..* events per user as target | `audit_event.target_user_id` |
| PARCEL RELATES TO AUDIT_EVENT | One-to-many (1:N), optional parcel | 0..1 parcel per event | 0..* events per parcel | `audit_event.parcel_id` |

ADMIN inherits USER's actor and target audit associations, just as SELLER and RIDER do. The dashed ADMIN-to-PARCEL line shows the assign/reassign operation recorded through audit events. It has no database multiplicity because it represents a permission/operation rather than a stored foreign-key association; the model does not introduce an `admin_id` on PARCEL. USER remains the parent for status-history actors because parcel creation, initial assignment and delivery changes can be performed by different subclasses. A recipient is represented by parcel attributes, not a separate recipient table.

There is no direct many-to-many (M:N) relationship in this model. Users and parcels can have many-to-many **historical participation** through PARCEL_STATUS_HISTORY: a user can change many parcels, and a parcel can have changes by multiple users. Each history entry still references exactly one user and one parcel. Current rider assignment remains one-to-many.

The `1..*` history rule is enforced by a deferred database constraint trigger: each new parcel must have a Registered entry before its transaction completes. A separate trigger prevents history updates and deletions. The migration rejects existing parcels missing Registered history, rather than inventing an actor or timestamp. Proof is optional across the parcel lifecycle, with final-outcome requirements described below. The proof table and its access policies are implemented in `db/sql/0004_integrated_erd.sql`; upload/finalization endpoints remain later work.

### Entity attributes

`PK` = primary key, `FK` = foreign key, `UK` = unique key. These are logical types; the shared contract and SQL define exact storage types and constraints.

| Entity | Attributes |
| --- | --- |
| USER | `id` bigint PK; `username` string UK; `display_name` string; `password_hash` string; `role` string; `is_active` boolean; `must_change_password` boolean; `session_version` integer; `version` integer; `created_at` datetime |
| SELLER | `user_id` bigint PK + FK to `USER.id`; inherits USER attributes |
| RIDER | `user_id` bigint PK + FK to `USER.id`; inherits USER attributes |
| ADMIN | `user_id` bigint PK + FK to `USER.id`; inherits USER attributes |
| PARCEL | `id` bigint PK; `tracking_number` string UK; `seller_id` bigint FK; `assigned_rider_id` bigint FK nullable; `recipient_name` string; `recipient_phone` string; `recipient_address` text; `weight_kg` decimal; `current_status` string; `version` integer; `client_request_id` UUID; `creation_fingerprint` string; `created_at` datetime; `terminal_at` datetime nullable; `delivered_at` datetime nullable; `anonymized_at` datetime nullable. Composite UK: (`seller_id`, `client_request_id`). Recipient fields and fingerprint may be cleared after anonymization. |
| PARCEL_STATUS_HISTORY | `id` bigint PK; `parcel_id` bigint FK; `changed_by_id` bigint FK; `status` string; `changed_at` datetime |
| DELIVERY_PROOF | `id` bigint PK; `parcel_id` bigint FK + UK; `uploaded_by_id` bigint FK; `storage_key` string UK; `media_type` string; `size_bytes` integer; `uploaded_at` datetime |
| AUDIT_EVENT | `id` bigint PK; `actor_id` bigint FK nullable; `target_user_id` bigint FK nullable; `parcel_id` bigint FK nullable; `event_type` string; `outcome` string; `occurred_at` datetime; `request_id` UUID; `details` JSON (allowlisted safe values only) |

## Field and relationship rules

| Item | Rule |
| --- | --- |
| User roles | Seller, Rider and Admin only. Public tracking needs no User row. Public registration always creates a Seller, regardless of submitted role fields. |
| Password field | Logical hash field; use the framework's password storage API. Never keep plaintext passwords or a separate recoverable password value. |
| Seller ownership | Every parcel belongs to exactly one Seller. Read/search queries derive ownership from the logged-in user. Never accept a seller ID as authority from a submitted form. |
| Rider assignment | A parcel has zero or one current Rider. Only Admin may assign an active Rider. The SQL FK to `RIDER.user_id` enforces subclass membership; application validation must still check active status and authorization. `seller_id` similarly references `SELLER.user_id`, and proof `uploaded_by_id` references `RIDER.user_id`. |
| Tracking number | Unique cryptographically random identifier, proposed minimum 128 random bits. Use a unique index and regenerate on collision. Do not derive it from parcel IDs, phone numbers or timestamps. |
| Weight | Positive decimal kilograms with documented precision and an agreed upper bound. Validate on the server and add a database check where supported. |
| Personal data | Name, phone and address are required at registration. Allow anonymization later without deleting the status history. Store phone values as strings. |
| Status history | Each parcel starts with Registered history in the same transaction as creation. Record each subsequent change with the acting User and timestamp. No public endpoint may return actor information. |
| Current status | Stored on Parcel for lists/counts. Update it and append history in the same database transaction. Lock the parcel during transitions so concurrent updates cannot create contradictory history. |
| Proof | Zero or one photo per parcel in this initial scope. Store only its private storage key (`<parcelId>/<32 hex>.<jpg\|png>`, D-13) and metadata in the database. The application must restrict who can retrieve it. After retention purge the file is removed first and the metadata cleared afterwards. |
| Final outcome | Proposed rule: Delivered and Failed require a valid proof photo. Commit the proof metadata and final status together; failure must not leave a final status without proof. |
| Audit | Actor is nullable for unauthenticated failures. Log a safe event category from the contract's event-type list and outcome. `parcel_id` becomes a foreign key in migration 0003. Do not put submitted passwords, complete addresses or raw login payloads in this table. |
| Time | Store timezone-aware timestamps consistently and display Malaysia time in the demo. Public tracking returns only status, date and time. |

## Proposed allowed status transitions

| Current state | Next state | Authorized actor |
| --- | --- | --- |
| New parcel | Registered | Seller creating their own parcel |
| Registered | Assigned | Admin selecting an active Rider |
| Assigned | Out for Delivery | Assigned active Rider |
| Out for Delivery | Delivered | Assigned active Rider with a valid proof photo |
| Out for Delivery | Failed | Assigned active Rider with a valid proof photo |

Delivered and Failed are terminal. Admin may reassign unfinished Assigned or Out for Delivery parcels to another active Rider without changing status. Reassignment records an audit event with the Admin and old/new Rider IDs; it does not insert a duplicate status history event. First assignment creates Assigned history. Redelivery after a terminal outcome and replacing proof images are outside scope. Every assignment/status mutation checks the expected parcel version and increments it on a real change.

The case study lists these states and roles but does not fully specify retries, reassignment, proof replacement or all transition constraints. The table above makes an explicit implementation proposal.

## Privacy and retention

Public tracking must select only status and timestamp fields. Exclude recipient information, actor identity, internal user IDs and proof links from the entire public response, including hidden fields and embedded scripts.

At 12 months after delivery, the project's P3 policy requires deletion or anonymization of recipient data. Clear personal fields and remove identifying proof images while keeping non-identifying history. The implementation baseline also applies 12 months after terminal_at for Failed parcels as an explicit design choice. Deny photo access before retryable file deletion: `anonymized_at` is the flag that makes proof endpoints return 404 immediately, and Syauqi's purge job then removes files and clears proof metadata. Follow the [backup retention/restore procedure](shared/integration-and-deployment.md#backup-and-restore); after any restore, run retention again before reopening (D-17).

## Initial implementation decisions

- Use account disablement for departed Riders so history keeps a valid actor reference. Reject future requests from disabled accounts, including existing sessions.
- Restrict destructive account/parcel deletion where it would remove required history.
- Add indexes for tracking_number, seller_id, assigned_rider_id and parcel history ordering.
- Authorize proof downloads on the server. The shared contract proposes Admin, the parcel's Seller and its assigned Rider as readers. Public users receive no proof access. This is an explicit implementation rule because the brief specifies upload rights but not photo download rights.
- Keep database roles, validation and server-side authorization consistent. Foreign keys cannot establish ownership or authorization by themselves.

## PostgreSQL row level security design

The team selected PostgreSQL in the full Supabase Docker stack with RLS as the database direction. The entities above remain unchanged. Add policies and database privileges through versioned migrations; the following is design guidance, not implemented SQL.

| Application actor | Parcel read access | Allowed business operation |
| --- | --- | --- |
| Seller | Own parcels | Register own parcel; no assignment or delivery-status changes |
| Rider | Assigned parcels | Permitted status updates and proof submission for assigned parcels |
| Admin | All parcels | Assignment and dashboard; no Rider delivery-status updates |
| Public | No direct parcel-table access | Dedicated tracking lookup returning only status and timestamps for the supplied tracking number |

### Database roles and transactions

1. Separate the migration/owner role from runtime roles. The runtime role must not own protected tables, be a superuser, have BYPASSRLS, or inherit owner/bypass privileges. Do not connect the application as the default postgres administrator.
2. Enable and force RLS on protected parcel, history and proof-metadata tables. Specify policies for each operation, using USING for visible existing rows and WITH CHECK for permitted inserted/updated rows. Missing authenticated context must deny access. Avoid a broad permissive policy that accidentally grants access through OR composition.
3. Authenticate in the backend first. Open a transaction and set the verified application user ID and expected session_version using transaction-local, parameterized set_config calls. Policies derive role/active status and validate session version against app_user. All protected queries must use that same transaction and database connection. Never accept identity or role context from request parameters.
4. Use transaction-local settings so connection-pool reuse does not retain another user's context. Test successful commits and rollbacks. Framework lazy queries must not run outside the transaction that establishes identity.
5. Treat custom database settings as backend-supplied context, not an unforgeable credential. A runtime connection able to execute arbitrary SQL can potentially change those settings. Continue preventing SQL injection and protect database credentials; do not expose the connection directly to the browser.
6. Keep authentication bootstrap queries separate from parcel authorization context. Account login needs a narrowly scoped credential lookup before the user is authenticated; it must not establish broad anonymous parcel access.

PostgreSQL documents that superusers and BYPASSRLS roles bypass policies, and table owners normally do as well. FORCE RLS subjects ordinary owner access to policies but does not constrain superusers or BYPASSRLS roles. See [row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Transaction-local settings expire on commit or rollback: [SET documentation](https://www.postgresql.org/docs/current/sql-set.html).

### Row access and field permissions

RLS restricts rows, not individual columns or every business operation. A Rider who can update an assigned parcel must not thereby gain permission to rewrite recipient data, ownership or assignment. The selected baseline gives app_runtime protected SELECT access and EXECUTE on controlled create/assign/status/lock functions, with no direct parcel/history/proof DML or privileged row locking. Non-login domain_writer owns those functions, has specific DML grants, and remains subject to RLS. Functions and backend services both check actor/session version, field allowlists, transitions and expectedVersion. All privileged functions use the shared hardening rules. See the [authoritative privilege design](shared/system-contract.md#rls-and-database-privileges).

History access and proof-metadata access must follow the parent parcel's ownership/assignment. History writes must record the verified actor and be append-only for ordinary runtime operations. Review policy dependencies to avoid recursive policy queries and ensure legitimate inserts/history updates work under the runtime role.

### Public tracking

Use the separate tracking_runtime pool/role that can execute only lookup_tracking. The function matches one supplied tracking token and returns only status and timestamps, with no recipient fields, actor IDs or proof links. The caller has no general access to Parcel or history tables. Its non-login function owner has restricted column grants and explicit read policies, never superuser or BYPASSRLS.

lookup_tracking is a SECURITY DEFINER function owned by the narrowly privileged non-login lookup role. Like every other privileged function, it uses a trusted fixed search_path with pg_temp last and qualified references; creation, PUBLIC revocation and narrow EXECUTE grants occur in one migration transaction. Review this deliberate read boundary separately; it must not accept arbitrary SQL. Apply lookup rate limits in the backend. A public view alone does not guarantee caller-RLS behavior or token-scoped access.

Keep the database private within the Docker network in cloud. Persist its data in a named volume and maintain separate backups. For a local database GUI, bind any published database port to localhost only.
