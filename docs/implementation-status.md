# Current implementation status

Updated 13 November 2026. All three modules have local foundation code; G1 review and remaining checks are pending. No group gate is signed off. Remote CI results, owner approvals, branch protection and cloud deployment remain unverified or pending. This record distinguishes executable work from the broader [project plan](project-plan.md).

## Implemented locally

| Area | Available behavior |
| --- | --- |
| M1 foundation | Next.js shell and health route; server settings, error envelope and redaction; trusted loopback/Host validation; report-only nonce CSP; account/session schema and narrow actor/snapshot functions; principal helpers; API client/session provider; Argon2id and starter password denylist; CI/CODEOWNERS definitions |
| M2 foundation | Restricted database-role bootstrap; ordered migrations 0001–0004; bounded pg transactions; forced RLS; SQL hardening checks; shared constants/Zod DTOs; phone/decimal/token validation; guarded synthetic fixtures; health-only API snapshot |
| M3 foundation | Restricted-role integration harness and isolated full Supabase test profile; desktop/phone Playwright; hostile-file fixtures; delivery state rules; private Storage API adapter/staging; bounded Sharp sanitizer; backup-lock prototype; delivery-function drafts and reconciliation design |
| Agreed ERD | `0004_integrated_erd` adds Seller/Rider/Admin subclasses with complete, disjoint membership and automatic synchronization; role-specific foreign keys; real DeliveryProof table and RLS; required initial Registered history and append-only history |
| UI | Stock shadcn/ui with Base UI, Tailwind 4 and semantic navy/orange tokens; home, sign-in and public tracking previews. Seven stock components are present. No community registry is configured |

The [Airway guide](../DESIGN.md) is the approved design target for future module screens. Its reference, tokens and contributor instructions are available; the existing root preview has not yet been migrated to that theme.

The app currently exposes `/api/v1/health`. Real login, registration, logout, CSRF/rate-limit endpoints, parcel creation/search/tracking, assignment, Rider updates, proof access and dashboards remain PH2/PH3 work. Current preview pages do not establish authentication or save parcel data. The session provider will be connected when its endpoints exist.

## Latest local verification

| Check | Observed result |
| --- | --- |
| `npm run check` | 301 unit/component tests pass, with TypeScript, ESLint, SQL hardening and DTO/API drift checks |
| Isolated database/Storage suite | 19 integration tests pass, including fresh installation, forward upgrade, atomic rejection of invalid legacy data, subtype consistency, role-specific references, RLS, private Storage and backup coordination |
| Production build | Next.js build passes |
| Desktop and phone browser checks | 12 checks pass, covering the current previews, navigation, headers, layout and rejected untrusted Host; inspected browser console has no errors |
| Dependency audit | Runtime-only audit reports zero vulnerabilities. Full audit reports 12 moderate tooling dependency findings and no high/critical findings; no forced dependency downgrade applied |
| Local database | Migration 0004 applied and verified on development and test databases; existing accounts, password hashes, parcels and history preserved |

These results do not mark every planned test case or security worksheet row as passed. Full per-test database cloning, remaining authorization/concurrency cases, controlled clocks/failpoints, peak-memory/capacity measurements and CI execution evidence remain open. Migration regression tests use temporary databases; other probes use rollback and unique Storage keys.

Private logs, browser traces, screenshots and credentials stay in ignored local locations. During Windows integration verification, the test profile used alternate pooler ports because the normal pair was reserved; direct database ports stayed unchanged. Test services were stopped while retaining their volumes.

The contributor-baseline verification on 13 November 2026 repeated the application checks and build with Node.js 24.22.1, npm 10.9.9, Docker Engine 29.7.2 and Compose 5.5.1. It also passed the 19 isolated integration tests, documentation checker (zero errors/warnings), local credential-exposure scan, 137 standalone design-helper tests, catalog validation and eight contrast-helper reference cases. Original lecturer files were compared byte-for-byte against their previous Git locations. These checks do not replace another owner's clean-checkout reproduction or remote CI.

## Remaining work and evidence

### Foundation handoff status

This is the current acceptance record for PH1 handoffs. "Present locally" means code is available for review, not that every proving case in the [handoff register](shared/dependency-matrix.md#handoff-register) has passed. Consumer acceptance and owner sign-offs are not yet recorded for any row. Later handoffs H20 onward remain planned.

| Handoffs | Current local state | Remaining action / evidence |
| --- | --- | --- |
| H01, H03, H05, H14 (M1) | Shell/Compose, auth schema and actor/snapshot functions, error/log conventions and password service present | Naszrul checks remaining PH1 cases; consumers reproduce setup and exercise the functions/services; record PR and evidence |
| H04, H06 (M1) | Principal helpers, browser API client and session-provider foundation present; real auth endpoints absent | Verify test/production boundaries and client behavior; H20 supplies real sessions in PH2; do not expose protected routes through a substitute |
| H02, H07, H08, H09, H11 (M2) | Role/bootstrap, transaction helper, constants, schema through 0004 and guarded fixture loader present | Zikri verifies remaining catalog/RLS/fixture cases and unchanged applied revisions; consumers record use from their branches |
| H12 (M2) | Shared Zod DTOs and health-only API snapshot present; business routes absent | Keep types derived from shared schemas; add domain API conformance with the actual routes rather than treating the current snapshot as their implementation |
| H10 (M3) | Isolated integration and browser harness present; migration regressions use scratch databases | Syauqi completes per-test reset/cloning, remaining harness self-tests and PH1 cases; consumers verify the harness on their branches |
| H13 (M3) | ProofStore/image pipeline and backup-lock prototype present | Complete remaining image resource measurements, Storage/failure checks and design review; full recovery scripts remain later work |

For each acceptance, append the handoff ID, producer PR/commit, proving test or safe evidence reference, consumer name and consumer branch/commit. Keep missing evidence explicitly pending. Full task/test definitions remain in the phase files; this table does not mark those files complete.

Follow the [execution order](shared/execution-sequence.md) to complete real sessions and the initial parcel/delivery slices, then the complete integrated journeys. G1 still requires remaining PH1 cases/jobs, remote CI, clean-checkout reproduction by another owner, accepted handoffs and contract review. Later gates require business workflows, security and failure evidence, retention/recovery, cloud deployment and individual demonstration records.

Use the [local runbook](local-development.md) for reproducible commands. Update this file with actual results and evidence when behavior changes; planned outcomes remain in module phase files and the security worksheet.
