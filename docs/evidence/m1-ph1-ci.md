# M1 foundation CI evidence

Recorded 15 November 2026 for [issue #5](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/5), M1-PH1-T11/T12 and M1-PH1-TC12. This record supplies implementation and executable evidence; owner approvals and G1 acceptance remain pending.

## Baseline and scope

Baseline [PR #4](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/4) merged as `e2c8cb56c53e57681833f850fb93052d46c928b0`. Its [main-branch workflow](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43444926553) completed successfully with the original `app-check` and `server-integration` jobs. That result did not prove the missing history scanner or owner acceptance.

The follow-up preserves the existing checks while exposing the planned PH1 check names: `server-lint-type`, `server-unit`, `ci-contract`, `app-check`, `secret-scan`, `dependency-audit`, `db-migrations`, `server-integration` and `local-stack-smoke`. The three stack checks share the existing setup as isolated matrix jobs. The smoke check repeats setup and recreates containers, verifies database/Storage persistence, builds the app and runs the production foundation browser cases. Dependency audit is report-only in PH1 as planned. PH2 `authz-matrix` and real `e2e-core` remain dependent on H20; preview tests do not replace them.

## Scanner and controls

`npm run security:scan` uses [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). The installer pins the Linux x64 and Windows x64 archive SHA-256 values from that release, verifies downloaded/cached archives and extracts the verified binary before each invocation. It requires no npm dependencies. CI fetches full history with `fetch-depth: 0`; a shallow history scan fails rather than reporting incomplete success.

The tree scan copies Git-visible tracked and nonignored untracked regular files to a disposable directory. Ignored local credentials/build artifacts stay private. The history scan uses `--all --full-history`. Default detection rules remain enabled. Raw reports and matched values are never printed or uploaded; output identifies only mode, rule, path and line. The separate `security:local` exact-value check continues to scan generated local credentials against Git-visible files and built browser assets.

`npm run security:controls` creates and removes an isolated temporary Git repository. It proves:

- Clean tree/history and the exact inert exceptions pass.
- An uncommitted, nonfunctional provider-shaped canary fails the tree scan while history stays clean.
- A generated generic-key canary in an allowlisted upstream-test path is still detected.
- After committing and deleting the canaries, the clean tree passes and history still detects the earlier canaries.

No planted canary is committed to the project or pushed to GitHub. These repeatable controls run in the required CI job; separate intentionally failing remote canary branches from the original TC12 procedure have not been created.

The first full baseline scan found three upstream-test matches and two historical documentation matches. Each was inspected. `.gitleaks.toml` restricts exceptions to `generic-api-key` plus the exact path and matched text: the S3 prerequisite variable names, the RFC 6455 sample WebSocket nonce and prose naming the former Python dependencies. No directory, commit or detection rule is broadly excluded. Vendored source and applied migrations are unchanged.

## Local results

Environment: Windows, Node.js 24.14.0, npm 10.9.9, Docker Engine 29.7.2 and Compose 5.5.1. Tests used the isolated `test` Supabase profile and preserved its volumes. Existing local pooler overrides 55431/55432 were retained. Private files and reports remain ignored under `.local/` or disposable OS temporary directories.

| Check | Observed result |
| --- | --- |
| `npm run check` | 316 unit/component cases pass; type, lint, SQL, contract and Airway checks pass |
| `npm run build` | Production build passes |
| Bootstrap, migrate, fixtures, role/grant verification and private bucket initialization | Pass; repeat setup preserves existing passwords and data |
| `npm run test:integration` | 31 cases pass with real database/Storage services |
| `npm run test:e2e` | 16 desktop/phone preview checks pass |
| Persistence capture, repeat bootstrap/migrate/fixtures, container down/up and persistence verification | Account hashes, credentials, grants, counts and private Storage bytes survive; role verification passes after restart |
| `npm run security:controls` | Clean and planted-secret controls pass, including the narrow exception boundary |
| `npm run security:scan` | Zero tree/history findings after exact inert exceptions |
| `npm run security:local` | No generated local credentials in Git-visible files or browser assets |
| `npm audit --audit-level=high` | 11 moderate tooling findings, no high/critical findings; no forced downgrade applied |
| `npm audit --omit=dev --audit-level=high` | Zero runtime dependency findings |
| `python tools/check_plan_docs.py` | Zero errors/warnings |

These local runs use an existing checkout and test volumes. They do not establish another owner's clean-checkout reproduction.

## Remote implementation verification

[Draft PR #15](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/15) contains implementation commit `23a64ed9c94fe8f097415c6dc050e4e845424491`. Its [pull-request workflow](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43730903905) passed all nine checks: `secret-scan`, `ci-contract`, `server-lint-type`, `server-unit`, `app-check`, `dependency-audit`, `db-migrations`, `server-integration` and `local-stack-smoke`. This proves automated clean-runner setup, Linux scanner controls, application/browser checks, real restricted-role integration, repeated migrations/fixtures and persistence across full-stack container recreation for that implementation commit. The PR checks remain the source for subsequent documentation-only commits.

This is automated evidence, not a consumer's own checkout or a contract approval. The PR remains draft for owner review and handoff acceptance; issue #5 and G1 remain open.

## Pending acceptance and contract review

M1-PH1-T12 requires both other owners to review the existing M1 contract, including:

| Area | Review reference | Zikri | Syauqi |
| --- | --- | --- | --- |
| Error-code registry and response envelope | [System contract](../shared/system-contract.md), `src/server/core/errors.ts` | Pending | Pending |
| Headers/CSP and trusted source handling | [System contract](../shared/system-contract.md), `src/proxy.ts`, `scripts/server.mjs` | Pending | Pending |
| Maintenance behavior and actor lock ordering | [System contract](../shared/system-contract.md), `src/server/core/authorized.ts`, migration 0002 | Pending | Pending |
| Migration order and restricted grants | [Dependency matrix](../shared/dependency-matrix.md), `db/migrations/` | Pending | Pending |

H01/H03/H04/H05/H06/H14 still require producer-commit/proving-test references and a consumer's own branch/commit acceptance in the PR, following the [contribution procedure](../../CONTRIBUTING.md). No consumer names, reviews or approvals are inferred from automated checks. G1 remains open. H20/H21/H24 and retirement of TMP-04 belong to [issue #6](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/6).
