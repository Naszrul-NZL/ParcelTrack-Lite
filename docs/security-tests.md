# ParcelTrack Lite security requirements and tests

All requirements are planned. No application exists yet and no test in this worksheet has been executed. Replace Not run with the observed result and evidence after each execution. Each module has more than five proposed input types, matching the final rubric's highest testing band when completed, documented and passing.

Use the [separate module plans](project-plan.md#plans-by-owner) for full functional acceptance, the [shared contract](shared/system-contract.md) for exact behavior, and [INT-01 through INT-12](shared/integration-and-aws.md#end-to-end-acceptance-scenarios) for cross-module acceptance. The rows here are security tests, not the entire project's test scope.

## Module 1 owned by NASZ

| ID | Security requirement | Test input or action | Expected result | Actual result |
| --- | --- | --- | --- | --- |
| M1-01 | Use parameterized database access for authentication | Username containing `' OR '1'='1` and an invalid password | Login fails with a generic error, no SQL error and no authenticated session | Not run |
| M1-02 | Enforce at least 10 password characters server-side | Register with a 9-character password; repeat with an acceptable 10+ character password | Short password rejected; acceptable password follows normal validation | Not run |
| M1-03 | Hash passwords with Argon2 or bcrypt | Create an account and inspect its stored password field privately | Framework hash identifies the configured approved algorithm; no plaintext password stored | Not run |
| M1-04 | Rate-limit login attempts | Repeated wrong passwords beyond a documented threshold | Further attempts are throttled, the event is logged and errors do not reveal whether an account exists | Not run |
| M1-05 | Enforce Admin permissions on every user-management request | Seller directly opens an Admin URL and submits a Rider-creation request | Both requests denied; no Rider created | Not run |
| M1-06 | Encode account display names | Store a script payload in an allowed name field and view it | Payload renders as text or is rejected; no script executes | Not run |
| M1-07 | Rotate session on login and invalidate it on logout | Capture session identifier before/after login, then reuse logged-out session for a protected request | Identifier changes at login and logged-out session cannot authenticate | Not run |
| M1-08 | Prevent role escalation through self-registration | Submit Seller registration with an extra `role=Admin` or `role=Rider` field | Account remains Seller or request is rejected | Not run |
| M1-09 | Disable departed Rider accounts promptly | Admin disables a Rider, then Rider tries new login and an already-open session | Both fail to authorize protected requests | Not run |
| M1-10 | Require current password for password change | Submit an incorrect current password and otherwise acceptable new password | Change rejected; current credential still works | Not run |
| M1-11 | Credential and session races cannot revive access | Coordinate login versus password change/disablement and logout versus last-seen refresh using separate connections | Obsolete verified hash cannot issue a current session; revoked/deleted session is never recreated | Not run |
| M1-12 | Compromised Admin can be locked privately | Use the ops_runtime private command to lock and recover a test Admin | Sessions revoked and account disabled immediately; audited authorized recovery requires new login; no public Admin-lock endpoint | Not run |

## Module 2 owned by Zikri

| ID | Security requirement | Test input or action | Expected result | Actual result |
| --- | --- | --- | --- | --- |
| M2-01 | Parameterize parcel search | Submit SQL injection text in the seller search field | No unauthorized rows or SQL error; ownership filtering still applies | Not run |
| M2-02 | Encode recipient data | Submit `<script>alert(1)</script>` in an address and open authorized parcel views | Payload renders harmlessly or is rejected; no script executes | Not run |
| M2-03 | Validate phone and weight server-side | Malformed phone, zero/negative weight, nonnumeric weight | Invalid data rejected with useful field errors; no parcel/history created | Not run |
| M2-04 | Restrict every parcel read to its owner | Seller B changes a detail URL to Seller A's parcel ID and tries search alternatives | No parcel data disclosed through detail, list or search | Not run |
| M2-05 | Generate cryptographically random unique tracking numbers | Register multiple parcels; inspect generator and uniqueness constraint | Generator uses a cryptographic source; identifiers are unique and not sequential; sampling alone is not treated as proof of unpredictability | Not run |
| M2-06 | Expose only status and timestamps publicly | Track a known parcel and inspect HTML and any response data | No name, phone, address, actor identity or proof image/link | Not run |
| M2-07 | Rate-limit public lookups | Exceed a documented per-source lookup threshold | Further lookups throttled without database errors | Not run |
| M2-08 | Restrict parcel creation to Seller | Rider/Admin sends a parcel registration request, including a forged seller ID | Request denied; no parcel created | Not run |
| M2-09 | Bind ownership to the authenticated Seller | Seller A registers with an extra Seller B identifier | New parcel belongs to Seller A or request is rejected | Not run |
| M2-10 | Implement the project's retention policy | Synthetic Delivered parcel older than 12 months goes through cleanup | Recipient data anonymized/deleted and identifying proof removed according to the documented process | Not run |

## Module 3 owned by Qee

| ID | Security requirement | Test input or action | Expected result | Actual result |
| --- | --- | --- | --- | --- |
| M3-01 | Restrict updates to the assigned active Rider | Rider B submits an update for Rider A's parcel | Denied; status, proof and history remain unchanged | Not run |
| M3-02 | Restrict assignment and dashboard to Admin | Seller/Rider directly requests dashboard and submits assignment | Both denied; no assignment or history change | Not run |
| M3-03 | Validate file extension and decoded image content | Upload `.php`, `shell.php.jpg`, renamed text, corrupt image or a MIME-spoofed payload | Invalid input rejected; no executable/public file or final status created | Not run |
| M3-04 | Enforce image byte and dimension limits | Upload a file over the documented byte limit and an image exceeding the pixel limit | Both rejected safely before costly processing/storage | Not run |
| M3-05 | Rename uploads and keep them private | Upload a valid image with an unsafe filename, then attempt unauthenticated/direct retrieval | Generated safe storage name used; unauthorized retrieval denied | Not run |
| M3-06 | Validate statuses and allowed transitions | Submit unknown status and attempt Assigned directly to Delivered | Both rejected; no inconsistent history created | Not run |
| M3-07 | Attribute every status change | Assigned Rider records a permitted change | One history event with server-derived actor and time; current status matches | Not run |
| M3-08 | Require valid proof for final outcome | Submit Delivered/Failed without proof, then repeat with valid proof | Missing proof rejected; valid final status and proof commit consistently | Not run |
| M3-09 | Keep the Admin outside Rider update permissions | Admin submits Out for Delivery or Delivered directly | Denied even though Admin may view parcels and assign Riders | Not run |
| M3-10 | Preserve consistency during concurrent updates | Send conflicting final updates for the same parcel | Only one valid transition succeeds; status, history and proof agree | Not run |

## Shared controls

| ID | Requirement | Verification | Actual result |
| --- | --- | --- | --- |
| S-01 | Protect state changes against CSRF | Submit creation, assignment, status and account forms without valid CSRF protection; requests fail | Not run |
| S-02 | Protect cloud traffic and sessions | Verify HTTPS, secure and HttpOnly session cookies, suitable SameSite settings and restricted allowed hosts | Not run |
| S-03 | Keep secrets and real personal data out of source and tests | Review tracked files and configuration; use environment secrets and synthetic fixtures | Not run |
| S-04 | Handle errors safely | Trigger a controlled internal error in a test environment; user gets generic response and protected logs contain diagnostic details without secrets | Not run |
| S-05 | Log required security events safely | Verify successful/failed login and status-change events with no passwords or complete recipient addresses | Not run |
| S-06 | Establish incident response | Document Admin contact, reporting within one hour, account lock procedure and evidence preservation | Not run |
| S-07 | Preserve cloud data | Restart/redeploy the application and verify database and private proof persistence; verify a documented backup restoration procedure | Not run |
| S-08 | Prevent cached private data disclosure | Inspect auth/private/tracking API cache headers and browser logout/back/account switching; check proxy/service-worker settings | Sensitive responses use no-store and private payloads do not persist in shared or persistent browser caches | Not run |
| S-09 | Restore cannot revive revoked access | Restore a backup containing a subsequently revoked session, reconcile account locks and attempt old-cookie use | Restored sessions purged; old cookie rejected; incident-affected accounts remain locked pending recovery | Not run |

## PostgreSQL RLS checks

These checks verify the selected database security design in addition to backend authorization. Execute them using the actual runtime database role, not a migration account or superuser.

| ID | Requirement | Verification | Actual result |
| --- | --- | --- | --- |
| RLS-01 | Runtime credentials cannot bypass policies | Inspect runtime role privileges, memberships, table ownership and enabled/forced RLS on protected tables | Not run |
| RLS-02 | Seller isolation holds without an application ownership filter | Under Seller A's verified context, issue an unfiltered parcel SELECT; Seller B's rows must remain absent | Not run |
| RLS-03 | Rider isolation holds for reads and writes | Under Rider B's context, attempt direct reads/updates to Rider A's parcels and proof metadata; no unauthorized data or changes | Not run |
| RLS-04 | Missing identity denies protected access | Query protected tables with no authenticated context; no private parcel rows or writes permitted | Not run |
| RLS-05 | Identity does not leak through pooled connections | Reuse one physical connection across Seller A, Seller B and anonymous transactions after commit and rollback; each retains only its intended access | Not run |
| RLS-06 | Writes cannot transfer ownership or escalate capabilities | Direct parcel/history/proof DML as app_runtime is denied; controlled functions reject forged seller_id, assigned_rider_id, actor IDs and unauthorized transitions | Not run |
| RLS-07 | Public tracking has narrowly scoped database access | Tracking role cannot SELECT private tables; its lookup returns only status/timestamps for the supplied token and cannot list all parcels | Not run |
| RLS-08 | Privileged tracking entry point is constrained | Inspect function owner, execution grants, safe search_path and parameterized implementation; unrelated roles cannot invoke it | Not run |
| RLS-09 | All privileged functions are hardened | Inspect domain/auth/maintenance/lookup function owners, privileges/search_path, runtime role memberships and temporary-object shadowing attempts | Only intended callers can execute; untrusted objects/roles cannot change function behavior or gain owner privileges | Not run |
| RLS-10 | Controlled finalization locking works with restricted runtime privileges | Attempt direct locking as app_runtime, then use lock_delivery_target in a real transaction and exercise stale/unauthorized/concurrent callers | Direct privileged locking is denied; controlled authorized locking works and remains held through finalization without broad runtime UPDATE | Not run |

## Proposed configuration values for review

These are implementation choices, not exact limits supplied by the lecturer:

- Tracking numbers: at least 128 random bits plus an optional fixed display prefix.
- Proof photo: one JPG or PNG per parcel, proposed 5 MiB maximum and a documented decoded-pixel limit. Validate bytes/content, decode and re-encode into an allowed image format, strip unnecessary metadata, assign a generated filename and retain private storage.
- Login limit: select and document account and source-based thresholds, observation window and cooldown. Ensure the limiter works across application workers and does not reset on every request.
- Public tracking limit: select and document per-source thresholds and window; avoid placing raw tracking tokens in general access logs.

Upload defense needs multiple controls rather than trusting the filename or Content-Type. See the [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Implement and test login and lookup throttling explicitly in the chosen backend. RLS role exceptions are described in [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Evidence to record after execution

For each test, record owner, application commit/version, environment or cloud URL, date/time, exact input/action, expected result, actual result, pass/fail and a screenshot or safe log reference. Use synthetic data. Do not mark a test passed based on code inspection alone when the expected result requires exercising a request.
