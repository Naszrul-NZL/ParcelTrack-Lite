# M3 PH5: Integrated cloud deployment and operational readiness

Owner: Syauqi (backup, durable storage and restore coordinator for the group). Phase PH5 of [phase framework](../../../shared/phase-framework.md). Status: Planned. Nothing is provisioned by this plan; cloud actions need EXT-04 values and the team's explicit instruction.

## 1 Objective

After local acceptance, prove durable full-Supabase database and private Storage objects on the chosen cloud host, matching encrypted backups, scheduled private jobs, restart/redeploy persistence and Rider/Admin/Seller journeys. Cloud provider, budget and resources remain open; local self-hosted Supabase is the implementation baseline.

## 2 Entry criteria

- Local G4 and matching app-data/Storage restore drill passed.
- EXT-04 resolved; Next.js and full Supabase hosting available from M1.
- Private backup destination, encryption-key custody and recovery operators recorded.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| chosen cloud host host, restricted credentials, proxy and production Compose | Naszrul M1-PH5-T01, T02 | H50 | Local Compose for dry runs |
| First-boot script and Admin provisioning | Naszrul M1-PH5-T04 | H50 | none |
| Grant verification and RLS runner | Zikri M2-PH5-T01, T03 | H52 | PH4 local checks |
| Post-restore session purge and lock reapplication | Naszrul M1-PH4-T05, M1-PH5-T08 | H42 | none |

Independent now: T01 design, T02 scripts and policies written in advance, T06 test plan.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH5-T01 | Persistent full Supabase storage: durable PostgreSQL and Storage object volumes, private delivery-proofs bucket and API credentials, encryption/permissions under chosen host, documented volume lifecycle. Next.js has no direct access to service file layout; bucket/API checks enforce private access | Recreate services preserving rows/objects; direct anonymous object/Studio access denied | TC01 | H50 |
| M3-PH5-T02 | Choose private encrypted off-host backup destination after EXT-04; archive matching app-schema data, Storage API manifest/bytes and recovery configuration, use age public-key encryption with two offline private-key holders, apply 30-day expiry including old versions, restrict write/recovery credentials and test failure notification. Keep account journal outside DB restore | Destination/credential/retention review and encryption/decryption negative controls; no assumed hosted managed backups | TC02 | EXT-04 |
| M3-PH5-T03 | Choose host-appropriate scheduler for private TypeScript runner: daily retention/proof purge/session cleanup, settled-orphan reconciliation and coordinated backups. Credentials scoped per job; locks prevent overlap; observe first run, idempotent second run, interruption and failure notification | Actual scheduler, last/next run and alert recipient recorded | TC03 | M1-PH4-T06, M2-PH4-T03, M3-PH4-T02/T04 |
| M3-PH5-T04 | Repeat local matching app-data/Storage restore procedure in isolated cloud environment if resources allow (STRETCH cloud; SHOULD locally): compatible full Supabase, app-role bootstrap/migrations, app-schema data-only restore, bucket/object recreation through Storage API, then session purge, journal reconciliation/quarantine and retention. Verify counts/history/hashes/grants/fresh login/old cookie; keep live environment untouched | Observed backup age/restore time; restricted test environment removed after evidence; skipped cloud stretch remains honestly reported | TC04 | H52, H42 |
| M3-PH5-T05 | Restart/redeploy Next.js and full Supabase containers; replace app build and restart host where supported without deleting volumes. Verify DB rows, private objects, schema revision and session behavior; sessions may survive normal restart but never database restore | Persistence evidence on actual host; no destructive reset command | TC05 | H50 |
| M3-PH5-T06 | Android browser or documented 4G emulation: login/list/start/finalize with valid image up to 3 MiB, 4 MiB body cap; slow/interrupted upload and uncertain-commit UI. Tune measured timeout/memory settings; a hosted platform cap still applies if chosen later | Timings and clean failure/reconciliation results; no inconsistent status/proof | TC06 | H50 |
| M3-PH5-T07 | Capacity sampling on the chosen instance: peak memory during image validation with concurrent uploads (about 15 Riders), Admin list and dashboard query times at the project-scale dataset, backup duration and size; no sustained-load claim beyond the measurements | Table of measurements with instance type | TC07 | M2-PH5-T06 |
| M3-PH5-T08 | M3 cloud journeys on the live URL: INT-02 (Delivered), INT-03 (Failed), INT-05 (disable and reassign), INT-10 (object/database failure checks that are safe online, such as forced storage-unavailable in a staging copy), INT-12 (first boot, restart, restore) | Pass with recorded commit, release identifiers and timestamps | TC08 | G5 inputs |
| M3-PH5-T09 | Reconciliation and purge jobs on the cloud: create an orphan file and an anonymized parcel with proof in a test dataset, run scheduled jobs, confirm correct deletion/preservation and alert path | Logged job results show counts only | TC09 | T03 |

