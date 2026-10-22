# ParcelTrack Lite complete project plan

Planning baseline revised on 22 October 2026: one full-stack Next.js/TypeScript application, PostgreSQL and private Storage in the full self-hosted Supabase Docker stack, local first. Cloud deployment is deferred. All modules have started Phase 1; [local results and remaining work](phase-1-progress.md) distinguish foundation code from later workflows. Group gates remain open. The separate React/Vite prototype is historical checkpoint evidence.

## Plans by owner

| Owner | Module plan (README, phases, test plan) | Scope |
| --- | --- | --- |
| Naszrul | [M1 Login and User Management](modules/module-1-auth/README.md): [phases](modules/module-1-auth/phases/PH1-foundation.md), [test plan](modules/module-1-auth/test-plan.md) | Accounts, sessions, permissions, password change, user administration, maintenance runner, local infrastructure and later release |
| Zikri | [M2 Parcel Registration and Public Tracking](modules/module-2-parcels/README.md): [phases](modules/module-2-parcels/phases/PH1-foundation.md), [test plan](modules/module-2-parcels/test-plan.md) | Database roles and RLS foundation, parcel creation, seller access/search, privacy-preserving tracking, retention |
| Syauqi | [M3 Delivery Update and Admin Dashboard](modules/module-3-delivery/README.md): [phases](modules/module-3-delivery/phases/PH1-foundation.md), [test plan](modules/module-3-delivery/test-plan.md) | Test harness, assignment, delivery outcomes, proof handling, dashboard, backup and restore |

Each owner delivers their module's backend, React screens, migrations, security tests and demonstration. The group delivers one integrated application, not three applications. Each module folder contains one detailed Markdown file per phase (PH1 to PH6) with tasks, dependencies, deliverables, tests and exit criteria.

Start here: [shared architecture and index](shared/README.md), [phase framework and group gates](shared/phase-framework.md), [dependency matrix](shared/dependency-matrix.md), [first execution sequence](shared/execution-sequence.md). The [shared system contract](shared/system-contract.md) is authoritative for API paths, payloads, status values, permissions and transaction rules. The [integration and deployment plan](shared/integration-and-deployment.md) defines deployment, backup and incident operations. [Initial ERD](initial-erd.md) and the [security test worksheet](security-tests.md) support these plans. The [testing strategy](shared/testing-strategy.md), [integration scenarios](shared/integration-tests.md), [workflow trace](shared/workflow-trace.md) and [traceability](shared/traceability.md) define and map the evidence. The [decision register](shared/decision-register.md) separates source requirements, confirmed decisions, proposals and external dependencies. [Independent review resolutions](review-resolutions.md) record gaps found and addressed before implementation.

## Product boundary

The completed system covers every function in case-study sections 4 and 5: Seller registration and accounts; Seller parcel registration and own-parcel search; public status tracking; Admin user management and Rider assignment; assigned Rider updates and one proof image; and Admin counts for all five statuses. It also enforces policies P1 to P5 and provides a cloud demonstration and security test record for each member.

Payments, courier integrations, maps/GPS, notifications, a mobile app, account recovery by email, multiple proof images, redelivery after a final outcome and multiple organizations are outside this scope. Excluding them does not remove a listed case-study function. Reassignment of an unfinished parcel is included so disabling a departed Rider cannot strand delivery work.

## Architecture

