# Local foundation versions

Initial Phase 1 baseline, 22 October 2026. Exact npm versions and transitive dependencies are locked in the root package-lock.json. The historical checkpoint demo has its own unchanged lockfile.

| Component | Version |
| --- | --- |
| Node.js tested on this machine | 24.14.0 |
| npm tested | 11.9.0 |
| Docker Engine tested | 29.4.0 |
| Docker Compose tested | 5.1.1 |
| Next.js | 16.4.2 |
| React / React DOM | 19.3.1 |
| TypeScript | 6.0.3 (compatible with the current TypeScript ESLint parser) |
| pg | 8.23.1 |
| node-pg-migrate | 9.0.0 |
| Zod | 4.6.7 |
| Sharp | 0.35.5 |
| Argon2 | 0.45.1 |
| Vitest | 5.0.5 |
| Playwright | 1.64.1 |
| Full Supabase Docker upstream | b8483fc454ed2d6fb2b3637fc5da928bc9b1ff6b |
| Supabase PostgreSQL image | 17.6.1.136 (upstream pinned image) |

The preserved upstream Docker configuration includes the default Envoy gateway, Studio, Auth, PostgREST, Realtime, Storage, imgproxy, postgres-meta, Edge Runtime, PostgreSQL and Supavisor. Optional upstream log-collection services are available in the vendored override, and are not silently presented as running by the base configuration.

The generated local override retains all default services, removes globally fixed container names while retaining the Realtime hostname alias, binds administrative/gateway/DB/pooler ports to loopback, uses separate named PostgreSQL/Storage volumes per Compose project and rotates Docker logs. Upstream files are not modified in place.
