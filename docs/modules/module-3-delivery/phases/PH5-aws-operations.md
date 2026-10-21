# M3 PH5: Integrated AWS deployment and operational readiness

Owner: Qee (backup, durable storage and restore coordinator for the group). Phase PH5 of [phase framework](../../../shared/phase-framework.md). Status: Planned. Nothing is provisioned by this plan; AWS actions need EXT-04 values and the team's explicit instruction.

## 1 Objective

Proof photos and the database live on durable, encrypted AWS storage; backups are taken under the coordination lock to a private encrypted S3 location; scheduled jobs run; a restore into an isolated environment is exercised and verified; restart and redeploy preserve data; Rider screens work over a real phone connection; and the Admin, Rider and Seller delivery journeys pass on the live URL.

## 2 Entry criteria

- G4 passed (including the local restore drill); EXT-04 resolved; NASZ's EC2 instance, proxy and Compose stack available.
- Backup bucket name, region and key custody agreed by the team and recorded privately.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| EC2 instance, IAM role, proxy and production Compose | NASZ M1-PH5-T01, T02 | H50 | Local Compose for dry runs |
| First-boot script and Admin provisioning | NASZ M1-PH5-T04 | H50 | none |
| Grant verification and RLS runner | Zikri M2-PH5-T01, T03 | H52 | PH4 local checks |
| Post-restore session purge and lock reapplication | NASZ M1-PH4-T05, M1-PH5-T08 | H42 | none |

