# Phase 1 local implementation record

22 October 2026, branch `codex/phase1-foundation`. **All three modules are in progress; G1 is not signed off.** Remote CI, owner approvals, branch protection, lecturer acceptance and cloud deployment remain unverified or pending. Checkpoint exports remain historical prototype evidence.

## Implementation by module

| Module | Implemented locally | Remaining PH1 work |
| --- | --- | --- |
| M1 — Naszrul | Next.js shell/health route; server settings/errors/redaction; trusted loopback adapter/Host validation; nonce report-only CSP; auth/session schema and narrow actor/snapshot functions; principal helpers; API client/session provider; Argon2id and starter denylist; pinned CI/CODEOWNERS skeleton | Full CI job matrix and history-aware secret scanning with negative controls; remaining auth-lock/provider/session cases and real HTTP test factory; broader reviewed password denylist and hash-parameter settings; reviews/external records |
| M2 — Zikri | Private role bootstrap; ordered migrations 0001–0003; hardened SQL template/lint; bounded pg transactions; forced RLS; shared constants/Zod DTOs; phone/decimal/token validation; guarded synthetic fixtures; health-only OpenAPI snapshot | Template/clone-per-test isolation, remaining owner-policy/constraint/concurrency matrices, complete contract-to-runtime parity and team review |
| M3 — Syauqi | Real-role integration harness with isolated full Compose profile; desktop/phone Playwright; 17 generated hostile-file fixtures; exhaustive delivery rules; private Storage API/staging; bounded Sharp sanitizer; backup-lock prototype; proof/function drafts and reconciliation design | Authenticated role contexts after PH2 endpoints; controlled clocks/failpoints; draft validation after real 0004 exists; remaining function drafts/design approvals; peak-memory/capacity measurement |

Real login/registration/logout/CSRF/rate-limit endpoints, parcel registration/search/tracking, Rider updates, proof routes and dashboards are PH2/PH3 work. The separately tested session provider will be connected when its endpoints exist. No production header supplies test identity, and no usable fixture credential is committed.

## Verification

| Check | Local result |
| --- | --- |
| `npm run check` | 301 unit/component tests in nine files pass, with type checking, ESLint, SQL hardening and DTO/OpenAPI drift checks |
| Test-profile integration suite | 12 tests in five files pass: pooled RLS context/denials, auth locks, runtime role assertions, exact enum parity, parcel constraints, draft proof constraints, Data API denial, Realtime exclusion, private Storage and backup coordination |
| Production-build browser suite | Six checks pass across desktop Chrome and Pixel 7 viewport: navigation, private headers, overflow and rejected untrusted Host |
| `npm run build` | Next.js production build passes locally |
| `npm audit --audit-level=high` | Zero reported vulnerabilities at verification time |
| Full Supabase stack | All 11 default services healthy, published ports loopback-only, development/test volumes and credentials separate |
| Repeated init/bootstrap/migrate/fixtures and container recreation | Credentials, account hashes, grants, fixture counts and private Storage bytes preserved |
| File fixtures | 17 cases generated outside served paths; valid/trailing-payload images sanitized, hostile files/names rejected |
| Sharp spike | Native Node 24.14/Windows compatibility verified with full Supabase running; private JSON records one 1.92 MP JPEG's elapsed time/RSS delta, not peak/capacity evidence |

Private logs, traces and credentials remain in ignored `.local/`, `.env*.local`, `test-results/` and `playwright-report/`. These executable counts do not mean every planned TC identifier or security-worksheet row has passed.

The initial uncommitted migration prototype caught an ownership issue under Supabase's restricted operator: function revokes/grants must execute as the function owner. The SQL now does so explicitly. The isolated prototype ACLs were corrected and checked through restricted connections; the corrected chain is also applied to the fresh development database. Shared/applied revisions must thereafter change through new forward migrations.

The proof-table draft is tested over 0003 inside a rolled-back transaction, not merged as a production migration or claimed tested after the future 0004. The current harness uses sequential suites, read-only seeded data and unique Storage keys; per-test database cloning remains open.

## Remaining gate evidence

G1 still needs the remaining PH1 cases/jobs, green remote CI, clean-checkout reproduction by another owner, handoff acceptance and contract review. External records retain unverified/deferred status. Follow the [runbook](local-development.md) and module PH1 plans for the remaining work.
