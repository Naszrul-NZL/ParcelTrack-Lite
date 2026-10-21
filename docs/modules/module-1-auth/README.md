# Module 1 Login and User Management

Owner: NASZ, GitHub Naszrul-NZL. Deliver the FastAPI auth module and React auth feature. This is the complete module plan, including work after the initial checkpoint.

Read the [shared contract](../../shared/system-contract.md), [integration plan](../../shared/integration-and-aws.md) and [security worksheet](../../security-tests.md). The shared contract owns exact payloads, role names, limits and errors; do not create alternative definitions in this module.

Implement the M1 unit/API/component/browser suites and feature mapping in the [automated testing strategy](../../shared/testing-strategy.md). Add tests with each work package; they are not deferred until the end.

## Required functionality

| Feature ID | Function | Observable finished behavior |
| --- | --- | --- |
| M1-F01 | Seller self-registration | Valid public registration creates only a Seller; duplicate/invalid usernames and invalid passwords fail safely |
| M1-F02 | Login and logout for all roles | Seller, Rider and Admin authenticate, get the correct landing page, and lose access after logout/session expiry |
| M1-F03 | Admin creates Rider accounts | Admin creates a Rider with a privately supplied initial password; first login requires a password change |
| M1-F04 | Change password | Current password is verified, new password meets policy, all old sessions are revoked, and new login is required |
| M1-F05 | User management and disablement | Admin lists Seller/Rider accounts, disables/reactivates them, and inspects safe audit events; disabled accounts cannot use an existing session |

Admin provisioning is a private deployment command. There is no public Admin registration, arbitrary role editing or account deletion. Password recovery, email verification and social login are not required project features.

## Interfaces and routes

- /register: username, display name, password and confirmation. Client confirmation is for usability; the server validates the actual password independently. Explain application-specific password uniqueness.
- /login: username/password, generic failure message and throttling feedback. Successful login uses the server's role; do not let the user select an authoritative role.
- /account/password: current/new/confirm inputs, change-success message and return to login. Required-first-change Riders are kept here until successful.
- /admin/users: paginated role/active filters; create-Rider form; disable/reactivate confirmation identifying the target; view safe audit events through an Admin-only panel.
- Shared session provider and route guards: authenticated loading state, expired-session handling, role landing pages and must-change-password redirect.

Forms support keyboard use, visible labels, field errors and pending states. Passwords are cleared on submission completion and never appear in logs, notification text or URLs. A disabled account message can be shown in Admin management; public login remains generic.

## API and source ownership

