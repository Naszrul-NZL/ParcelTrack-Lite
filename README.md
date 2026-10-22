# ParcelTrack Lite

Secure parcel tracking coursework for STTCK3033, based on the RapidExpress case study.

## Team allocation

| Member | GitHub | Module |
| --- | --- | --- |
| Naszrul | [Naszrul-NZL](https://github.com/Naszrul-NZL) | M1 Login and User Management |
| Zikri | [Zikri809](https://github.com/Zikri809) | M2 Parcel Registration and Public Tracking |
| Syauqi | [Qee110](https://github.com/Qee110) | M3 Delivery Update and Admin Dashboard |

Allocation confirmed by the team on 21 October 2026. Database design, layout and integration are shared responsibilities.

## Checkpoint preparation

- [Week 5 presentation, report and runnable interface demo](deliverables/week-5-checkpoint/README.md)
- [React prototype source and run instructions](checkpoint-demo/README.md)

The checkpoint prototype uses synthetic browser data. The root Next.js app now has the local Phase 1 foundation; the complete parcel journey and cloud acceptance gates remain open.

- [Deliverable plan for 22 October](docs/checkpoint-plan.md)
- [Initial ERD and data rules](docs/initial-erd.md)
- [Security requirements and test worksheet](docs/security-tests.md)

## Complete implementation plans

Six shared phases (PH1 foundation, PH2 checkpoint slice, PH3 complete functionality, PH4 security and regression, PH5 cloud operations, PH6 final acceptance) with group gates G1 to G6.

- [Project plan and completion criteria](docs/project-plan.md)
- [Shared architecture and document index](docs/shared/README.md)
- [Phase framework, milestone matrix and gates](docs/shared/phase-framework.md)
- [Dependency matrix and handoffs](docs/shared/dependency-matrix.md)
- [First execution sequence for each member](docs/shared/execution-sequence.md)
- Naszrul M1: [plan and phases](docs/modules/module-1-auth/README.md), [test plan](docs/modules/module-1-auth/test-plan.md)
- Zikri M2: [plan and phases](docs/modules/module-2-parcels/README.md), [test plan](docs/modules/module-2-parcels/test-plan.md)
- Syauqi M3: [plan and phases](docs/modules/module-3-delivery/README.md), [test plan](docs/modules/module-3-delivery/test-plan.md)
- [Shared API data and security contract](docs/shared/system-contract.md)
- [Integration scenarios](docs/shared/integration-tests.md) and [whole-project workflow trace](docs/shared/workflow-trace.md)
- [Requirement to phase, task and test traceability](docs/shared/traceability.md)
- [Integration and deployment operations plan](docs/shared/integration-and-deployment.md)
- [Unit, integration, browser and recovery test strategy](docs/shared/testing-strategy.md)
- [Decision register and external dependencies](docs/shared/decision-register.md)
- [Independent plan review and resolutions](docs/review-resolutions.md)

Run `python tools/check_plan_docs.py` to validate links, identifiers, ownership, phase ordering and the generated test indexes in the plan documents.

The implementation baseline is **one full-stack Next.js App Router application in TypeScript, developed locally against the full self-hosted Supabase Docker stack**. The Phase 1 foundation includes PostgreSQL/RLS, private Storage, pg transactions, migrations, shared Zod schemas, Sharp and Argon2id. Start with the [local runbook](docs/local-development.md) and [Phase 1 progress/evidence](docs/phase-1-progress.md). Cloud hosting follows local acceptance.

Next.js and PostgreSQL are the team's selected alternatives to the framework/database combinations named in the lecturer's brief. Lecturer acceptance remains unrecorded. Local RLS checks pass; the full security worksheet remains to be executed as the remaining workflows are implemented.

## Current status

All three modules have local Phase 1 code on `codex/phase1-foundation`: the Next.js shell and auth primitives (M1), roles/migrations/RLS/shared parcel contracts (M2), and delivery rules, private Storage, image validation and test harness (M3). The full default Supabase stack runs locally. Login, registration, parcel operations, proof routes and dashboards are later phases; the new app labels these boundaries explicitly. CI definitions exist but have not run on GitHub, owner reviews remain pending, and G1 is not yet signed off.

Run the root app with the [local runbook](docs/local-development.md). The historical interface remains in `checkpoint-demo/` with its own instructions and six frontend domain tests; its packaged slides/report remain checkpoint evidence.

The lecturer's briefing, case study and rubric are included at the repository root. Office temporary files, local demo dependencies/builds and private artifact verification outputs are ignored. The planning documents distinguish source requirements from proposed implementation choices.
