# M1 foundation CI evidence

Recorded 15 November 2026 for [issue #5](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/5), M1-PH1-T11/T12 and M1-PH1-TC12. This record supplies the completed implementation, executable evidence and the user's issue-specific owner-review waiver. G1 acceptance remains separate.

## Baseline and scope

Baseline [PR #4](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/4) merged as `e2c8cb56c53e57681833f850fb93052d46c928b0`. Its [main-branch workflow](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43444926553) completed successfully with the original `app-check` and `server-integration` jobs. That result did not prove the missing history scanner or owner acceptance.

The follow-up preserves the existing checks while exposing the planned PH1 check names: `server-lint-type`, `server-unit`, `ci-contract`, `app-check`, `secret-scan`, `dependency-audit`, `db-migrations`, `server-integration` and `local-stack-smoke`. The three stack checks share the existing setup as isolated matrix jobs. The smoke check repeats setup and recreates containers, verifies database/Storage persistence, builds the app and runs the production foundation browser cases. Dependency audit is report-only in PH1 as planned. PH2 `authz-matrix` and real `e2e-core` remain dependent on H20; preview tests do not replace them.

## Scanner and controls

`npm run security:scan` uses [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). The installer pins the Linux x64 and Windows x64 archive SHA-256 values from that release, verifies downloaded/cached archives and extracts the verified binary before each invocation. It requires no npm dependencies. CI fetches full history with `fetch-depth: 0`; a shallow history scan fails rather than reporting incomplete success.

The tree scan copies Git-visible tracked and nonignored untracked regular files to a disposable directory. Ignored local credentials/build artifacts stay private. The history scan uses `--all --full-history -m`, including merge diffs. Default detection rules remain enabled. Raw reports and matched values are never printed or uploaded; output identifies only mode, rule, path and line. The separate `security:local` exact-value check continues to scan generated local credentials against Git-visible files and built browser assets.

`npm run security:controls` creates and removes an isolated temporary Git repository. It proves:

- Clean tree/history and the exact inert exceptions pass.
- An uncommitted, nonfunctional provider-shaped canary fails the tree scan while history stays clean.
- A generated generic-key canary in an allowlisted upstream-test path is still detected.
- After committing and deleting the canaries, the clean tree passes and history still detects the earlier canaries.
- A real two-parent merge introduces a canary only during conflict resolution; after deletion, the tree passes and merge history still detects it.

These repeatable controls use a fixed, nonfunctional high-entropy fixture, avoiding random entropy and detector-stopword failures. The generic-key assertion checks the exact fixture path as well as the rule. CI controls stay in disposable local repositories. The separate original TC12 remote-branch procedure was also completed as recorded below; no canary enters the implementation branch or `main`.

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

These first local runs used an existing checkout and test volumes. The independent clean-checkout reproduction below additionally proves fresh setup; it does not impersonate another owner's approval.

## Actual remote negative controls

Both controls used the production scanner script and its pinned default rules. Only the throwaway branches' workflow was reduced to the unchanged `secret-scan` job, avoiding unrelated full-stack jobs during an expected failure. Generated generic-key fixtures were explicitly nonfunctional and belonged to no account or service. The branches were tested sequentially and removed before the final clean PR checks because `--all` scans fetched branch refs too.

| TC12 control | Branch and commit | Observed remote result |
| --- | --- | --- |
| Canary present at branch tip | `test/m1-ph1-tc12-tree-20261115`, `d6f3926ddf022729bce1d56574a3c60a60d993c5` | [Run 43732247829](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43732247829): controls pass; production scan reports one tree and one history `generic-api-key` finding at `ci-secret-canary.txt:2`, exits 1; job/workflow fail as required |
| Canary deleted before branch tip is pushed | `test/m1-ph1-tc12-history-20261115`, `42993a2a6cce01924c7f824b589712892b6a58cf`; planted in parent `282ddca` | [Run 43732449430](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43732449430): controls pass; production scan reports zero tree findings and one history `generic-api-key` finding at `ci-secret-canary.txt:2`, exits 1; job/workflow fail as required |

Both remote refs were deleted after their logs were checked. `git ls-remote --heads origin 'test/m1-ph1-tc12-*'` returned no refs. A subsequent clean implementation scan returned zero tree/history findings. Expected failures above are successful negative-control evidence, not failures of the implementation PR.

## Independent clean checkout and handoff execution

Cloned the GitHub implementation branch into ignored `.local/issue5-clean/` at `8cac67ea1b47d185480b146ed82092904bd176ec`, installed with the Node.js 24.14.0 executable and `npm ci`, fetched the immutable upstream environment template and generated fresh private configuration. A separate Compose project `parceltrack-issue5-clean` created fresh PostgreSQL/Storage volumes, preserving the original development/test projects. Application test ports stayed 54323/8001/3100; only pooler host ports were overridden to 55441/55442. All 11 default services became healthy.

Bootstrap, migration twice, fixtures twice, role/grant verification, private bucket initialization, 316 unit/component tests, 31 integration tests, production build and all 16 browser cases passed. Exact generated-credential scanning passed. Repeating local configuration, bootstrap/migrate/fixtures and container down/up preserved credentials, account hashes, grants, counts and the probe's private Storage bytes; post-restart role verification passed. Test containers are stopped after verification with volumes retained.

The checkout was then fast-forwarded to scanner-fix commit `3db2371fddc525f34bed5d607c0967eb40feb64f`. Full `npm run check`, clean tree/history scanning and all controls, including merge-only history, passed again. App/runtime source and dependencies were unchanged by those scanner fixes. This execution was performed by Codex, not claimed as a teammate's action.

| Handoff | Producer evidence | Consumer checkout and proving execution |
| --- | --- | --- |
| H01 | Baseline PR #4, merged `e2c8cb5` | Codex clean checkout `8cac67e`/`3db2371`: fresh full stack, build, health/Host/browser smoke and restart persistence |
| H03 | Same baseline, migration 0002 | Clean bootstrap/migration/grants plus `auth-locks.test.ts` actor-role/version/must-change and temporary-shadow cases |
| H04 | Same baseline, protected session/transaction helpers | `authorized.test.ts` exercises real fixture sessions, role refusal, CSRF, revoke/expiry/disablement and maintenance behavior; real session issuance remains H20 |
| H05 | Same baseline, shared errors/logging | `auth-core.test.ts` safe validation/error/redaction cases plus production browser header/no-store checks |
| H06 | Same baseline, API client/provider | `session.test.tsx` safe-principal/401, CSRF, identity clearing and unsafe-retry cases |
| H14 | Same baseline, Argon2id service | `auth-core.test.ts` password cases and twice-run fixture loader; hashes preserved by persistence probe |

This supplies reproducible producer/consumer execution evidence. Separate teammate sign-offs for issue #5 are waived as below; remaining module-specific handoff/G1 evidence stays governed by the wider phase plan.

## Remote implementation verification

[PR #15](https://github.com/Naszrul-NZL/ParcelTrack-Lite/pull/15) contains the implementation and completion evidence. Its earlier [pull-request workflow](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43730903905) passed all nine checks at `23a64ed9c94fe8f097415c6dc050e4e845424491`: `secret-scan`, `ci-contract`, `server-lint-type`, `server-unit`, `app-check`, `dependency-audit`, `db-migrations`, `server-integration` and `local-stack-smoke`. The [subsequent run](https://github.com/Naszrul-NZL/ParcelTrack-Lite/actions/runs/43731294325) passed all nine at `8cac67e`. Current PR checks and merge state are authoritative for the later scanner fixes and this completion record.

One user-authorized subagent independently reviewed the CI implementation. It reproduced a missed merge-only historical secret and identified random-canary flakiness. Commits `cacfbb3` and `3db2371` add merge diffs/regression coverage, deterministic fixtures and exact-path assertions. The subagent's final read-only verification found all reported issues resolved and no new concrete issue. Passing control runs were executed by the primary agent.

## Issue-specific review waiver and wider gates

On 15 November 2026, the user explicitly instructed Codex in this chat to abandon the other owners' review requirement for this work, proceed, and use one subagent for critique/code review. This overrides the usual manual-review hold for issue #5 and PR #15 only. No teammate approvals or actions are fabricated. The requested independent code critique and its fixes are recorded above. The waiver does not mark G1 passed or waive unrelated modules' work.

The original M1-PH1-T12 contract areas remain documented for reference; separate Zikri/Syauqi approvals are waived for this issue:

| Area | Review reference | Zikri | Syauqi |
| --- | --- | --- | --- |
| Error-code registry and response envelope | [System contract](../shared/system-contract.md), `src/server/core/errors.ts` | Waived | Waived |
| Headers/CSP and trusted source handling | [System contract](../shared/system-contract.md), `src/proxy.ts`, `scripts/server.mjs` | Waived | Waived |
| Maintenance behavior and actor lock ordering | [System contract](../shared/system-contract.md), `src/server/core/authorized.ts`, migration 0002 | Waived | Waived |
| Migration order and restricted grants | [Dependency matrix](../shared/dependency-matrix.md), `db/migrations/` | Waived | Waived |

Issue #5's executable work and evidence are complete under this narrow waiver; its PR/check/merge state supplies the final delivery record. Wider G1 remains open. H20/H21/H24 and retirement of TMP-04 belong to [issue #6](https://github.com/Naszrul-NZL/ParcelTrack-Lite/issues/6).
