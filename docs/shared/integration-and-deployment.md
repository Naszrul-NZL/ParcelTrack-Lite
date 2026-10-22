# Integration release and deployment operations plan

Baseline revised on 22 October 2026: **local first, one full-stack Next.js application and the full self-hosted Supabase Docker stack**. No application migration, containers, cloud resources or release gates are completed by these documentation changes. The existing `checkpoint-demo/` is a separate browser-only prototype. See the [local setup plan](../local-development.md), [system contract](system-contract.md) and [testing strategy](testing-strategy.md).

## Shared foundation and handoff order

Keep PH1-PH6, G1-G6 and existing task/test/handoff IDs. Build and prove PH1-PH4 locally before cloud execution. The [phase framework](phase-framework.md), [dependency matrix](dependency-matrix.md) and [execution sequence](execution-sequence.md) define module handoffs. Temporary principal, in-memory storage and seeded assignment substitutes cannot remain in final acceptance. All three owners contribute UI, TypeScript server services, SQL migrations and tests to one application.

## Migration and configuration contract

Use one node-pg-migrate history, with reviewed SQL and ordered revisions from the [contract](system-contract.md#migration-order-and-database-roles). Bootstrap only application roles and schema `app` inside the initialized Supabase PostgreSQL cluster. Preserve upstream Supabase roles, extensions, auth/storage schemas, migrations and service ownership. The app migration owner does not own the whole Supabase database. Apply migrations once through a private operator command/job, never per request, at module import, in Next.js builds or at worker startup.

Use separate bootstrap, migration, app_runtime, tracking_runtime, maintenance_runtime, ops_runtime and backup_operator credentials. Only app/tracking credentials and the private Storage API credential belong in the web service. Maintenance, operations, migration and backup credentials belong in their dedicated commands/runner. Privileged vendor Supabase credentials are required by the vendor services; do not copy them indiscriminately into Next.js. Never use the Supabase database owner or service-role key as a substitute for app_runtime RLS tests.

Initial Admins are created by the private idempotent `provision-admin` command, with privately supplied passwords and must-change set. The existing username/Argon2id/opaque-session contract remains the application identity model. Supabase Auth is part of the full infrastructure stack but is not a second application login path. Do not mirror accounts into `auth.users` without a separate reviewed change. Synthetic fixtures are test-only and never auto-loaded by a production migration.

Commit inert `.env.example` files only. Keep application `.env.local` separate from the private Supabase Compose `.env`. Configure origin, role-specific DB URLs, local gateway URL, Storage bucket/key, cookie/session policy, proof and request limits, independent fingerprint/rate-limit keys, journal path, timeouts, trusted proxy and log policy. Never prefix secrets with `NEXT_PUBLIC_`; browser-safe shared schemas cannot import server config. Next.js modules touching secrets/DB/storage use `server-only`.

## Local and cloud topology

Immediate local topology: Next.js App Router at localhost:3000, connected server-side to the full upstream Supabase Compose stack. Preserve PostgreSQL, gateway, Studio, Auth, PostgREST, Storage, Realtime, pooler and supporting services present in the pinned upstream configuration; document optional upstream logging services separately. This is not a lone PostgreSQL container, managed Supabase Free project or Supabase CLI-only development setup.

Pin the upstream Compose commit and image tags. Bind gateway/Studio and any optional database/pooler host ports to loopback. Keep Next.js and infrastructure credentials out of client bundles. Never expose Docker management, Studio, Postgres, service keys or admin APIs to the internet. Application schema `app` is excluded from public PostgREST/GraphQL schemas and Realtime publication; anon/authenticated/service_role have no app-schema privileges. Verify those boundaries with direct gateway calls as well as SQL catalog tests.

The application uses one same-origin `/api/v1` surface; Server Components call the same authorized services directly. No Python backend or separate Vite production server is needed. Local app execution may use Node.js on the host with Supabase in Docker; a containerized Next.js service is optional after the host development loop works.

Proof objects live in a private Supabase Storage bucket backed by persistent Docker storage. Next.js uses the Storage API, never the underlying files or SQL writes to vendor storage metadata. PostgreSQL data and Storage objects both need durable volumes and matching backups. Container replacement must preserve them; `docker compose down -v` and reset scripts are destructive and are not part of normal startup. Local self-hosting has no hosted Free-plan database/photo quotas; actual disk, memory and configured limits apply. Measure the full stack's resource use.

Cloud hosting is deferred to PH5 and EXT-04. A self-hosted Supabase Docker stack needs a reachable Docker host; Vercel alone cannot run it or reach a developer's localhost. A later Vercel-hosted Next.js app would require separately hosted Supabase plus verified TLS, networking, pool limits and request limits. A single Linux cloud host running Next.js and Supabase remains a candidate; no provider, free entitlement, budget, capacity or live URL is promised. Source cloud/full-marks requirements remain unchanged.

## Deployment sequence and rollback

1. Prove clean local setup, restricted-role SQL, real HTTP integration and browser journeys. Record commit, Next.js build/release ID, application migration revision and Supabase Compose/image versions.
2. Take a coordinated matching app-data/Storage backup before schema changes. A first empty environment must establish a recoverable baseline before accepting user data.
3. Start the pinned full Supabase stack, wait for service readiness and initialize vendor services. Run/check app-role bootstrap, then one private migration job. Run `verify_grants`; do not alter vendor schemas.
4. Provision Admins privately, start the production Next.js build and the separate maintenance runner, and verify health without exposing secrets. Repeating setup on existing volumes must preserve passwords, users, parcels and proof objects.
5. Ensure web credentials cannot migrate, switch to owner roles or execute private maintenance/operations functions. Verify no app-schema access through the Supabase public APIs or client bundles.
6. Exercise all four user types, successful/Failed deliveries, cross-user denial, private proof reads, retention and shared session/rate-limit behavior. Local results do not count as cloud results.
7. Only after EXT-04 is resolved, adapt the proven topology to the chosen host, configure HTTPS/proxy trust and repeat PH5 checks on the real URL. Do not provision resources during this documentation task.
8. Enable the chosen scheduler and backup destination; observe a safe run, idempotent rerun and failure notification.

Roll back the application to the previous compatible release/build. Record image digests if containers are used. Use expand-then-contract schema changes so the old build runs against the new schema. Maintenance mode rejects business writes during schema-changing releases until smoke checks pass. A data rollback requires the tested matching app/Storage backup and session/account reconciliation; never restore destructively while accepting writes. Do not blindly downgrade migrations or vendor Supabase images.

## Backup and restore

Syauqi coordinates M3-PH4-T07 locally and M3-PH5-T02-T04 later; Zikri checks grants/RLS and Naszrul checks sessions/accounts. Use synthetic data for drills. The backup tool acquires the shared coordination lock exclusively after enabling maintenance, drains business writes/uploads, pauses cleanup and captures the matching application SQL dump and private Storage API export. Each manifest records keys, verified media types, sizes, hashes, schema revision, commit, vendor versions and backup time. Storage metadata is reconstructed via supported Storage API operations, not by writing directly to `storage.objects` or copying a live service volume mid-write.

The private backup_operator may bypass RLS for complete app-schema dumps; it is never supplied to the web app. Dump only schema `app` data, with role/grant reconstruction derived from migrations. Encrypt archives using age/public-key encryption; keep private keys with two named operators. Start with a private off-volume local backup destination; choose encrypted off-host cloud storage later. The append-only account journal is outside the restored database and separately protected/backed up. Proposed retention is daily backup with 30-day expiry, including old object versions. Record actual successful backup age; the target RPO is one interval, not a guarantee when jobs fail.

Restore into a separate Compose project with different ports, volume names and generated secrets, using a compatible pinned Supabase stack. Bootstrap app roles, migrate to the manifest revision, then restore app-schema data with the bootstrap administrator (`pg_restore --data-only --disable-triggers --schema app`). Never overwrite the vendor auth/storage schemas from an application dump. Recreate the private proof bucket and upload the matching objects through the Storage API without overwrite. Verify manifest hashes, app proof references, counts, history and catalog grants. A provider/version change requires its own tested vendor migration before acceptance.

Before reopening: purge every restored auth_session, replay the off-database account journal to re-disable accounts and force password changes for credentials changed after the recovery point. If the journal is missing/incomplete run `quarantine-after-restore`: disable Riders, force password changes for all accounts and reconcile against the staff roster. Rotate secrets after compromise. A cookie revoked after backup must remain unauthorized after restore. Rerun retention and deny expired proof access before serving requests. Record observed restore time and backup age; a successful upload alone is not a restore test.

## Retention jobs and incident response

Run the same TypeScript job modules from a separate private runner using maintenance_runtime and the necessary private Storage API access. Local testing starts with direct command invocation; configure a scheduler after behavior is proven. Jobs perform anonymization, proof purge, settled-orphan reconciliation and expired session/bucket cleanup. Use locks, small batches, interruption-safe retries and count/opaque-ID logs. No privileged public maintenance endpoint is introduced.

Record incident contacts privately. Suspected breaches are reported within one hour under P5; lock affected accounts, revoke sessions, preserve redacted evidence, investigate and rotate credentials. Private ops_runtime commands can lock/recover an Admin without a public bypass. Backup and account-journal failures must be visible to the named operator. Local host failure remains a single failure boundary; do not claim high availability.

## PR workflow and automated checks

Keep per-owner feature branches and reviewed changes. Planned CODEOWNERS maps `src/features/*`, `src/server/modules/*` and module migrations to the responsible member; shared boundaries are reviewed together. Branch protection remains unverified until read back from GitHub (EXT-03). Use one npm lockfile, TypeScript lint/type/unit/component/build checks, real local Supabase integration, migration/grant checks and Playwright. Run DB assertions as app_runtime/tracking_runtime, not as the vendor database owner. No request/build process auto-migrates.

## End-to-end acceptance scenarios

The [integration scenarios](integration-tests.md), [security worksheet](../security-tests.md) and module test plans keep their identifiers. Tests backed only by browser fixtures do not prove server security. Run against real Next.js and full local Supabase first; PH5 repeats on actual cloud infrastructure. All backend/RLS/Next.js results remain Not run until executable implementation exists.

## Release acceptance and final submission

Demonstrate Seller, Rider, Admin and public journeys with synthetic users/parcels/images. Check phone-width and keyboard access. Record measured response times, database pool use, image memory and storage growth on the actual machine. The source's 50 Sellers, 15 Riders, 2 Admins and 800 parcels/day is a later capacity baseline, not an assertion that a laptop or free host meets it.

Each member supplies more than five distinct security input types with expected/actual results and safe evidence. Rehearse the approximately 30-minute group demo. Local-first changes the implementation order, not the source's cloud criterion: final cloud demonstration and lecturer acceptance of the alternate stack remain external requirements. No Week 14 calendar date is invented.
