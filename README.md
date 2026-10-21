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

- [Project plan and completion criteria](docs/project-plan.md)
- [NASZ Module 1 plan](docs/modules/module-1-auth/README.md)
- [Zikri Module 2 plan](docs/modules/module-2-parcels/README.md)
- [Qee Module 3 plan](docs/modules/module-3-delivery/README.md)
- [Shared API data and security contract](docs/shared/system-contract.md)
- [Integration and AWS operations plan](docs/shared/integration-and-aws.md)
- [Unit integration browser and recovery test strategy](docs/shared/testing-strategy.md)
- [Independent plan review and resolutions](docs/review-resolutions.md)

The confirmed stack direction is React, FastAPI and self-managed PostgreSQL in Docker with row-level security (RLS). SQLAlchemy, Alembic, Argon2id and server-side sessions are the implementation baseline. AWS is the confirmed hosting provider; the proposed cloud deployment runs the integrated Docker Compose stack on one EC2 instance.

FastAPI and PostgreSQL are the team's selected alternatives to the framework/database combinations named in the lecturer's brief. Record this variation with the lecturer. RLS and all other application controls are planned and have not been implemented.

## Current status

The repository contains planning documents and local reference materials. Application code, working module interfaces, security controls and cloud deployment have not been implemented. There is no application start command yet.

The lecturer's briefing, case study and rubric are included at the repository root. Only Office temporary files are ignored. The planning documents distinguish source requirements from proposed implementation choices.