## 5 Affected components

`infra/supabase/` persistence overrides, server-only Supabase Storage adapter, private backup/restore and TypeScript job scripts, chosen scheduler and future runbooks. No direct mutation of vendor Storage files or metadata.

## 6 Security requirements

Encrypted volumes and bucket, least-privilege access, no public access to proofs or backups, backup encryption key custody, restore never revives sessions or expired personal data, private private proof bucket, timeouts and body caps at the proxy, secrets only in intended jobs. Policies P3 (retention applied after restore), P4, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH5-TC01 | Operations | Inspect DB/Storage volume lifecycle and encryption/permissions; recreate services; request private objects and Studio anonymously | Data/objects retained; private infrastructure and proofs denied | S-07, M3-05 |
| M3-PH5-TC02 | Operations | Backup destination privacy/expiry, write/recovery credential scope, encrypted archive and offline-key recovery | No public backup; correct credentials/key required; retention documented | P3 backup interpretation |
| M3-PH5-TC03 | Operations (OPS-03) | Timers' first run, second run, forced failure, concurrent copy | Jobs succeed idempotently; failure alerts the recorded recipient; no overlapping copies | REV-08 |
| M3-PH5-TC04 | Operations (OPS-07) | Full restore exercise per T04 | All verification items pass; revoked cookie 401; expired data anonymized before reopening; timing and backup age recorded | S-09, INT-12 |
| M3-PH5-TC05 | Operations (OPS-06) | Container kills, redeploy, reboot | Rows and photos intact; migration revision unchanged; services healthy | S-07 |
| M3-PH5-TC06 | Operations / device | Android 4G upload of 3 MiB and slow link | A 3 MiB upload completes within 60 s on the 4G profile, or fails cleanly with the uncertain-state UI and no inconsistent state; timeouts tuned from the recorded timings | M3-F03 |
| M3-PH5-TC07 | Operations (OPS-09) | Concurrent validations, dashboard/list timings, backup duration | Measured values recorded | capacity |
| M3-PH5-TC08 | Browser (E2E-D04) | Delivered, Failed, disable/reassign, proof viewing on live URL, phone viewport | Pass; public tracking shows status/time only | rubric 1b |
| M3-PH5-TC09 | Operations | Orphan file and anonymized parcel with proof under scheduled jobs | Orphan removed only when safe; photo denied then purged; logs without personal data | M2-10, REV-13 |

## 8 Deliverables and handoffs

H51 (volumes, backups, timers) to Naszrul and Zikri; H54 (restore environment and runbook) to Naszrul and Zikri for their post-restore verification. Consumed: H50, H52, H42.

## 9 Exit criteria

- Required MUST/SHOULD tasks pass with recorded evidence; T04 cloud restore and T09 cloud orphan scheduling keep their STRETCH tier and are reported honestly if deferred.
- Local matching app-data/Storage restore already passed at G4; cloud restart/redeploy preserves data and required scheduled jobs run. Record cloud stretch-drill results separately.
- Contributes to G5 items 1, 3-7.

## 10 Integration checkpoint

On one release candidate, Naszrul's cloud auth journeys, Zikri's database and tracking checks and Syauqi's delivery/restore journeys run in sequence; restore verification uses all three owners' checks.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Backup key lost | Two named holders; offline copy; test decryption in the restore exercise |
| Restore reveals expired data | Retention rerun before reopening is part of the runbook and TC04 |
| Upload timeouts on 4G | Adjust timeouts and limits from measurements; keep size limit |
| Volume loss on termination | Volume lifecycle and deletion settings reviewed for the chosen host; restore from backup; no availability claim |

## 12 Deferred work

Final regression, test document, rehearsal and release record (PH6). Multi-AZ replication and managed backup services are out of scope.
