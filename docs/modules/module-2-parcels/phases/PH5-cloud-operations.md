# M2 PH5: Integrated cloud deployment and operational readiness

Owner: Zikri. Phase PH5 of [phase framework](../../../shared/phase-framework.md). Status: Planned. Depends on Naszrul's cloud stack; nothing is provisioned by this plan.

## 1 Objective

The database boundary and M2 behavior hold on the real deployment: roles are bootstrapped and verified on first boot and on an existing volume without resetting credentials, RLS and privileges are proven with the deployed runtime credentials, retention runs on schedule, public tracking is private and rate-limited behind the proxy over HTTPS, and a restored environment has correct grants, RLS and expired data re-anonymized before reopening.

## 2 Entry criteria

- G4 passed; EXT-04 resolved; Naszrul's chosen cloud Next.js/full-Supabase deployment available (M1-PH5-T01, T02, T04 at least in staging).
- Syauqi's volumes and backup/restore environment available for T05 (M3-PH5-T01, T04).

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| chosen cloud host, proxy, TLS, secrets, first-boot script | Naszrul M1-PH5-T01-T04 | H50 | Local production-like Compose with TLS terminated by the same proxy config for dry runs |
| Persistent encrypted Supabase volumes mounted for PostgreSQL | Syauqi M3-PH5-T01 | H51 | Named volumes for rehearsals |
| Real client-IP behavior behind proxy | Naszrul M1-PH5-T12 | H53 | none; T07 blocked |
| Restore environment from backup | Syauqi M3-PH5-T04 | H54 | PH4 local drill |

Independent now: T01 (scripts), T06 (queries on a local copy).

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH5-T01 | Run app-role bootstrap/verify_grants inside deployed full Supabase PostgreSQL; preserve vendor roles/schemas; apply app migrations once privately. Existing passwords unchanged. Compare catalog grants to snapshot and prove app schema unavailable through public Supabase Data API/GraphQL/Realtime | Empty/existing setup and deliberate grant-drift negative control pass | TC01, TC02 | H50 |
| M2-PH5-T02 | Configure restricted pg pools, connection/lock/statement timeouts and query redaction for the actual host; pin vendor configuration and verify DB/Storage persistent volumes. A transaction always stays on one client; transaction pooler mode must be tested for app roles and SET LOCAL semantics before use | Resource/connection settings measured and documented; no assumption of unlimited serverless connections | TC03 | H51 |
| M2-PH5-T03 | Run portable RLS/catalog/transaction-reuse/tracking boundary tests against the actual deployed Supabase database using app_runtime/tracking_runtime from a private test runner. Check gateway bypass attempts with anon/authenticated keys as well | Connected role asserted; no owner/service-role substitution; synthetic data only | TC04 | T01 |
| M2-PH5-T04 | Retention on the live stack: backdate synthetic parcels in a test dataset, execute the scheduled `retention_anonymize` job twice and after interruption, confirm photo denial and purge with Syauqi, tracking unchanged, logs contain no personal data | First safe scheduled run recorded; failure alert recipient confirmed | TC05 | H51, M3-PH5-T03 |
| M2-PH5-T05 | Post-restore verification in Syauqi's isolated restore environment: recreate roles with the bootstrap script, check grants against the snapshot, run the RLS subset, run retention so expired data is anonymized and photos denied before reopening, confirm tracking and Seller lists | S-09 and INT-12 database legs pass | TC06 | H54 |
| M2-PH5-T06 | Query behavior on chosen cloud host at project scale: load synthetic scale data, run the PH4 plan checks and timing for list/search/lookup/detail/dashboard/Admin list, record numbers and instance size | Recorded measurements; no claim beyond them | TC07 | none (M3-PH5-T07 samples after this task) |
| M2-PH5-T07 | Public tracking over HTTPS: privacy inspection (body, DOM, headers, storage, referrer), `no-store` preserved by the proxy, rate limit keyed to the real client behind the proxy, request logs without tokens, 429 behavior with `Retry-After` | INT-07 on the live URL passes | TC08 | H53 |
| M2-PH5-T08 | M2 cloud journeys: INT-01 (Seller registers and creates), INT-04 (cross-user), INT-07, INT-08 (pooled isolation via repeated alternate-user requests), INT-11 (retention interruption leg) | Pass on the live URL with recorded commit and release identifiers | TC09 | G5 inputs |

