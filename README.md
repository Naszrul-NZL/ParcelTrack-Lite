# ParcelTrack Lite

Secure parcel tracking coursework for STTCK3033, based on the RapidExpress case study.

## Team allocation

| Member | GitHub | Module |
| --- | --- | --- |
| NASZ | [Naszrul-NZL](https://github.com/Naszrul-NZL) | M1 Login and User Management |
| Zikri | [Zikri809](https://github.com/Zikri809) | M2 Parcel Registration and Public Tracking |
| Qee | [Qee110](https://github.com/Qee110) | M3 Delivery Update and Admin Dashboard |

Allocation confirmed by the team on 21 October 2026. Database design, layout and integration are shared responsibilities.

## Checkpoint preparation

- [Deliverable plan for 22 October](docs/checkpoint-plan.md)
- [Initial ERD and data rules](docs/initial-erd.md)
- [Security requirements and test worksheet](docs/security-tests.md)

## Complete implementation plans

Six shared phases (PH1 foundation, PH2 checkpoint slice, PH3 complete functionality, PH4 security and regression, PH5 AWS operations, PH6 final acceptance) with group gates G1 to G6.

- [Project plan and completion criteria](docs/project-plan.md)
- [Shared architecture and document index](docs/shared/README.md)
- [Phase framework, milestone matrix and gates](docs/shared/phase-framework.md)
- [Dependency matrix and handoffs](docs/shared/dependency-matrix.md)
- [First execution sequence for each member](docs/shared/execution-sequence.md)
- NASZ M1: [plan and phases](docs/modules/module-1-auth/README.md), [test plan](docs/modules/module-1-auth/test-plan.md)
- Zikri M2: [plan and phases](docs/modules/module-2-parcels/README.md), [test plan](docs/modules/module-2-parcels/test-plan.md)
- Qee M3: [plan and phases](docs/modules/module-3-delivery/README.md), [test plan](docs/modules/module-3-delivery/test-plan.md)
- [Shared API data and security contract](docs/shared/system-contract.md)
- [Integration scenarios](docs/shared/integration-tests.md) and [whole-project workflow trace](docs/shared/workflow-trace.md)
- [Requirement to phase, task and test traceability](docs/shared/traceability.md)
- [Integration and AWS operations plan](docs/shared/integration-and-aws.md)
- [Unit, integration, browser and recovery test strategy](docs/shared/testing-strategy.md)
- [Decision register and external dependencies](docs/shared/decision-register.md)
- [Independent plan review and resolutions](docs/review-resolutions.md)

Run `python tools/check_plan_docs.py` to validate links, identifiers, ownership, phase ordering and the generated test indexes in the plan documents.

The confirmed stack direction is React, FastAPI and self-managed PostgreSQL in Docker with row-level security (RLS). SQLAlchemy, Alembic, Argon2id and server-side sessions are the implementation baseline. AWS is the confirmed hosting provider; the proposed cloud deployment runs the integrated Docker Compose stack on one EC2 instance.

FastAPI and PostgreSQL are the team's selected alternatives to the framework/database combinations named in the lecturer's brief. Record this variation with the lecturer. RLS and all other application controls are planned and have not been implemented.

## Current status

The repository contains planning documents, a documentation checker (`tools/check_plan_docs.py`) and local reference materials. The phased plans were independently reviewed (plans only, [resolutions](docs/review-resolutions.md)) and remain drafts until the team approves them. Application code, working module interfaces, security controls, test suites and cloud deployment have not been implemented or run. There is no application start command yet.

The lecturer's briefing, case study and rubric are included at the repository root. Only Office temporary files are ignored. The planning documents distinguish source requirements from proposed implementation choices.
