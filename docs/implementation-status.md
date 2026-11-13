# Current implementation status

Updated 13 November 2026. All three modules have local foundation code; G1 review and remaining checks are pending. No group gate is signed off. Remote CI results, owner approvals, branch protection and cloud deployment remain unverified or pending. This record distinguishes executable work from the broader [project plan](project-plan.md).

## Implemented locally

| Area | Available behavior |
| --- | --- |
| M1 foundation | Next.js shell and health route; server settings, safe API handler/error envelope and redaction; trusted loopback/Host validation; report-only nonce CSP; account/session schema and narrow actor/snapshot functions; session/role/CSRF resolution and protected transaction helper; API client/session provider; Argon2id and starter password denylist; CI/CODEOWNERS definitions |
| M2 foundation | Restricted database-role bootstrap; ordered migrations 0001–0004; bounded pg transactions; forced RLS; SQL hardening checks; shared constants/Zod DTOs and A01–A21 endpoint registry; phone/decimal/token validation; guarded synthetic fixtures; actual-route API snapshot, plan/registry parity and production import-graph checks |
| M3 foundation | Isolated full Supabase profile plus migrated test templates/per-case database clones, checked runtime pools, private staging cleanup, scoped Storage keys, ephemeral fixture credentials/sessions and clock/barrier helpers; desktop/phone Playwright; hostile-file fixtures; delivery state rules; private Storage API adapter/staging with explicit missing-object handling; bounded Sharp sanitizer; backup-lock prototype; delivery-function drafts and reconciliation design |
| Agreed ERD | `0004_integrated_erd` adds Seller/Rider/Admin subclasses with complete, disjoint membership and automatic synchronization; role-specific foreign keys; real DeliveryProof table and RLS; required initial Registered history and append-only history |
| UI | Airway light/dark themes on Home, Sign in and sample public tracking; locally served DM Sans/Barlow Condensed; stock shadcn/Base UI controls, shared navigation, parcel docket, five-status presentation and field feedback; generated theme CSS with contrast/drift checks. No community registry is configured |

The [Airway guide](../DESIGN.md) now has an [implemented frontend foundation](shared/frontend-foundation.md) for module owners to consume. The current screens use it; real authenticated role workspaces and business actions remain PH2/PH3 work.

The app currently exposes `/api/v1/health`. Real login, registration, logout, CSRF/rate-limit endpoints, parcel creation/search/tracking, assignment, Rider updates, proof access and dashboards remain PH2/PH3 work. Current preview pages do not establish authentication or save parcel data. The session provider will be connected when its endpoints exist.

## Latest local verification

| Check | Observed result |
| --- | --- |
| `npm run check` | 316 unit/component tests pass, with TypeScript, ESLint, SQL hardening, route/registry/DTO/import checks and Airway token parity/32 contrast checks |
| Isolated database/Storage suite | 31 integration tests pass, including the earlier foundation cases plus clone/reset and failure cleanup, concurrent case isolation, actual runtime role checks, protected transaction/CSRF behavior, revoked/expired/inactive/stale sessions, commit/rollback and a version change during an in-flight read |
| Production build | Next.js build passes |
| Desktop and phone browser checks | 16 checks pass, covering all five statuses, form feedback, navigation, headers, both themes, preference persistence, local fonts, long identifiers, 320–1440px reflow, enlarged text and reduced motion. Browser error logs are empty |
| Dependency audit | Runtime-only audit reports zero vulnerabilities. Full audit reports 12 moderate tooling dependency findings and no high/critical findings; no forced dependency downgrade applied |
| Local database | Migration 0004 applied and verified on development and test databases; existing accounts, password hashes, parcels and history preserved |

These results do not mark every planned test case or security worksheet row as passed. Per-case database cloning is available and proved for new service suites; older low-level migration/schema probes retain scratch databases or rollback isolation. Real endpoint role journeys, remaining authorization/concurrency cases, controlled failpoints, peak-memory/capacity measurements and CI execution evidence remain open. Clock/barrier helpers are test-only; they do not change production database time.

Private logs, browser traces, screenshots and credentials stay in ignored local locations. During Windows integration verification, the test profile used alternate pooler ports because the normal pair was reserved; direct database ports stayed unchanged. Test services were stopped while retaining their volumes.

