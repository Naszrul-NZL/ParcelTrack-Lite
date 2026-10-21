# Module 1 Login and User Management

Owner: Naszrul, GitHub Naszrul-NZL. Deliver the FastAPI auth module and React auth feature. This folder is the module's complete phased plan, including work after the 22 October checkpoint. Everything here is a reviewable plan; no application code or test has been written or run.

Read the [shared contract](../../shared/system-contract.md), the [phase framework](../../shared/phase-framework.md), the [dependency matrix](../../shared/dependency-matrix.md) and the [security worksheet](../../security-tests.md). The shared contract owns exact payloads, role names, limits and errors; do not create alternative definitions in this module.

## Contents of this folder

| File | Purpose |
| --- | --- |
| [phases/PH1-foundation.md](phases/PH1-foundation.md) | Skeleton, configuration, `app_user`/`auth_session` migration, `lock_active_actor`, password service, API client |
| [phases/PH2-checkpoint-slice.md](phases/PH2-checkpoint-slice.md) | Real server-side login, logout, CSRF, rate limit, audit; retires the test principal |
| [phases/PH3-complete-functionality.md](phases/PH3-complete-functionality.md) | Registration, Rider creation, password change, user management, audit viewer, maintenance runner skeleton |
| [phases/PH4-hardening-regression.md](phases/PH4-hardening-regression.md) | Full authorization matrix, session/CSRF/race suites, incident commands, headers, regression |
| [phases/PH5-aws-operations.md](phases/PH5-aws-operations.md) | EC2, proxy, TLS, secrets, first boot, release and rollback, cloud verification |
| [phases/PH6-final-acceptance.md](phases/PH6-final-acceptance.md) | Release-candidate regression, test document, demo, allocation evidence |
| [test-plan.md](test-plan.md) | Test coverage by feature, requirement, phase and test case |

## Required functionality

| Feature ID | Function | Observable finished behavior | Works partially | Complete and tested |
| --- | --- | --- | --- | --- |
| M1-F01 | Seller self-registration | Valid public registration creates only a Seller; duplicate/invalid usernames and invalid passwords fail safely | PH3 | PH4 |
| M1-F02 | Login and logout for all roles | Seller, Rider and Admin authenticate, get the correct landing page, and lose access after logout/session expiry | PH2 | PH4 |
| M1-F03 | Admin creates Rider accounts | Admin creates a Rider with a privately supplied initial password; first login requires a password change | PH3 | PH4 |
| M1-F04 | Change password | Current password is verified, new password meets policy, all old sessions are revoked, and new login is required | PH3 | PH4 |
| M1-F05 | User management and disablement | Admin lists Seller/Rider accounts, disables/reactivates them, and inspects safe audit events; disabled accounts cannot use an existing session | PH3 | PH4 |

Admin provisioning is a private deployment command. There is no public Admin registration, arbitrary role editing or account deletion. Password recovery, email verification and social login are not required project features.

## Phase overview

| Phase | Objective | Key tasks | Depends on | Exit |
| --- | --- | --- | --- | --- |
| PH1 | Buildable skeleton and shared auth foundation | T01-T03 skeleton, T06-T07 migration and actor lock, T08 interface, T10 passwords | Zikri's roles and Alembic base (H02) | G1 |
| PH2 | Real login/logout slice with security baseline | T02-T06 sessions, CSRF, login, rate limit; T09 retire TMP-01; T10 UI; T12 matrix | H07, H10, H11 | G2 |
| PH3 | All five features and the runner skeleton | T01-T07 endpoints, T08-T09 screens, T10 runner and maintenance gate, T12 walking-skeleton AWS deployment | Syauqi's consumption of A07/A09 | G3 |
| PH4 | Prove controls under hostile and concurrent conditions | T01 matrix, T02-T04 suites, T05 incident commands, T07 headers, T08 canary scan | Rows from Zikri/Syauqi (H43) | G4 |
| PH5 | AWS deployment and operations | T01-T04 stack and first boot, T06 HTTPS cookies, T07 release, T12 client IP | EXT-04, H51, H52 | G5 |
| PH6 | Final evidence and demonstration | T02 test document, T04 demo, T06 allocation evidence | G5 | G6 |

## What M1 provides to the others

