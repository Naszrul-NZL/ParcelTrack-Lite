# ParcelTrack Lite

Secure parcel tracking coursework for STTCK3033, based on the RapidExpress case study. One Next.js App Router application in TypeScript uses PostgreSQL with RLS and private Storage in the full self-hosted Supabase Docker stack.

## Start here

- [Local setup and verification](docs/local-development.md)
- [Current implementation and remaining work](docs/implementation-status.md)
- [Complete project plan](docs/project-plan.md)
- [Agreed database design and ERD](docs/database-design.md)
- [UI component policy: stock shadcn first](docs/ui-components.md) and [approved Airway design guide](DESIGN.md)
- [Original source requirements](docs/requirements/README.md)

The local foundation, migrations through `0004_integrated_erd`, shared services and public UI previews exist. Only the health API is connected; authentication and the parcel/delivery workflows remain to be implemented. No group acceptance gate or cloud deployment is claimed. The lecturer has approved the chosen tech stack, as confirmed by the project owner on 13 November 2026.

## Team and module plans

| Member | GitHub | Module and tests |
| --- | --- | --- |
| Naszrul | [Naszrul-NZL](https://github.com/Naszrul-NZL) | [M1 Login and User Management](docs/modules/module-1-auth/README.md), [test plan](docs/modules/module-1-auth/test-plan.md) |
| Zikri | [Zikri809](https://github.com/Zikri809) | [M2 Parcel Registration and Public Tracking](docs/modules/module-2-parcels/README.md), [test plan](docs/modules/module-2-parcels/test-plan.md) |
| Syauqi | [Qee110](https://github.com/Qee110) | [M3 Delivery Update and Admin Dashboard](docs/modules/module-3-delivery/README.md), [test plan](docs/modules/module-3-delivery/test-plan.md) |

Each owner builds their module's UI, server logic and tests. Database design, layout and integration are shared responsibilities. The six phases cover foundation, initial working slices, complete functionality, hardening, cloud operations and final acceptance.

Owners are already assigned. Begin with the [contributor starting point](docs/shared/execution-sequence.md#contributor-starting-point) and [foundation handoff status](docs/implementation-status.md#foundation-handoff-status) before picking a task; existing foundation code still needs team acceptance and should not be rebuilt.

The [implemented frontend foundation](docs/shared/frontend-foundation.md) provides Airway light/dark themes, local fonts, shared shadcn controls, status presentation, the parcel docket and field feedback. Module owners can compose these without independently changing the global theme or shell.

The [shared backend/test foundation](docs/shared/backend-foundation.md) provides protected transactions/CSRF checks, safe Route Handler responses, isolated fixture databases and API/import drift checks. Use these helpers rather than writing module-specific authorization or reset scripts. Real login/session issuance remains H20 work.

## Shared implementation references

- [Architecture and document index](docs/shared/README.md)
- [System contract](docs/shared/system-contract.md): API, data, permissions and transaction rules
- [Execution order](docs/shared/execution-sequence.md), [handoffs](docs/shared/dependency-matrix.md) and [phase gates](docs/shared/phase-framework.md)
- [Testing strategy](docs/shared/testing-strategy.md), [integration scenarios](docs/shared/integration-tests.md) and [security worksheet](docs/security-tests.md)
- [Workflow trace](docs/shared/workflow-trace.md) and [requirement traceability](docs/shared/traceability.md)
- [Deployment and recovery](docs/shared/integration-and-deployment.md)
- [Decisions and external dependencies](docs/shared/decision-register.md), [review resolutions](docs/review-resolutions.md)

Run `python tools/check_plan_docs.py` to validate documentation links, identifiers, handoffs and generated test indexes. Application checks and database/browser verification commands are in the local runbook. Private configuration, local infrastructure volumes, build caches and test evidence are ignored by Git.