The contributor-baseline verification on 13 November 2026 repeated the application checks and build with Node.js 24.22.1, npm 10.9.9, Docker Engine 29.7.2 and Compose 5.5.1. It also passed the 19 isolated integration tests, documentation checker (zero errors/warnings), local credential-exposure scan, 137 standalone design-helper tests, catalog validation and eight contrast-helper reference cases. Original lecturer files were compared byte-for-byte against their previous Git locations. These checks do not replace another owner's clean-checkout reproduction or remote CI.

The later Airway migration on the same date passed the updated checks above on Node.js 24.22.1. Playwright now starts/stops its built preview server automatically; the CI app job includes the same browser suite. Theme CSS is generated from the approved JSON and forced to LF in Git to avoid Windows checkout drift. No application dependencies or database revisions were added. Visual decisions and the delivery review are in [UI preview review](ui-preview-review.md).

The shared backend/test follow-up adds the [reusable helpers](shared/backend-foundation.md) without changing migrations or exposing a business endpoint. New cases run against cloned databases with real roles and session rows. The real Storage cleanup test exposed the pinned API's HTTP 400/NoSuchKey response; the adapter now distinguishes explicit object absence from permission, bucket and service failures. Negative controls also reject owner credentials, production/development fixture targets, transitive test imports and undeclared API methods/paths.

## Remaining work and evidence

### Foundation handoff status

This is the current acceptance record for PH1 handoffs. "Present locally" means code is available for review, not that every proving case in the [handoff register](shared/dependency-matrix.md#handoff-register) has passed. Consumer acceptance and owner sign-offs are not yet recorded for any row. Later handoffs H20 onward remain planned.

| Handoffs | Current local state | Remaining action / evidence |
| --- | --- | --- |
| H01, H03, H05, H14 (M1) | Shell/Compose, auth schema and actor/snapshot functions, error/log conventions and password service present | Naszrul checks remaining PH1 cases; consumers reproduce setup and exercise the functions/services; record PR and evidence |
| H04, H06 (M1) | Shared session resolver, default must-change gate, role/CSRF/provenance checks, principalUow and safe API handler are tested locally; browser client/provider foundation present | Consumers can implement protected services against these exports. H20 still supplies real issuance/renewal/login/logout and CSRF bootstrap; no production endpoint may rely on fixture sessions |
| H02, H07, H08, H09, H11 (M2) | Role/bootstrap, transaction helper, constants, schema through 0004 and guarded fixture loader present | Zikri verifies remaining catalog/RLS/fixture cases and unchanged applied revisions; consumers record use from their branches |
| H12 (M2) | Shared DTOs, checked A01–A21 registry and AST-discovered health-only snapshot; plan/import drift checks pass | Keep types derived from shared schemas; endpoint-specific payload/status/error conformance remains required as real routes are added |
| H10 (M3) | Migrated template/per-case clones, seven fixture accounts, real temporary session rows, runtime assertions and scoped file/Storage cleanup are proved by HAR-01 tests; browser harness present | Consumers can use the new harness now. Complete actual HTTP role journeys, remaining PH1 cases/failpoints and owner acceptance; retire TMP-04 through H20 |
| H13 (M3) | ProofStore/image pipeline and backup-lock prototype present | Complete remaining image resource measurements, Storage/failure checks and design review; full recovery scripts remain later work |

For each acceptance, append the handoff ID, producer PR/commit, proving test or safe evidence reference, consumer name and consumer branch/commit. Keep missing evidence explicitly pending. Full task/test definitions remain in the phase files; this table does not mark those files complete.

Follow the [execution order](shared/execution-sequence.md) to complete real sessions and the initial parcel/delivery slices, then the complete integrated journeys. G1 still requires remaining PH1 cases/jobs, remote CI, clean-checkout reproduction by another owner, accepted handoffs and contract review. Later gates require business workflows, security and failure evidence, retention/recovery, cloud deployment and individual demonstration records.

Use the [local runbook](local-development.md) for reproducible commands. Update this file with actual results and evidence when behavior changes; planned outcomes remain in module phase files and the security worksheet.