| Handoff | Consumer | Phase |
| --- | --- | --- |
| H01 skeleton/Compose; H03 migration 0002 and `lock_active_actor`; H04 auth interface; H05 error/log conventions; H06 API client; H14 password service | Zikri, Syauqi | PH1 |
| H20 real sessions and `login_as`; H21 rate-limit and audit services; H24 authorization-matrix harness | Zikri, Syauqi | PH2 |
| H30 Rider directory (A07); H31 disablement (A09); H32 must-change gate (PH2 dependency, full tests PH3); H33 maintenance runner and gate | Syauqi, Zikri | PH3 |
| H42 private lock/recover/purge-sessions commands | Syauqi, Zikri | PH4 |
| H50 AWS stack, proxy, secrets, first boot; H53 client-IP trust | Zikri, Syauqi | PH5 |

## What M1 consumes

H02 roles/Alembic/function template, H07 `unit_of_work`, H08 constants, H10 harness, H11 fixtures (PH1/PH2); H13 backup-lock design, H41 backup lock and H43 matrix rows (PH3/PH4); H51, H52, H54 (PH5). Substitutes while waiting are listed in the [handoff register](../../shared/dependency-matrix.md#handoff-register).

## Interfaces and routes

- /register: username, display name, password and confirmation. Client confirmation is for usability; the server validates the actual password independently. Explain application-specific password uniqueness.
- /login: username/password, generic failure message and throttling feedback. Successful login uses the server's role; do not let the user select an authoritative role.
- /account/password: current/new/confirm inputs, change-success message and return to login. Required-first-change Riders are kept here until successful.
- /admin/users: paginated role/active filters; create-Rider form; disable/reactivate confirmation identifying the target; view safe audit events through an Admin-only panel.
- Shared session provider and route guards: authenticated loading state, expired-session handling, role landing pages and must-change-password redirect.

Forms support keyboard use, visible labels, field errors and pending states. Passwords are cleared on submission completion and never appear in logs, notification text or URLs. A disabled account message can be shown in Admin management; public login remains generic.

## API and source ownership

Own A01 through A09 and A20 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Implement backend/app/modules/auth and frontend/src/features/auth, plus the shared session provider, CSRF-aware client plumbing, security dependencies and maintenance runner consumed by M2/M3.

Own app_user, auth_session, rate_limit_bucket, system_state and audit_event definitions (migration 0002). Zikri adds the audit-to-parcel foreign key in 0003; Syauqi and Zikri write their own event producers through the audit event-type list in the contract. Export only Principal/UserSummary DTOs; never serialize the ORM user record automatically.

### Shared services delivered to the team

| Service | Consumer | Contract | Delivered |
| --- | --- | --- | --- |
| require_authenticated | M2 and M3 | Returns an active principal with ID, role and validated session version, or safe 401; enforces the must-change gate | interface PH1 (H04), real PH2 (H20), gate PH3 (H32) |
| require_role | M2 and M3 | Enforces the role server-side; UI guards are supplemental | PH2 |
| verify_csrf | Every mutation (the read-only tracking POST checks only the origin) | Checks synchronizer token and request origin; returns consistent 403 | PH2 |
| principal_uow | M2 and M3 | Verified principal plus transaction-scoped RLS context from Zikri's `unit_of_work` | PH2 |
| password service | Registration, Rider creation, password change, bootstrap, fixtures | Argon2id hash/verify through maintained library | PH1 (H14) |
| rate-limit and audit services | All modules | Atomic PostgreSQL counters; allowlisted audit events | PH2 (H21) |
| active Rider directory | Syauqi assignment UI | Admin-only A07 role=RIDER,isActive=true, revalidated by the database during assignment | PH3 (H30) |
| maintenance runner | Zikri, Syauqi | Job registry, advisory locks, backup-lock check | skeleton PH3 (H33), jobs PH4 |
| private operations commands | Operators, Syauqi's restore drill | Lock/recover any account, purge sessions | PH4 (H42) |

## Work package map

Earlier drafts used work packages; they map to phase tasks as follows.

| Work package | Phase tasks |
| --- | --- |
| M1-W01 Schema and bootstrap | M1-PH1-T06, T07, M1-PH2-T01, M1-PH5-T04 |
| M1-W02 Shared dependency | M1-PH1-T08, M1-PH2-T06, T08, M1-PH3-T05 |
| M1-W03 Registration and credential service | M1-PH1-T10, M1-PH3-T03 |
| M1-W04 Session lifecycle | M1-PH2-T02 to T05, M1-PH4-T02 to T04 |
| M1-W05 User management | M1-PH3-T01, T02, T04 |
| M1-W06 Password change | M1-PH3-T06 |
| M1-W07 React screens | M1-PH2-T10, M1-PH3-T08, T09 |
| M1-W08 Audit and incident procedure | M1-PH2-T07, M1-PH3-T07, M1-PH4-T05, T11 |
| M1-W09 Evidence and cloud acceptance | M1-PH5, M1-PH6 |

## Security and policies

P1 is enforced by fixed account roles, server-side permissions, no shared accounts and immediate disablement. P2 is enforced through the password service and user guidance; cross-site password reuse cannot be reliably detected. P5 is enforced by LOGIN_SUCCEEDED, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED, USER_CREATED, USER_STATUS_CHANGED, ACCOUNT_LOCKED and ACCOUNT_RECOVERED events, excluding secrets and complete addresses. P4 applies to all code, configuration, data fixtures and error responses.

User input never becomes SQL syntax. Prevent login enumeration through generic errors, safe validation and rate limits. Sessions are server-side and revocable. React route guards do not replace role checks. A malicious self-registration request with role=ADMIN is rejected as an unknown field.

Rate-limit counters and failed-login audit events must survive a rejected login; do not roll them back in the same failed credential transaction. Successful session creation and its success audit must commit before returning success. If the authentication store is unavailable, reject authentication rather than issuing an untracked session.

## Integration edge cases

- When an Admin disables a Rider, do not delete the Rider or change any parcel state. Syauqi flags and reassigns their unfinished parcels; history keeps the original actor reference.
- A role or active flag cached by React or an old session cannot override the latest account record. An old tab receives 401 after password change/disablement.
- First-password-change restrictions apply to direct M2/M3 calls too, not only screen routing.
- Account status update uses expectedVersion so two Admin tabs cannot silently overwrite each other. React refreshes after 409.
- Login issues a new CSRF token. Replace the client token before any subsequent write. Expired/invalid tokens cannot cause an automatic replay of an account/parcel mutation.
- After a database restore every session is purged and recorded lock operations are re-applied (M1-PH4-T05, M1-PH5-T08).

## Testing and acceptance

All M1 tests are listed per phase in the phase files and aggregated in [test-plan.md](test-plan.md). Execute worksheet rows M1-01 through M1-12 and the M1 shares of S-01 to S-06, S-08, S-09. Use real PostgreSQL for integration tests; an in-memory database does not prove production constraints or shared limiter behavior. Record input, expected result, actual result, evidence and Naszrul's name. More than five input types must be demonstrated for the rubric's highest testing band.

### Checkpoint slice versus completion

The checkpoint slice is M1-PH2: seeded account login, one protected page per role, failed login and logout using real session storage. It is not M1 completion. Registration, user administration, password change and the hardening suites follow in PH3 and PH4.

### Module definition of done

Tick a box only with a linked passing result from the stated phase.

- [ ] PH1 exit criteria met (G1): skeleton, 0002, `lock_active_actor`, password service, interface, API client.
- [ ] PH2 exit criteria met (G2): real login/logout/CSRF/rate limit/audit; TMP-01 retired.
- [ ] M1-F01 through M1-F05 work through React and direct API requests (G3).
- [ ] A01 through A09 and A20 follow the shared payload/error contract (CT-03).
- [ ] M2/M3 use the same auth, CSRF and role dependencies without local alternatives.
- [ ] All session, password, disablement, rate-limit, race, incident-command and audit checks pass (G4); M1-01 to M1-12 have actual results.
- [ ] M1 unit/component and real-PostgreSQL/API suites meet the testing strategy gates, including the authorization matrix.
- [ ] Account migrations/fixtures work in a clean local stack and the AWS deployment (G5).
- [ ] Naszrul can demonstrate blocked attacks on the cloud URL and explain the implementation within the individual demo (G6).