## 5 Affected components

`infra/db/` app-role bootstrap and grant checks, `infra/supabase/` reviewed overrides, `src/server/core/db.ts`, private operations runner, job configuration and later database runbook. Application-schema migrations never replace vendor migrations.

## 6 Security requirements

No database credential reuse across roles; no public database port; deployed runtime roles retain minimal privileges; grant drift detected; synthetic data only; logs without personal data; post-restore expired data anonymized before reopening. Policies P1, P3, P4.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH5-TC01 | Operations (OPS-06) | Empty-volume bootstrap + migration; then rerun on the same volume | Roles/attributes as specified; second run changes nothing; no worker runs migrations | REV-06, REV-07 |
| M2-PH5-TC02 | Operations (OPS-08) | `verify_grants` clean; then deliberate grant change in a disposable instance | Clean passes; drift fails with the changed object named | RLS-09 |
| M2-PH5-TC03 | Operations | Inspect actual deployed Supabase DB config, connected role, TLS/network access and persistent volume settings | DB/admin ports restricted; expected timeouts and persistence; vendor schema ownership intact | S-02, S-07 |
| M2-PH5-TC04 | Operations (OPS-08) | RLS/privilege subset under deployed credentials | Pass; connected roles asserted | RLS-01..RLS-09 |
| M2-PH5-TC05 | Operations (OPS-03) | Scheduled retention twice and interrupted on backdated synthetic parcels | Anonymized exactly once; photo denied then purged; tracking intact; alert path works | M2-10, INT-11 |
| M2-PH5-TC06 | Operations (OPS-07) | Restored environment: roles, grants, RLS, retention rerun | Grants equal snapshot; expired data anonymized before reopen | S-09, INT-12 |
| M2-PH5-TC07 | Operations (OPS-09) | Scale dataset on chosen cloud host | Plans are index-based; timings recorded with instance type | capacity |
| M2-PH5-TC08 | Browser and operations (E2E-P06) | Public tracking on HTTPS for all statuses; burst of 40 lookups | Only status/time; headers correct; 429 after threshold from the real source; no tokens in logs | M2-06, M2-07 |
| M2-PH5-TC09 | Browser (E2E-P06) | M2 journeys on live URL | Pass for all legs listed in T08 | rubric 1b |

## 8 Deliverables and handoffs

H52 (grant verification and RLS runner under deployed credentials) to Naszrul and Syauqi; database verification results feed restore evidence (H54 consumer). Consumed: H50, H51, H53, H54.

## 9 Exit criteria

- T01-T08 complete; TC01-TC09 pass with recorded commit, release identifiers and timestamps.
- No grant drift; RLS subset passes with deployed credentials; retention verified on schedule.
- Contributes to G5 items 1-5, 7.

## 10 Integration checkpoint

Run INT-01, INT-04, INT-07, INT-08, INT-11 and INT-12 database legs on the live stack alongside Naszrul's and Syauqi's cloud journeys, on one release candidate.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Bootstrap resets a password on rerun | Test TC01 compares hashes; fix script; rotate affected credentials |
| Instance too small for tests plus app | Run heavy plan checks on a copy or temporarily larger instance; record instance used |
| Real client IP unavailable | Block release of rate limits; fix proxy header trust before G5 |
| Grant drift after restore | Reapply bootstrap and migrations; investigate source; keep site closed until verified |

## 12 Deferred work

Final evidence document, rehearsal and release record (PH6).