Independent now: T01 design, T02 scripts and policies written in advance, T06 test plan.

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH5-T01 | Durable storage layout: separate encrypted EBS volumes (or one volume with separate mounts) for PostgreSQL data and `PROOF_ROOT`; review and set DeleteOnTermination so data volumes survive instance replacement; mount options, ownership and mode (proof directory 0700 for the container user); proxy and any static file service have no access path to it; snapshot policy decision | Instance replacement rehearsal keeps volumes; proof directory unreachable via HTTP | TC01 | H50 |
| M3-PH5-T02 | Backup to S3: private bucket with block-public-access, default encryption, versioning with `NoncurrentVersionExpiration` and `AbortIncompleteMultipartUpload` rules and lifecycle expiry at 30 days (D-17; EBS snapshots follow the same expiry or are not used), IAM policy for the instance role limited to writing new backup objects (a bucket policy denies overwrite and delete; IMDSv2 only, hop limit 1), separate operator recovery credentials, **public-key encryption** (age) on the host so the instance holds only the public key and the private key is held offline by two named people (EXT-07); failure notification to a recorded recipient; the account journal prefix is write-only for the instance | Bucket policy review; test that the instance role cannot read, overwrite or delete backups | TC02 | EXT-04 |
| M3-PH5-T03 | Scheduler: systemd timers (or equivalent) running nightly backup, daily runner jobs (retention anonymize, proof purge, reconcile, session/bucket cleanup) with `maintenance_runtime`, and health alerts; jobs use the coordination lock; first run observed and logged; second run idempotent | Timers listed, last/next run recorded, alert path tested by forced failure | TC03 | M1-PH4-T06, M2-PH4-T03, M3-PH4-T02/T04 |
| M3-PH5-T04 | Restore exercise (STRETCH on AWS; the local drill M3-PH4-T07 is the SHOULD baseline) in an isolated environment (second instance or isolated Compose host, not the live one) using synthetic data or a protected same-account environment limited to named operators and destroyed afterwards (D-38): recreate roles with Zikri's bootstrap, decrypt with the offline private key, restore database and proofs from S3 objects using recovery credentials, run compatible migrations, run NASZ's `purge-sessions` and `lock-accounts --from-file`, run retention so expired data is anonymized and photos denied, verify counts, history, sample photo hashes, grants (Zikri's script), login for each role, revoked-cookie rejection; record backup age and observed restore time | Written runbook followed step by step; results recorded without invented guarantees | TC04 | H52, H42 |
| M3-PH5-T05 | Restart and redeploy persistence: stop/kill backend, proxy and database containers without removing volumes, redeploy a new image digest, reboot the instance; verify rows, photos, schema revision and expected session behavior (sessions persist across container restart, never across a database restore) | S-07 evidence from the live stack | TC05 | H50 |
| M3-PH5-T06 | Real-device checks: Android phone browser over 4G (or documented network emulation if no phone is available) for login, list, start delivery and a 5 MiB photo upload; tune proxy upload and read timeouts and body caps (JSON small, upload 6 MiB) from measured timings | Recorded timings and the final timeout values | TC06 | H50 |
| M3-PH5-T07 | Capacity sampling on the chosen instance: peak memory during image validation with concurrent uploads (about 15 Riders), Admin list and dashboard query times at the project-scale dataset, backup duration and size; no sustained-load claim beyond the measurements | Table of measurements with instance type | TC07 | M2-PH5-T06 |
| M3-PH5-T08 | M3 cloud journeys on the live URL: INT-02 (Delivered), INT-03 (Failed), INT-05 (disable and reassign), INT-10 (file/database failure checks that are safe online, such as forced storage-unavailable in a staging copy), INT-12 (first boot, restart, restore) | Pass with recorded commit, digests and timestamps | TC08 | G5 inputs |
| M3-PH5-T09 | Reconciliation and purge jobs on the cloud: create an orphan file and an anonymized parcel with proof in a test dataset, run scheduled jobs, confirm correct deletion/preservation and alert path | Logged job results show counts only | TC09 | T03 |

## 5 Affected components

`infra/storage/`, `infra/backup/` (S3 upload, encryption), systemd units or scheduler config, `docs/runbooks/{backup,restore}.md`, bucket and IAM definitions (documented; created only on instruction), proxy upload settings.

## 6 Security requirements

Encrypted volumes and bucket, least-privilege IAM, no public access to proofs or backups, backup encryption key custody, restore never revives sessions or expired personal data, private proof directory, timeouts and body caps at the proxy, secrets only in intended jobs. Policies P3 (retention applied after restore), P4, P5.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH5-TC01 | Operations | Inspect mounts, ownership, DeleteOnTermination; request proof paths through the proxy; replace instance in rehearsal | Volumes encrypted and retained; proof directory not served; 404/403 on direct paths | S-07, M3-05 |
| M3-PH5-TC02 | Operations | Bucket public-access settings, policy, instance-role attempts to read/delete, restore credential, encryption, lifecycle | Private; role can only write; recovery works only with operator credentials; expiry rule present | P3 backup interpretation |
| M3-PH5-TC03 | Operations (OPS-03) | Timers' first run, second run, forced failure, concurrent copy | Jobs succeed idempotently; failure alerts the recorded recipient; no overlapping copies | REV-08 |
| M3-PH5-TC04 | Operations (OPS-07) | Full restore exercise per T04 | All verification items pass; revoked cookie 401; expired data anonymized before reopening; timing and backup age recorded | S-09, INT-12 |
| M3-PH5-TC05 | Operations (OPS-06) | Container kills, redeploy, reboot | Rows and photos intact; migration revision unchanged; services healthy | S-07 |
| M3-PH5-TC06 | Operations / device | Android 4G upload of 5 MiB and slow link | A 5 MiB upload completes within 60 s on the 4G profile, or fails cleanly with the uncertain-state UI and no inconsistent state; timeouts tuned from the recorded timings | M3-F03 |
| M3-PH5-TC07 | Operations (OPS-09) | Concurrent validations, dashboard/list timings, backup duration | Measured values recorded | capacity |
| M3-PH5-TC08 | Browser (E2E-D04) | Delivered, Failed, disable/reassign, proof viewing on live URL, phone viewport | Pass; public tracking shows status/time only | rubric 1b |
| M3-PH5-TC09 | Operations | Orphan file and anonymized parcel with proof under scheduled jobs | Orphan removed only when safe; photo denied then purged; logs without personal data | M2-10, REV-13 |

## 8 Deliverables and handoffs

H51 (volumes, backups, timers) to NASZ and Zikri; H54 (restore environment and runbook) to NASZ and Zikri for their post-restore verification. Consumed: H50, H52, H42.

## 9 Exit criteria

- T01-T09 complete; TC01-TC09 pass with recorded evidence.
- Isolated restore passes with all checks; restart/redeploy preserve data; timers run.
- Contributes to G5 items 1, 3-7.

## 10 Integration checkpoint

On one release candidate, NASZ's cloud auth journeys, Zikri's database and tracking checks and Qee's delivery/restore journeys run in sequence; restore verification uses all three owners' checks.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Backup key lost | Two named holders; offline copy; test decryption in the restore exercise |
| Restore reveals expired data | Retention rerun before reopening is part of the runbook and TC04 |
| Upload timeouts on 4G | Adjust timeouts and limits from measurements; keep size limit |
| Volume loss on termination | DeleteOnTermination reviewed; restore from backup; no availability claim |

## 12 Deferred work

Final regression, test document, rehearsal and release record (PH6). Multi-AZ replication and managed backup services are out of scope.
