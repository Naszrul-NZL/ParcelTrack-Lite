# M2 PH6: Final acceptance, evidence and demonstration

Owner: Zikri. Phase PH6 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

Zikri can demonstrate M2 live on the AWS deployment in about 10 minutes, including failed attacks, explain the schema, RLS and parcel code personally, and has a complete M2 section of the security test document with input, expected result, actual result and owner, from the release candidate.

## 2 Entry criteria

- G5 passed; release-candidate commit, image digests and migration revision recorded.
- No open high-severity defect in M2 or shared database controls.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Naszrul's and Syauqi's scripts for the 30-minute rehearsal and shared worksheet rows | M1-PH6, M3-PH6 | H60 | none |
| Cloud journeys passing on the release candidate | G5 | none | none |

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M2-PH6-T01 | Release-candidate regression for M2: unit, component, PostgreSQL/RLS integration, browser journeys, scale plan checks and the M2 rows of the authorization matrix on one commit; live-URL checks that are safe to repeat | All pass; failures stay open | TC01 | G5 |
| M2-PH6-T02 | M2 section of the security test document for M2-01 to M2-10 with input, expected, actual, pass/fail, evidence, version, environment, timestamp and owner Zikri; more than five distinct input types (SQL injection in search, XSS in address, invalid phone/weight, changed parcel ID, guessed/sequential tracking number, rapid lookups, forged seller ID, role misuse) | Every actual result observed on the release candidate | TC02 | T01 |
| M2-PH6-T03 | RLS-01 to RLS-09 evidence package (with Syauqi for RLS-03, RLS-10): catalog listings, query outputs and test run references stored safely; S-01, S-03, S-08 contributions for M2 | Linked from the worksheet | TC02 | T01 |
| M2-PH6-T04 | Demo script (about 10 minutes): invalid weight/phone rejected, registration with token, refresh persistence, Seller B tries Seller A's ID (404), SQL-injection string in search harmless, a real tracking number with its neighbours and sequential values all returning the same uniform 404 (random 128-bit source shown in code), XSS address rendered as text, public tracking showing status/time only with network tab visible, repeated lookups reaching 429, a Rider/Admin POST to `/parcels` denied, show the RLS role listing and an unfiltered query returning only one Seller's rows; fallback evidence clearly marked | Timed rehearsal on the cloud URL | TC03 | T01 |
| M2-PH6-T05 | Code walkthrough notes: schema and constraints, migration order, `unit_of_work` and transaction-local context, policies and helper, `create_parcel` and replay, `lookup_tracking`, retention functions and job, tracking token generator; likely questions and answers | Peer questioning by Naszrul and Syauqi recorded | TC04 | none |
| M2-PH6-T06 | Evidence for retention and data protection policy P3: documented procedure, last scheduled run, anonymization sample on synthetic data, backup expiry interpretation of the 12-month policy (D-17) | Procedure and sample linked | TC05 | M2-PH5-T04 |
| M2-PH6-T07 | Repository and data hygiene for M2: synthetic data only, no real recipients, payload corpora contain no personal data, fixtures flagged, secrets scan | Scan clean | TC06 | none |
| M2-PH6-T08 | Group 30-minute rehearsals (two) with timing for the M2 segment and the full end-to-end order from the [checkpoint plan](../../../checkpoint-plan.md#later-integrated-demonstration-order) | Two logged run-throughs | TC07 | H60 |
| M2-PH6-T09 | Freeze: confirm release record for M2 (commit, migration revision, grants snapshot hash) and list known limitations (no parcel editing, no recipient accounts, single-instance database) | Record present | TC08 | G5 |

## 5 Affected components

Documentation, evidence and scripts only; defects through normal PRs followed by full regression.

## 6 Security requirements

Evidence integrity; synthetic data in all artifacts; credentials used in the demo are demo-only and rotated after.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M2-PH6-TC01 | Regression | Complete M2 suites on release candidate | All pass; failures recorded | G6.2 |
| M2-PH6-TC02 | Evidence review | Every M2 and RLS row has input, expected, actual, owner, version | No blank or Planned result | rubric 3 |
| M2-PH6-TC03 | Rehearsal | Live M2 demo on cloud, timed | About 10 minutes; failed attacks shown | rubric 4 |
| M2-PH6-TC04 | Peer Q&A | 10 questions on schema, RLS, tracking, retention | Answers without reading code | rubric 4 |
| M2-PH6-TC05 | Evidence review | Retention procedure and sample run | Matches policy P3 and the contract | P3 |
| M2-PH6-TC06 | Scan | Secret and personal-data scan over repository and fixtures | Clean | P4 |
| M2-PH6-TC07 | Rehearsal | Group run-through | 30 minutes; prerequisites available | rubric 4 |
| M2-PH6-TC08 | Record check | Release record vs deployed versions | Match | G6.5 |

## 8 Deliverables and handoffs

M2 section of the security test document; RLS evidence; demo script; code notes; retention evidence. H60 to the group document.

## 9 Exit criteria

- T01-T09 done; TC01-TC08 satisfied; M2 definition of done in the [module README](../README.md#module-definition-of-done) ticked with evidence links.
- Contributes to G6.

## 10 Integration checkpoint

Single end-to-end live run in the planned order with Naszrul and Syauqi, using the same deployment, then reset of demo accounts.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| A demo attack unexpectedly succeeds | Stop, record as a defect, fix and re-run regression before the next rehearsal |
| Cloud unavailable on the day | Local stack with explicit disclosure of lost deployment marks |
| Unexecuted worksheet rows | Execute them; do not fill from expectation |

## 12 Deferred work

None. Out-of-scope items (parcel editing, exports, recipient accounts) remain excluded.
