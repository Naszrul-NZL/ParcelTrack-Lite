# Contributing to ParcelTrack Lite

Each module owner implements their module's UI, server logic, migrations and tests on a branch, then opens a pull request (PR) targeting `main`. Use the [execution sequence](docs/shared/execution-sequence.md#contributor-starting-point) to choose a bounded task and the [implementation status](docs/implementation-status.md#foundation-handoff-status) to see what already exists.

## Merge the shared baseline first

The shared baseline is prepared on `chore/contributor-handoff-baseline`. Push that branch, open its PR against `main`, review the changes and required check results, then merge it before contributors branch from `main`. Local commits alone do not make the foundation available to the team. This procedure does not claim that the baseline PR has already merged.

After the baseline merges, everyone updates `main` and creates their task branch from it. Existing work branches should incorporate the merged baseline before using its helpers; preserve any work already on those branches.

## Start a task branch

With a clean working tree, for example:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/m2-parcel-registration
```

Choose a branch name for your module and bounded task. Follow the [local setup guide](docs/local-development.md) for dependencies, private configuration and verification.

| Owner | Module | Shared coordination |
| --- | --- | --- |
| Naszrul | M1: authentication and user management | Shell, shared UI, session/CSRF services and CI |
| Zikri | M2: parcel registration and public tracking | Database roles, migration order, RLS and grants |
| Syauqi | M3: delivery updates and Admin dashboard | Test harness, Storage and image pipeline |

Use the [frontend foundation](docs/shared/frontend-foundation.md) and [backend/test foundation](docs/shared/backend-foundation.md). Before UI work, read [DESIGN.md](DESIGN.md) and the [design contribution guide](docs/design/CONTRIBUTING.md). Coordinate changes to shared files with their [owners and reviewers](docs/shared/dependency-matrix.md#ownership-of-shared-assets) before changing a shared interface.

## Work in parallel within the agreed dependencies

M1, M2 and M3 can develop independent tasks at the same time. M2/M3 can draft database functions and test protected services using the isolated harness and permitted temporary fixture sessions while M1 completes real login/session handling. These fixtures do not prove real login or complete authenticated user journeys. H20 remains the dependency for those journeys; TMP-04 must be retired before G2.

Check the [handoff register](docs/shared/dependency-matrix.md) before consuming unfinished work. Follow its permitted substitutes and the [overlap rule](docs/shared/phase-framework.md#overlap-rule); a merged baseline does not by itself pass G1 or accept every handoff.

Keep shared changes small and coordinated. Consumers can develop against the agreed contract, but must integrate the producer's merged implementation before claiming the dependent work complete. Merge database migrations in their [registered order](docs/shared/dependency-matrix.md); update later migration branches onto the merged head and never edit an applied revision.

## Open a PR against main

Commit the task, push your branch and open a PR with base branch `main`. Open a draft PR when useful for early coordination; clearly identify missing dependencies before requesting merge.

Include:

- The problem addressed and resulting behavior, with task IDs and affected handoffs.
- Checks actually run, their results and any known limitations or temporary substitutes still in use.
- Updated module progress and evidence references. If endpoints, DTOs, statuses or permissions change, update the authoritative contract, affected phase files and tests in the same PR.
- Screenshots and responsive/accessibility evidence for UI changes, following the design guide.

For application changes, run `npm run check`, `npm run build` and the relevant integration/browser checks using the [local runbook](docs/local-development.md#tests). Run `npm run security:local` after a build and `python tools/check_plan_docs.py` for documentation changes. Documentation-only changes need the documentation checker and diff review; they do not require an application rebuild. Keep credentials, local configuration and private test artifacts out of commits.

## Review and merge

Request review from the affected module/shared owners listed in [CODEOWNERS](.github/CODEOWNERS) and the [shared ownership table](docs/shared/dependency-matrix.md#ownership-of-shared-assets). Contract changes require both other owners to review; privilege changes require all three approvals. Group gates require all three owner sign-offs with evidence.

Before merging, resolve review feedback and conflicts, confirm prerequisite PRs have merged, incorporate current `main`, and ensure the applicable PR checks pass on the final changes. Record checks that could not run and keep the PR pending if they are required. Do not push feature work directly to `main`. Review and check requirements apply even if GitHub does not automatically enforce them; checked-in branch-protection settings do not prove the remote repository's configuration.

A handoff is delivered only after its producer's work merges, the proving test passes and a consumer confirms in the PR that they exercised it from their own branch. After a PR merges, everyone whose work depends on it updates their branch from `main` and reruns the affected checks. Start the next independent task on a fresh branch from updated `main`.
