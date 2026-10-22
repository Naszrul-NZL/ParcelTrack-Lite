# Local Next.js and full Supabase Docker

Updated 22 October 2026. These commands run the root Phase 1 application. The separate `checkpoint-demo/` remains historical frontend evidence. See [implemented work and open gates](phase-1-progress.md).

## Requirements

Use Node.js 24.14.0, npm 11.9.0 and Docker Desktop with Linux containers/WSL2. Exact dependencies and upstream provenance are in [infra/VERSIONS.md](../infra/VERSIONS.md). This machine ran all 11 default services with Docker allocated about 4 GB RAM. That is startup evidence, not a capacity guarantee; allow additional memory for Next.js and browsers.

## First setup

Run from the repository root in PowerShell with Docker Desktop ready:

```powershell
npm ci
node scripts/prepare-env-template.mjs
npm run local:init
npm run local:up
npm run db:bootstrap
npm run db:migrate
npm run db:verify
npm run storage:init
npm run dev
```

Open http://localhost:3000. The shell, navigation and `/api/v1/health` work. Sign-in and tracking pages describe their later-phase implementation; real login and parcel workflows are not connected yet. `npm run build` followed by `npm start` runs the production build locally instead of the development server.

`local:init` generates credentials idempotently. Development web settings live in `.env.local`; operator settings, dashboard credentials, generated Compose and vendor settings live under `.local/development/`. Never copy operator credentials into the web environment. These files are ignored by Git. The private upstream environment template is fetched from the recorded immutable commit and checked against its checksum. The preserved upstream configuration is under `infra/supabase/vendor/`.

The full stack includes PostgreSQL, private Storage, gateway, Studio, Auth, PostgREST, Realtime, pooler and supporting services. Optional upstream logging services are preserved as optional overrides. App identity remains username/Argon2id/opaque sessions; Supabase Auth is infrastructure, not another identity authority. Browser code receives no database, operator or Storage service credentials.

## Addresses and lifecycle

| Service | Development | Isolated test |
| --- | --- | --- |
| Next.js | localhost:3000 | localhost:3100 |
| Supabase gateway / Studio | 127.0.0.1:8000 | 127.0.0.1:8001 |
| PostgreSQL direct | 127.0.0.1:54322 | 127.0.0.1:54323 |
| Pooler session / transaction | 127.0.0.1:54329 / 54330 | 127.0.0.1:54331 / 54332 |
| Compose project | parceltrack-development | parceltrack-test |

Every published port binds to loopback. Studio requires the generated private dashboard login. The app schema is outside exposed Data API schemas, with no schema access for `anon`, `authenticated` or `service_role`.

The generated Compose file sets Supavisor's open-file soft and hard limits to 100,000, as required by its startup script. This avoids startup failures on hosts with a lower Docker default, including GitHub runners. Failed starts report the pooler's recent logs with generated credentials redacted. Git attributes preserve LF line endings for Linux container mounts and the generated API snapshot on Windows checkouts.

`npm run local:status` shows service health; `local:down` stops the selected project without removing volumes; `local:up` starts it again. Do not delete volumes as a startup procedure. On a small laptop run one full stack at a time. The custom Node adapter backs `dev` and `start`: it binds to loopback, validates Host, and replaces client-IP forwarding headers using the actual socket. Do not bypass it with a public `next dev` listener.

## Synthetic data

After migrations, `npm run db:fixtures` explicitly seeds seven synthetic accounts and a registered parcel for each Seller. It requires the generated private acknowledgement and local fixture credential, refuses production, and uses the shared Argon2id service. No password is printed or committed. Reruns preserve existing account hashes and parcel counts. Real initial-Admin provisioning is later ops work.

## Tests

`npm run check` runs type checking, lint, unit/component tests, SQL hardening lint and shared-schema/OpenAPI drift checks. After a build, `npm run security:local` checks generated local credential values against Git-visible files and browser assets; this supplements the planned history-aware scanner. `npm audit --audit-level=high` checks dependencies. The snapshot lists only the implemented health route; domain endpoints will be added with their implementations.

Prepare a separate full test stack:

```powershell
$env:PTL_PROFILE='test'
npm run local:init
npm run local:up
npm run db:bootstrap
npm run db:migrate
npm run db:fixtures
npm run db:verify
npm run storage:init
npm run test:integration
npm run fixtures:files
npm run test:spike
```

Test configuration is `.env.test.local` and `.local/test/`; test and development use separate credentials, ports and volumes. Integration tests assert real restricted roles; no HTTP header supplies a test identity. Current suites run sequentially with read-only seed data and unique Storage probe keys. Per-test cloned databases and the complete HTTP auth harness remain open work.

For browser checks, build the app, start `npm start` with the test profile in another terminal, then:

```powershell
$env:PTL_PROFILE='test'
$env:PTL_BASE_URL='http://localhost:3100'
npx playwright install chromium
npm run test:e2e
```

Alternatively set `PTL_CHROME_PATH` to an installed Chrome executable. Playwright launches a separate test profile. Tests cover desktop/phone layouts, navigation, headers and Host rejection; role journeys arrive with PH2 endpoints. Traces and fixtures stay in ignored private directories.

To verify persistence, run `npm run test:persistence -- --capture`, rerun `local:init`, `db:bootstrap`, `db:migrate`, `db:fixtures`, stop/start the test stack, then `npm run test:persistence`. The probe compares credentials, account hashes, grants and counts and reads its own private Storage object before deleting that probe. It refuses the development profile.

After tests, stop the test app and `npm run local:down`, then return to development:

```powershell
Remove-Item Env:PTL_PROFILE -ErrorAction SilentlyContinue
```

## Boundaries and later work

The private `delivery-proofs` bucket enforces JPEG/PNG and 3 MiB through the supported Storage API. Validation re-encodes one JPEG/PNG frame, strips metadata/trailing bytes, and rejects over 12 MP. The future route must enforce the 4 MiB multipart-body cap and parcel authorization before privileged Storage calls. See the [storage design](modules/module-3-delivery/storage-design.md).

The backup lock prototype proves writer drainage and maintenance rejection. Full backup/restore, reconciliation, login/rate-limit/CSRF routes, business APIs, cloud hosting, team reviews and external approvals remain open. A cloud app cannot reach this laptop's loopback services; hosting is a later decision, with no cloud account needed for Phase 1.
