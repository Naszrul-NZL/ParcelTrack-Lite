# M3 PH6: Final acceptance, evidence and demonstration

Owner: Syauqi. Phase PH6 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

Syauqi can demonstrate M3 live on the AWS deployment in about 10 minutes, including failed attacks, explain the delivery functions, locking, upload pipeline and recovery code personally, and has a complete M3 section of the security test document (input, expected result, actual result, owner) from the release candidate, plus the backup/restore evidence for the group.

## 2 Entry criteria

- G5 passed; release-candidate commit, image digests and migration revision recorded; restore exercise passed.
- No open high-severity defect in M3.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Naszrul's and Zikri's scripts for the 30-minute run; shared worksheet rows | M1-PH6, M2-PH6 | H60 | none |
| Cloud journeys and restore results | G5 | none | none |

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M3-PH6-T01 | Release-candidate regression for M3: unit, component, PostgreSQL and filesystem integration, fault-injection matrix, concurrency suites, browser journeys (desktop and phone), authorization-matrix rows A14-A19; safe live-URL checks | All pass on one commit; failures stay open | TC01 | G5 |
| M3-PH6-T02 | M3 section of the security test document for M3-01 to M3-10 with input, expected, actual, pass/fail, evidence, version, environment, timestamp and owner Syauqi; more than five distinct input types (`.php`, `shell.php.jpg`, oversized image, invalid status, update on another Rider's parcel, dashboard without Admin login, forged assignment fields, concurrent final updates) | Every actual result observed on the release candidate | TC02 | T01 |
| M3-PH6-T03 | Evidence for shared operational rows: S-02 (with Naszrul), S-07, S-09, RLS-03 and RLS-10 with Zikri, backup/restore record (timings, backup age, verification table) and fault-injection summary | Cross-referenced in the worksheet | TC02 | T01 |
| M3-PH6-T04 | Demo script (about 10 minutes): Rider B cannot update Rider A's parcel, invalid status rejected, upload `shell.php.jpg` and an oversized image rejected, dashboard requested with no login at all and Seller/Rider denied on dashboard and assignment, Admin assigns, Rider (phone) starts and delivers with a valid photo, Failed case with PNG, history with actor and time, dashboard counts, anonymous photo request denied, storage listing showing random names outside the web root, concurrent final updates giving one winner; fallback evidence clearly marked | Timed rehearsal on the cloud URL | TC03 | T01 |
| M3-PH6-T05 | Code walkthrough notes: `rules.py` and the SQL functions, locking order, `lock_delivery_target`, proof pipeline, finalization sequence and compensation, reconciliation, purge job, backup lock, restore runbook; likely questions and answers | Peer questioning by Naszrul and Zikri recorded | TC04 | none |
| M3-PH6-T06 | Operational handover: runbooks for backup, restore, rollback of image digest, forced storage-failure check, with who holds recovery credentials (recorded privately, only roles in Git) | Walkthrough by a second member from the runbook alone | TC05 | M3-PH5-T04 |
| M3-PH6-T07 | Test-data and hygiene check for M3: only synthetic images and parcels, upload corpus harmless, no real photos, demo accounts rotated, proof directory in demo environment cleaned after the demo | Scan and directory listing | TC06 | none |
| M3-PH6-T08 | Group 30-minute rehearsals (two): M3 segment timing and the full ordered scenario; contingency if the phone/4G demo fails (desktop viewport with disclosure) | Two logged run-throughs | TC07 | H60 |
| M3-PH6-T09 | Freeze: release record for M3 (migration revision, function definitions hash, image digests, restore exercise date) and known limitations (single instance, local filesystem storage, no redelivery, no multiple photos) | Record present | TC08 | G5 |

## 5 Affected components

Documentation, evidence and scripts only; defects through normal PRs followed by full regression.

## 6 Security requirements

Evidence integrity; harmless synthetic uploads; no real photos; recovery credentials never in Git; demo artifacts cleaned.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M3-PH6-TC01 | Regression | Complete M3 suites on release candidate | All pass; failures recorded | G6.2 |
| M3-PH6-TC02 | Evidence review | Every M3, RLS-03, RLS-10 and shared operational row has input, expected, actual, owner, version | No blank or Planned result | rubric 3 |
| M3-PH6-TC03 | Rehearsal | Live M3 demo on cloud, timed, phone viewport | About 10 minutes; failed attacks shown | rubric 4 |
| M3-PH6-TC04 | Peer Q&A | 10 questions on locking, uploads, recovery | Answers without reading code | rubric 4 |
| M3-PH6-TC05 | Runbook test | Second member performs a restore dry run from the runbook | Succeeds without help | S-07 |
| M3-PH6-TC06 | Scan | Fixture and repository scan for real data or secrets | Clean | P4 |
| M3-PH6-TC07 | Rehearsal | Group run-through | 30 minutes; prerequisites available | rubric 4 |
| M3-PH6-TC08 | Record check | Release record vs deployed versions | Match | G6.5 |

## 8 Deliverables and handoffs

M3 section of the security test document; backup/restore record; demo script; code notes; runbooks. H60 to the group document.

## 9 Exit criteria

- T01-T09 done; TC01-TC08 satisfied; M3 definition of done in the [module README](../README.md#module-definition-of-done) ticked with evidence links.
- Contributes to G6.

## 10 Integration checkpoint

Single live walk through the full ordered demonstration with Naszrul and Zikri on the same deployment, then clean-up of demo data and rotation of demo credentials.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Photo upload fails live on mobile | Use desktop viewport and disclose; investigate timeouts afterwards |
| Demo leaves proof files | Clean-up task and directory listing check |
| Late defect | Fix, rebuild candidate, full regression, update record |

## 12 Deferred work

None. Redelivery, multiple photos, maps and bulk assignment remain outside scope.