One Next.js application owns M1/M2/M3 pages, Route Handlers and server services. The full Supabase Docker stack runs locally with PostgreSQL, a private Storage bucket and its standard supporting services; a separate private TypeScript runner handles jobs. Cloud hosting is decided after local integration. See the [shared architecture](shared/README.md#single-architecture) and the contract for the code layout and privilege model.

## Delivery phases

Every module plan uses the same six phases and identifiers. The earlier labels P0 to P5 were replaced because they collided with case-study policies P1 to P5.

| Phase | Work | Group gate |
| --- | --- | --- |
| PH1 Foundation and shared contracts | Next.js skeleton, full local Supabase Compose, app-role bootstrap, migrations 0001-0003, harness, fixtures, constants, DTOs, auth interface, contract v3 | G1: clean checkout starts, runtime roles cannot bypass RLS, CI green |
| PH2 Initial working checkpoint slice | M1 real login/logout; M2 parcel registered and listed under RLS; M3 assigned parcel moved to Out for Delivery; security baseline active | G2: INT-CP-01 to INT-CP-03 |
| PH3 Complete module functionality | All module functions and screens, public tracking, assignment/reassignment, final outcomes/photo, password and user administration | G3: successful and Failed journeys, no temporary substitutes |
| PH4 Security, failure handling and regression | Full authorization matrix, RLS suites, races, fault injection, upload corpus, retention job, local backup/restore, CI gates | G4: all worksheet rows pass locally |
| PH5 Integrated cloud deployment and operations | Later chosen cloud host: HTTPS, full Supabase Docker persistence, private administration, backups/jobs and repeated journeys | G5a: all roles on the live URL, restart and rollback proven; G5b: extended operations |
| PH6 Final acceptance, evidence and demonstration | Release-candidate regression, security test document, rehearsals, individual explanations | G6: documented evidence and demonstration readiness |

Details, entry and exit criteria, and the per-member milestone matrix are in the [phase framework](shared/phase-framework.md). PH2 is the 22 October checkpoint target, not the whole-project definition of done. Source documents set the final submission at Week 14; no invented calendar date is assigned here. Phases can overlap only under the framework's overlap rule; a module is not complete until its own exit criteria and the group gates pass.

Work is tiered MUST, SHOULD or STRETCH ([priority tiers and cut line](shared/phase-framework.md#priority-tiers-and-cut-line)); gates G3 to G6 pass on MUST and SHOULD, STRETCH items are reported honestly and never block. Gate G5 is split into a rubric-critical minimum G5a (HTTPS cloud deployment, all roles online, restart persistence, rollback) and extended operations G5b.

Write and run tests with each feature from PH1 onward. Authentication, authorization, input validation, safe session handling and basic RLS are part of the first working slices; PH4 expands and verifies them rather than postponing all security. No unfinished slice is exposed publicly without its required access and privacy controls.

## Whole-project completion criteria

A criterion is checked only with a linked passing result. The group gates in the framework define the exact evidence.

- [ ] G1 to G6 each passed and recorded by all three owners.
- [ ] All feature IDs in the three module plans have working UI and API evidence (G3).
- [ ] The single role matrix is enforced on direct requests, not only navigation (authorization matrix, M1-PH4-TC01).
- [ ] RLS tests run under deployed runtime credentials and include connection reuse/rollback (OPS-08, INT-08).
- [ ] Successful and Failed workflows preserve current status, history and proof consistency (INT-02, INT-03, INT-10).
- [ ] User disablement blocks old sessions and unfinished work can be reassigned (INT-05).
- [ ] All security worksheet rows have actual results, safe evidence and owner names; each member covers more than five distinct input types (G6).
- [ ] Retention, incident handling, backups and restoration have documented and exercised procedures (INT-11, INT-12).
- [ ] A clean checkout and cloud deployment are reproducible with migrations and supplied secret configuration (INT-12).
- [ ] HTTPS cloud demo works for Seller, Rider, Admin and public users; local-only delivery is not the planned finish (G5a).
- [ ] No real recipient data, usable test passwords or deployment secrets are committed.
- [ ] Each member can explain their own code and security decisions in the final demonstration (G6).
- [ ] Unit/component, API/PostgreSQL and core browser suites pass the testing strategy gates, with operational restore/maintenance evidence before cloud release (G4, G5).
- [ ] Naszrul's lecturer allocation-sheet submission and the variation notice are recorded with real evidence or as unverified (EXT-01, EXT-02).

## Remaining decisions and external dependencies

Tracked in the [decision register](shared/decision-register.md). In summary:

1. Full-stack Next.js and PostgreSQL replace the frameworks/databases explicitly named in the brief (D-01). The team selected them; lecturer acceptance is unverified (EXT-02).
2. Local Next.js with full Supabase Docker is the immediate target. Cloud provider, full-stack host, sizing, budget, domain/TLS and backup destination remain deferred under EXT-04; no resources are provisioned by this work.
3. The prepared PR-only branch protection has not been applied (EXT-03); Naszrul needs repository administration access.
4. Full names and matric numbers are needed for the lecturer's allocation sheet and test document (EXT-05); allocation submission is unverified (EXT-01).
5. Open design points: secrets location (D-10), local gateway exposure and later TLS choice (D-11), runtime versions (D-21), incident contact and backup key custody (EXT-06, EXT-07).

Proof read access, Failed-parcel retention, operational limits and reassignment rules are explicit design choices in the shared contract (D-04, D-06, D-18). They are the implementation baseline unless the group changes the contract through review; they are not claims that the lecturer specified those details.

## Requirement coverage

| Source | Plan coverage |
| --- | --- |
| Case study 4.1 | M1-F01 through M1-F05 |
| Case study 4.2 | M2-F01 through M2-F04 |
| Case study 4.3 | M3-F01 through M3-F05 |
| Case study 5 access matrix | Shared authorization and API tables; [traceability section A](shared/traceability.md#a-functional-requirements-case-study-sections-4-and-5) |
| Case study 8 threats and 9 policies | Module security sections, RLS design, [traceability sections D and E](shared/traceability.md#d-policies-p1-to-p5), security worksheet and operational runbooks |
| Rubric deployment/integration | PH5 and gate G5 |
| Rubric security controls, testing and demonstration | Per-module acceptance, evidence worksheet, PH4 and PH6, [traceability sections B and C](shared/traceability.md#b-rubric-criteria) |

Reference documents are included at the repository root: ParcelTrack_Lite_Case_Study.docx, Rubric_Project_STTCK3033_ParcelTrack_Lite (1).docx and ParcelTrack Lite Project Briefing.pptx. This plan covers their final-project scope; [checkpoint preparation](checkpoint-plan.md) covers the 22 October reporting separately.
