# First execution sequence

This is the order in which each member starts. It follows the [dependency matrix](dependency-matrix.md) so that nobody waits on something that is not yet buildable. No calendar dates are assumed except the team's checkpoint on 22 October 2026. Phase 1 has started locally for all modules; [actual evidence and open work](../phase-1-progress.md) distinguish implementation from remaining tasks. The order below remains the plan.

## Rules for the first stretch

1. One PR merges the reviewed plan set and the [contract v3 amendments](system-contract.md#contract-v3-amendments). All three approve (M1-PH1-T12, M2-PH1-T09, M3-PH1-T09) before code branches rely on them.
2. The critical path is **role bootstrap and node-pg-migrate base (Zikri) -> auth tables and `lock_active_actor` (Naszrul) -> parcel tables and fixtures (Zikri)**. Zikri's first two tasks and Naszrul's skeleton task are therefore the first merges.
3. Every `(CP)` task in a PH1 or PH2 file is checkpoint-critical (the list includes the minimal error envelope and logging, API client, DTOs, validators and the read-only detail route that the slices need). Handoffs during PH1 and PH2 count as delivered when merged to the integration branch with the proving test passing locally; evidence for 22 October is the local subset in the [phase framework](phase-framework.md#checkpoint-execution-rules). Non-CP tasks wait if time is short, and the checkpoint report says what was left out.
4. Tests are written with the feature in the same PR. No feature merges without its listed security case.

## Order by member

### Naszrul (M1)

| Order | Task | Why now | Unblocks |
| --- | --- | --- | --- |
| 1 | M1-PH1-T01 repository skeleton and locked dependencies, then M1-PH1-T02 settings | Everyone else needs a place to commit | Zikri's T02/T03, Syauqi's T01 |
| 2 | M1-PH1-T03 local full Supabase Compose and Next.js | Database and API run locally | All integration tests |
| 3 | M1-PH1-T13 external checks in parallel and on the first day: EXT-01 allocation receipt, EXT-02 written lecturer acceptance plus the Week 14 date (EXT-08), EXT-03, EXT-04 recorded as deferred until local acceptance, EXT-05 identities | Lead time outside the plan; a refusal under EXT-02 is the largest single risk | Local PH3 proceeds; hosting decision needed for PH5 |
| 4 | M1-PH1-T10 password service, M1-PH1-T04 and T05 error envelope and log redaction | Independent; fixtures need hashing | Fixture loader (H14) |
| 5 | M1-PH1-T06, then T07 auth_core migration and `lock_active_actor` (as soon as Zikri's T01/T02 merge) | Second link of the critical path | Zikri's 0003 and `create_parcel`; Syauqi's functions |
| 6 | M1-PH1-T08 auth interface and TMP-01; M1-PH1-T09 API client; M1-PH1-T11 CI (Syauqi wires the harness job) | Others code against the interface | Zikri's A10, Syauqi's A17 |
| 7 | PH2: M1-PH2-T02, T04, T07 (pure services), then T03, T05, T06, T08, T09, T10, T12 | Real login retires TMP-01 for the checkpoint | INT-CP-01 |

### Zikri (M2)

| Order | Task | Why now | Unblocks |
| --- | --- | --- | --- |
| 1 | M2-PH1-T01 role bootstrap, then M2-PH1-T02 node-pg-migrate base, 0001 and function-hardening template with lint | First link of the critical path | Naszrul's T06/T07; Syauqi's drafts |
| 2 | M2-PH1-T04 constants and parity test; M2-PH1-T08 validators and token generator (independent) | Shared definitions | Syauqi's rules; every endpoint |
| 3 | M2-PH1-T03 `unit_of_work` and pools | RLS context for all modules | M1-PH2-T08, A10, A16 |
| 4 | M2-PH1-T05 migration 0003 (merge after Naszrul's 0002) | Parcel and history tables | Everything parcel-related |
| 5 | M2-PH1-T06 fixture dataset and loader; M2-PH1-T07 DTOs | Controlled data for all slices | M1-PH2-T01, M3-PH2-T01 |
| 6 | PH2: M2-PH2-T01 (policies) then T02 `create_parcel`, T03 A10, T04 A11, T06 A12 v1, T05 React, T07 tests, T08 fixtures | Seller slice | INT-CP-01 |
| 7 | M2-PH1-T09 contract amendments review in parallel with steps 1 to 3 | Frozen contract | All |

### Syauqi (M3)

| Order | Task | Why now | Unblocks |
| --- | --- | --- | --- |
| 1 | M3-PH1-T01 minimal harness (role-asserting connections, per-job fresh database), M3-PH1-T03 pure rules with exhaustive unit tests | Independent of others; harness gives all owners role-asserting tests | Everyone's integration tests |
| 2 | M3-PH1-T05 image-library spike and M3-PH1-T04 `ProofStore`; M3-PH1-T06 coordination prototype | Independent; retire design risk early | PH3 pipeline, PH4 backup |
| 3 | M3-PH1-T02 Playwright skeleton and file fixtures; M3-PH1-T08 storage design note; M3-PH1-T09 contract amendments; then, while the spine waits on migrations, pair with Zikri on the role-attribute assertions (RLS-01) and the template-database fixture and with Naszrul on the CI integration job | Syauqi is idle on the critical path otherwise | PH2 browser tests |
| 4 | M3-PH1-T07 migration drafts (merge when 0003 exists) | Prepared for PH2 | M3-PH2-T02 |
| 5 | PH2: M3-PH2-T02 `update_delivery_status`, T03 A17, T04 A16, T01 seeded assigned parcels (TMP-02) after Zikri's loader hook, T05 Rider React, T06 tests, T07 Playwright | Rider slice | INT-CP-01 |
| 6 | M3-PH2-T08 compile INT-CP-01 to INT-CP-03 evidence for the checkpoint report | Group evidence | G2 |

## Smallest checkpoint path if time is very short

If not all of PH1 and PH2 can finish before the checkpoint, protect this chain and disclose anything missing:

1. M1-PH1-T01 to T03 -> M2-PH1-T01, T02 -> M1-PH1-T06, T07, T10 -> M2-PH1-T03, T05, T06.
2. M1-PH2-T02 to T06 (login, logout, CSRF) with the seeded accounts from M1-PH2-T01.
3. M2-PH2-T01 to T04 (create and list parcels) and M3-PH2-T02 to T04 (start delivery and Rider list).
4. React pages M1-PH2-T10, M2-PH2-T05, M3-PH2-T05 and the browser/INT-CP checks.

A partly built slice is reported as partial. A drawing, a mocked UI or text-only change is not a working demonstration.

## After the checkpoint

PH3 starts with the handoffs others wait for: M3-PH3-T01 (proof table), M1-PH3-T01 and T02 (Rider directory and disablement), then the remaining PH3 tasks in parallel. Do not begin PH4 hardening work on code that G3 has not stabilized, except tasks listed as independent in the dependency matrix.
