# M1 PH6: Final acceptance, evidence and demonstration

Owner: NASZ. Phase PH6 of [phase framework](../../../shared/phase-framework.md). Status: Planned.

## 1 Objective

NASZ can demonstrate M1 live on the AWS deployment in about 10 minutes, including failed attacks, explain the code personally, and has a complete M1 section of the security test document (input, expected result, actual result, owner) backed by evidence from the release candidate.

## 2 Entry criteria

- G5 passed: live URL works for all roles; restore exercise passed.
- Release-candidate commit, image digests and migration revision chosen and recorded; no known open defect rated high for M1.

## 3 Dependencies

| Needs | From | Handoff | Substitute |
| --- | --- | --- | --- |
| Zikri's and Qee's cloud journeys on the same release candidate for the 30-minute run | M2-PH6, M3-PH6 | H60 | None; group rehearsal waits |
| Allocation-sheet receipt and starter-kit declaration status | external (lecturer/course portal) | EXT-01 | Record "unverified" if no receipt exists |
| Lecturer response on FastAPI/PostgreSQL variation | external | EXT-02 | Record "not acknowledged" if none |

## 4 Ordered tasks

| ID | Task | Contract and validation | Evidence | Needs |
| --- | --- | --- | --- | --- |
| M1-PH6-T01 | Release-candidate regression of M1 on the live stack: PH2-PH5 M1 suites (unit, component, integration against deployed-equivalent images, browser journeys against the live URL where safe) and the authorization matrix | All pass on one commit; failures stay open, not rerun away | TC01 | G5 |
| M1-PH6-T02 | Complete the M1 section of the security test document: for M1-01 to M1-12 give input, expected result, actual result, pass/fail, evidence reference, version, environment, timestamp and owner name (NASZ); show more than five distinct input types (SQL injection, short/common password, repeated wrong passwords, script in name, Admin page as Seller, role injection, CSRF omission, expired/old session) | Every actual result comes from an executed test on the release candidate; no copy of planned text | TC02 | T01 |
| M1-PH6-T03 | Provide the M1 evidence for shared rows S-01 to S-06, S-08, S-09 (authentication, CSRF, error handling, logging, incident, caching, restore-session behavior) and cross-reference to Zikri's and Qee's portions | Rows list contributor and evidence | TC02 | T01 |
| M1-PH6-T04 | Demo script (about 10 minutes, rubric key controls first): show the stored Argon2id hash (no plaintext), a short password and a 9-character password rejected, a script in the display name rendered as text, SQL-injection login string failing, repeated wrong passwords reaching 429 and the audit rows without secrets, session identifier changing at login and the old cookie rejected after logout, Seller opening an Admin URL (403), registration with `role=ADMIN` rejected, then (if time remains) Admin creates a Rider with forced password change and disabling shows the old session rejected; fallback evidence clearly marked, never presented as live | Timed rehearsal on the cloud URL | TC03 | T01 |
| M1-PH6-T05 | Code walkthrough notes NASZ can explain without reading: session creation/validation path, password service, CSRF dependency, rate-limit atomic counter, `lock_active_actor`, login race handling, ops commands; list likely questions with answers | Peer questioning by Zikri and Qee recorded | TC04 | none |
| M1-PH6-T06 | Allocation sheet and variation evidence: verify whether the Week 5 submission was made, with full names, matric numbers and starter-kit declaration if any; attach receipt or record "unverified"; record lecturer acknowledgment status of FastAPI/PostgreSQL | [Decision register](../../../shared/decision-register.md) EXT-01 and EXT-02 rows updated | TC05 | EXT-01, EXT-02 |
| M1-PH6-T07 | Repository hygiene: no real data, usable passwords or secrets in Git history; `.env.example` placeholders; demo account passwords generated for the demo and rotated or disabled afterwards; seeded demo data synthetic | Secret scan of full history clean | TC06 | none |
| M1-PH6-T08 | Group 30-minute rehearsal twice: M1 segment timing, hand-offs to Zikri and Qee, recovery plan if cloud is down (explain loss of deployment marks, show local stack) | Two timed run-throughs logged | TC07 | H60 |
| M1-PH6-T09 | Freeze and record release: tag, image digests, migration revision, live URL, known limitations (single host, no email recovery, no Admin self-service), list of any failed or skipped test with reason | Release record in `docs/shared` status board | TC08 | G5 |

## 5 Affected components

Documentation and evidence only: security test document, status board, runbooks, demo script; no feature changes. Defects found are fixed through normal PRs and re-run through the full regression.

## 6 Security requirements

Evidence integrity: results are observed, not predicted; safe artifacts only (no real data, passwords or live secrets); demo credentials rotated after use.

## 7 Tests

| ID | Type (family) | Case and input | Expected result | Maps to |
| --- | --- | --- | --- | --- |
| M1-PH6-TC01 | Regression | Full M1 suites plus matrix on release candidate | All pass; failures recorded as open | G6.2 |
| M1-PH6-TC02 | Evidence review | Check each M1 worksheet row has input, expected, actual, owner, version | No blank or "Planned" actual result in the final document | rubric 3 |
| M1-PH6-TC03 | Rehearsal | Live M1 demo on cloud URL, timed | Completes in about 10 minutes; each attack shown failing | rubric 4 |
| M1-PH6-TC04 | Peer Q&A | Zikri and Qee ask 10 questions on M1 code | NASZ answers from understanding; gaps noted and closed | rubric 4 |
| M1-PH6-TC05 | Evidence review | Allocation receipt and variation notice | Recorded as evidence or "unverified"; no assumption | EXT-01, EXT-02 |
| M1-PH6-TC06 | Scan | Secret scan over full Git history and demo environment | Clean | P4, S-03 |
| M1-PH6-TC07 | Rehearsal | Group run-through | 30 minutes total; no overlapping or missing M1 prerequisites | rubric 4 |
| M1-PH6-TC08 | Record check | Release record fields present and match deployed digests | Match | G6.5 |

## 8 Deliverables and handoffs

M1 section of the security test document; demo script; code notes; evidence log; release record. Handoff H60 to the group document owner (all three) and H61 allocation evidence.

## 9 Exit criteria

- T01-T09 done; TC01-TC08 satisfied; M1 definition of done in the [module README](../README.md#module-definition-of-done) ticked with evidence links.
- Contributes to G6 items 1-5.

## 10 Integration checkpoint

Single live walkthrough using the three modules' scripts in sequence on the same deployment and data; verify the session starts clean and ends with accounts rotated.

## 11 Failure risks and recovery

| Risk | Recovery |
| --- | --- |
| Live demo fails | Switch to local stack, disclose the deployment-mark consequence; never pass off recordings as live |
| Test mismatch found late | Fix, rebuild release candidate, re-run all suites; update the record |
| Evidence gaps | Execute the missing test; leave failed rows open if still failing |

## 12 Deferred work

None for the project. Post-submission improvements (email recovery, MFA, managed database, multi-host) are explicitly out of scope.
