# Next.js documentation migration

Decision recorded on 22 October 2026. User direction: reduce frontend/backend integration by using one full-stack Next.js application, build locally first and use the full Supabase Docker stack for PostgreSQL and supporting services.

## State when the migration was documented

| Topic | Current implementation | Target documented here |
| --- | --- | --- |
| App | Separate React/Vite checkpoint demo with synthetic browser storage | One Next.js App Router application, Node runtime, TypeScript pages and server services |
| Data | localStorage in each browser | PostgreSQL in the full self-hosted Supabase Docker stack |
| Proof images | Demo data URLs | Private Supabase Storage API bucket with validated immutable objects |
| Validation/types | Demo TypeScript functions | Shared strict Zod schemas and inferred types, revalidated server-side |
| SQL access | No real backend | Restricted pg clients; one client/transaction; node-pg-migrate SQL revisions |
| Identity | Browser-only simulated login | Existing username/Argon2id/opaque-session design in Next.js; included Supabase Auth is not a second identity source |
| Testing | Historical frontend checks | Vitest, real Next.js HTTP plus full Supabase/RLS/Storage integration, Playwright and local restore |
| Hosting | No deployed real app | Local PH1-PH4 first; later cloud choice and PH5 repetition |

## Implementation order

1. Naszrul builds the Next.js shell, server-only boundaries and full local Supabase setup with the team; record upstream Compose provenance and private environment settings.
2. Zikri bootstraps application roles/schema without changing vendor schemas; establish ordered SQL migrations, shared schemas and pg transactions.
3. Naszrul implements real custom sessions/CSRF; all three port their assessed UI and server services into the same app. Reuse appropriate demo UI/rules, replacing browser storage and simulated identity.
4. Syauqi implements private Storage API proof handling and real full-stack tests; all owners prove cross-user isolation and the complete parcel journey.
5. Pass local production-build, security, job, persistence and matching app-data/Storage restore checks before choosing and provisioning later hosting.

Module/task/test identifiers, domain rules, status flow, RLS and source requirements are preserved. Application source paths and test/deployment tools change. Deployment files are renamed from AWS-specific names to cloud-neutral names, with references updated.

## Evidence and boundaries

The initial documentation-only change updated checkpoint presentation/report copy and their generators. That initial change did not implement the app or Supabase. Subsequent Phase 1 work now supplies Next.js, full local Supabase, migrations and foundation tests; see [current progress](phase-1-progress.md). No group acceptance gate or cloud deployment is claimed. Existing checkpoint screenshots and frontend evidence remain historical prototype evidence. Lecturer-supplied case study, rubric and briefing stay unchanged. Lecturer acceptance of Next.js/PostgreSQL remains unrecorded; the final cloud criterion is not removed.

Start implementation with the [local development plan](local-development.md), [contract](shared/system-contract.md), [execution sequence](shared/execution-sequence.md) and [phase gates](shared/phase-framework.md).