Own A01 through A09 and A20 in the [endpoint table](../../shared/system-contract.md#endpoint-ownership). Implement backend/app/modules/auth and frontend/src/features/auth, plus the shared session provider, CSRF-aware client plumbing and security dependencies consumed by M2/M3.

Own app_user, auth_session and rate_limit_bucket definitions and the schema for audit_event. Zikri integrates the migration order; Qee and Zikri write their own event producers. Keep audit insertion a shared service with an allowlisted event schema. Export only Principal/UserSummary DTOs; never serialize the ORM user record automatically.

### Shared services delivered to the team

| Service | Consumer | Contract |
| --- | --- | --- |
| require_authenticated | M2 and M3 | Returns an active principal with ID, role and validated session version, or safe 401 |
| require_role | M2 and M3 | Enforces the role server-side; UI guards are supplemental |
| verify_csrf | Every mutation and tracking POST | Checks synchronizer token and request origin; returns consistent 403 |
| password service | Registration, Rider creation, password change and bootstrap | Argon2id hash/verify through maintained library |
| audit service | All modules | Controlled safe event creation with actor, target, request ID and timestamp |
| active Rider directory | Qee assignment UI/service | Admin-only A07 role=RIDER,isActive=true, with server-side revalidation during assignment |

## Implementation work packages

1. **M1-W01 Schema and bootstrap:** normalized unique usernames, fixed roles, active flag, version fields and session storage. Add one-time Admin bootstrap and synthetic local fixtures with privately supplied credentials. Duplicate bootstrap must not create extra Admins.
2. **M1-W02 Shared dependency:** resolve session digest, expiry, account active state and session_version. Separate unauthenticated from wrong-role errors. Protected services recheck account state within their write transaction.
3. **M1-W03 Registration and credential service:** enforce shared limits, Argon2id, no submitted role escalation, safe uniqueness-race handling and transactional account/audit creation. Use a dummy password hash verification path for nonexistent accounts to reduce timing differences.
4. **M1-W04 Session lifecycle:** implement CSRF bootstrap, login rotation, idle/absolute expiry, logout revocation, no-store responses and production cookie flags. Recheck the verified hash/session-version snapshot under an account lock before session issuance. Last-seen refresh is update-only and cannot recreate a revoked session. Rate limits are shared PostgreSQL state and apply to invalid and unknown users consistently.
5. **M1-W05 User management:** list safe DTOs, create password-change-required Riders, disable/reactivate Seller/Rider targets with expectedVersion, increment session_version and audit changes. Reject Admin targets through the web endpoint.
6. **M1-W06 Password change:** require valid current credentials, apply password policy, clear must_change_password, increment user/session versions and invalidate every session. Do not log the new password or automatically re-authenticate.
7. **M1-W07 React screens:** build all routes against the same API client. Clear private caches on identity changes and test navigation after refresh/back-button use. Hide links by role while keeping server checks authoritative.
8. **M1-W08 Audit and incident procedure:** Admin-only paginated audit viewer. Add private ops_runtime lock/recovery commands for every role, including compromised Admins, with session invalidation/audit and no public endpoint. Document reporting within one hour, operational credential access and recovery authority. Coordinate timestamp/event identifiers with M2/M3.
9. **M1-W09 Evidence and cloud acceptance:** complete module/security tests, rehearse on the AWS URL and explain the auth/session code personally.

## Security and policies

P1 is enforced by fixed account roles, server-side permissions, no shared accounts and immediate disablement. P2 is enforced through the password service and user guidance; cross-site password reuse cannot be reliably detected. P5 is enforced by LOGIN_SUCCEEDED, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED, USER_CREATED and USER_STATUS_CHANGED events, excluding secrets and complete addresses. P4 applies to all code, configuration, data fixtures and error responses.

User input never becomes SQL syntax. Prevent login enumeration through generic errors, safe validation and rate limits. Sessions are server-side and revocable. React route guards do not replace role checks. A malicious self-registration request with role=ADMIN is rejected as an unknown field or handled only through the server-defined Seller role.

Rate-limit counters and failed-login audit events must survive a rejected login; do not roll them back in the same failed credential transaction. Successful session creation and its success audit must commit before returning success. If the authentication store is unavailable, reject authentication rather than issuing an untracked session.

## Integration edge cases

- When an Admin disables a Rider, do not delete the Rider or change any parcel state. Qee flags and reassigns their unfinished parcels; history keeps the original actor reference.
- A role or active flag cached by React or an old session cannot override the latest account record. An old tab receives 401 after password change/disablement.
- First-password-change restrictions apply to direct M2/M3 calls too, not only screen routing.
- Account status update uses expectedVersion so two Admin tabs cannot silently overwrite each other. React refreshes after 409.
- Login issues a new CSRF token. Replace the client token before any subsequent write. Expired/invalid tokens cannot cause an automatic replay of an account/parcel mutation.

## Testing and acceptance

Execute M1-01 through M1-12, shared S-01 through S-06 plus S-08/S-09, and relevant integration tests. Add these feature checks:

- Register a valid Seller; demonstrate duplicate username, malformed username, short/common password and role-injection rejection.
- Authenticate each role; refresh the browser and confirm persistence; log out and retry the old cookie directly.
- Verify anonymous-session fixation resistance, authenticated idle/absolute expiry and CSRF rejection on login/logout/password/user updates.
- Create a Rider, confirm restricted first login, change its password, then log in using the new password.
- Disable a logged-in Rider and Seller; both existing and new sessions fail. Reactivation requires a fresh login and does not revive revoked sessions.
- Submit password change with a wrong current password; then change it correctly and prove all other device sessions fail.
- Coordinate login/password-change, login/disablement and logout/last-seen-refresh races; no old credential or deleted session may regain access. Privately lock/recover an Admin and verify its old cookies remain invalid.
- Inspect safe audit outputs and database hash format privately. Trigger generic errors without exposing credential input.

Use real PostgreSQL for integration tests; an in-memory database does not prove production constraints or shared limiter behavior. Record input, expected result, actual result, evidence and NASZ's name. More than five input types must be demonstrated for the rubric's highest testing band.

### Checkpoint slice

Seeded account login, one protected page, failed login and logout using real session storage. Registration, full user administration and the complete hardening suite can follow in later phases; the checkpoint slice is not M1 completion.

### Module definition of done

- [ ] M1-F01 through M1-F05 work through React and direct API requests.
- [ ] A01 through A09 and A20 follow the shared payload/error contract.
- [ ] M2/M3 use the same auth, CSRF and role dependencies without local alternatives.
- [ ] All session, password, disablement, rate-limit and audit checks have passing evidence.
- [ ] M1 unit/component and real-PostgreSQL/API suites meet the testing strategy, including incident commands and credential/session races.
- [ ] Account migrations/fixtures work in a clean local stack and the AWS deployment.
- [ ] NASZ can demonstrate blocked attacks and explain the implementation within the final individual demo.
