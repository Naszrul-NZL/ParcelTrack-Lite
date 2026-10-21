# Independent plan review and resolutions

Reviewed on 21 October 2026 by three independent subagents, followed by primary-agent review and document updates. Review scopes were source requirements/rubric coverage, security/data consistency, and implementation/integration/AWS feasibility. No core case-study function was identified as missing. The review found specification gaps below and they have been addressed in the plans.

This is a planning review, not a security scan of executable code. Addressed in plan does not mean implemented or tested. All application tests remain Not run.

| ID | Gap identified | Plan resolution | Required implementation evidence |
| --- | --- | --- | --- |
| REV-01 | app_runtime had no UPDATE grant but the upload workflow expected direct row locking | M3 uses narrow lock_delivery_target under domain_writer within the caller's transaction; no broad UPDATE grant | RLS-10, IT-D02/D03 and concurrent reassignment/finalization |
| REV-02 | Privileged function hardening was explicit only for public tracking | All domain/auth/maintenance/lookup SECURITY DEFINER functions use safe search_path, qualified references and atomic PUBLIC revocation/narrow grants | RLS-09 catalog/grant/shadowing tests |
| REV-03 | Restoring a database could revive revoked sessions/older account state | Purge all restored sessions, reconcile incident locks/credential changes and require fresh login before reopening | S-09 and actual restore with a previously revoked cookie |
| REV-04 | Private APIs lacked an explicit system-wide HTTP cache rule | All auth/private/tracking APIs use no-store; proxy/service-worker/persistent private caching is prohibited | S-08 headers and browser logout/account-switch checks |
| REV-05 | Login could verify old credentials then attach a new account session version | Recheck the verified hash/version under lock before issuance; last-seen update cannot upsert a revoked session | M1-11 coordinated login/password/disablement/refresh races |
| REV-06 | Fresh-deployment steps attempted migrations before starting the database | Start PostgreSQL, await readiness, bootstrap roles, migrate, privately provision Admin, then start API/proxy | Empty-volume first-boot CI/operations test |
| REV-07 | Creation/ownership/seeding lifecycle for database roles was unspecified | Separate operator cluster bootstrap, migration credential, runtime pools, test provisioner and private operations credential | Fresh/existing-volume bootstrap and actual runtime-role assertions |
| REV-08 | Required retention had an optional runner; backups did not drain other writers | Require scheduler before release and pause/drain uploads/maintenance under a shared backup lock | Scheduled-job/retry tests and backup near a cleanup boundary |
| REV-09 | Automated layers, fixture isolation and per-feature test mapping were too broad | Added full test strategy, real PostgreSQL roles, independent request cleanup/isolation, unit/component matrices, browser/operations suites and CI gates | Executable reports mapped to every feature/security/INT ID |
| REV-10 | Incident policy required locking affected accounts but the web endpoint excludes Admins | Private ops_runtime lock/recovery commands handle every role without expanding public Admin powers | M1-12 private Admin lock/recovery and cookie rejection |
| REV-11 | Checkpoint outline still promised later public tracking/photo features | Outline now demonstrates only P1 flows and labels later functions as planned | Truthful checkpoint evidence tied to the demonstrated version |
| REV-12 | Allocation sheet completion was listed without an explicit submission gate | NASZ owns Week 5 submission, starter-kit declaration if applicable and retained receipt | Actual lecturer submission evidence; status remains unverified |
| REV-13 | File compensation did not distinguish rollback from lost acknowledgment or an original transaction still in progress | Preserve unknown-outcome files; acquire the same parcel lock through maintenance to establish resolution, then inspect fresh committed references before cleanup | IT-D03 delayed-original-commit/response-failure test and INT-10 |

## Current reviewed documents

- [Project ownership scope and completion criteria](project-plan.md)
- [Shared data API security and state contract](shared/system-contract.md)
- [Integration AWS recovery and incident plan](shared/integration-and-aws.md)
- [Automated testing strategy and feature mapping](shared/testing-strategy.md)
- [M1 plan](modules/module-1-auth/README.md), [M2 plan](modules/module-2-parcels/README.md), [M3 plan](modules/module-3-delivery/README.md)
- [ERD](initial-erd.md), [security worksheet](security-tests.md) and [checkpoint plan](checkpoint-plan.md)

## Remaining external dependencies

Actual lecturer acceptance of the team's framework/database variation, allocation submission, full assessment identities, AWS account/domain/budget details and GitHub branch-protection administration remain external dependencies. They were not resolved by editing the plan. CI checks and test code must be implemented before they can be enforced or counted as passing.
