# Requirement to phase, task and test traceability

Maps each source requirement and feature to the phase where it first works, the tasks that build it and the test cases that prove it. Test case IDs are defined in the module phase files and repeated in each module's `test-plan.md`. A requirement is covered only when the listed tests have actually passed; this document lists planned coverage. Nothing has run.

Phase shorthand: the first phase is where a partial version works; the final phase is where the requirement is complete and tested locally; AWS repeats follow in PH5 and the final record in PH6.

## A Functional requirements (case study sections 4 and 5)

| Source | Feature | Endpoints | Phases | Main tasks | Main test cases |
| --- | --- | --- | --- | --- | --- |
| 4.1 Seller self-registration | M1-F01 | A02 | PH3 -> PH4 | M1-PH3-T03 | M1-PH3-TC01 to TC05, TC14, TC17 (journey starts at /register), TC20; M1-PH4-TC20 |
| 4.1 Login and logout for all roles | M1-F02 | A01, A03, A04, A05 | PH2 -> PH4 | M1-PH2-T02 to T06, T10 | M1-PH2-TC01 to TC15; M1-PH4-TC02 to TC06 |
| 4.1 Admin creates Rider accounts | M1-F03 | A08 | PH3 -> PH4 | M1-PH3-T04, T05 | M1-PH3-TC08, TC10, TC17 |
| 4.1 Change password | M1-F04 | A06 | PH3 -> PH4 | M1-PH3-T06 | M1-PH3-TC06, TC07, TC15; M1-PH4-TC04 |
| 5 Manage user accounts (Admin) incl. P1 disablement | M1-F05 | A07, A09, A20 | PH3 -> PH4 | M1-PH3-T01, T02, T07, T08 | M1-PH3-TC09, TC11, TC12, TC13, TC16, TC22 |
| 4.2 Seller registers parcel; unique hard-to-guess number | M2-F01 | A10 | PH2 -> PH4 | M2-PH2-T02, T03, T05; M2-PH3-T01 | M2-PH2-TC01 to TC05; M2-PH3-TC01, TC02; M2-PH4-TC04, TC05 |
| 4.2 Seller views and searches own parcels | M2-F02 | A11, A12 | PH2 -> PH3 -> PH4 | M2-PH2-T04, T06; M2-PH3-T02, T03, T07 | M2-PH2-TC10, TC11; M2-PH3-TC03 to TC05, TC11, TC15 |
| 4.2 Public tracking, status/date/time only | M2-F03 | A13 | PH3 -> PH4 | M2-PH3-T04, T05, T06 | M2-PH3-TC06 to TC10; M2-PH4-TC06; M2-PH5-TC08 |
| P3 delete/anonymize 12 months after delivery | M2-F04 (with M3-F05) | maintenance functions | PH3 -> PH4 -> PH5 | M2-PH3-T08; M2-PH4-T03; M3-PH4-T04 | M2-PH3-TC12, TC13; M2-PH4-TC12, TC13; M3-PH4-TC04; M2-PH5-TC05 |
| 4.3 Admin assigns parcels to Riders | M3-F01 | A14, A15 | PH2 (seeded) -> PH3 -> PH4 | M3-PH3-T01 to T03, T09 | M3-PH3-TC01, TC02, TC10, TC12; M3-PH4-TC05 |
| 4.3 Rider views assigned parcels only | M3-F02 | A16 | PH2 -> PH3 | M3-PH2-T04, T05 | M3-PH2-TC05, TC06, TC08, TC09 |
| 4.3 Rider updates status and uploads one JPG/PNG | M3-F03 | A17, A19 | PH2 (start) -> PH3 -> PH4 | M3-PH2-T02, T03; M3-PH3-T05 to T07, T10 | M3-PH2-TC01 to TC04; M3-PH3-TC04 to TC08, TC13; M3-PH4-TC01, TC02, TC06 |
| 4.3 Admin dashboard by status | M3-F04 | A18 | PH3 -> PH4 | M3-PH3-T08, T09 | M3-PH3-TC09, TC12, TC19; M3-PH4-TC08 |
| P1 Rider disabled on day of leaving; unfinished work not stranded | M3-F05 | A09, A14, A15 | PH3 -> PH4 | M3-PH3-T03, T11; M1-PH3-T02 | M3-PH3-TC03, TC15; M1-PH3-TC11; M3-PH4-TC13 |
| 2.3 / 3 Record who changed each status and when | all | history, audit, A20 | PH2 -> PH4 | M2-PH2-T02; M3-PH2-T02; M1-PH3-T07 | M2-PH2-TC01; M3-PH2-TC01, TC13; M3-PH4-TC11; M1-PH3-TC13 |
| 3, 2.3 Admin can see who changed each status (D-37) | all | A12 history for Admin | PH3 | M2-PH3-T03 | M2-PH3-TC05, TC20 |

### Role matrix (case study 5) to enforcement tests

| Function | Rule | Enforced by | Tests |
| --- | --- | --- | --- |
| Register parcel | Seller only | `require_role`, `create_parcel` | M2-PH2-TC02; M1-PH4-TC01 |
| View parcel details with address | Seller own, Rider assigned, Admin all | RLS plus service, A12 | M2-PH2-TC10; M2-PH3-TC05; M3-PH3-TC03; M2-PH4-TC01 |
| Assign parcel to Rider | Admin only | `assign_parcel`, `require_role` | M3-PH3-TC02, TC09; M1-PH4-TC01 |
| Update status and upload photo | Assigned Rider only; Admin cannot | `update_delivery_status`, assignment check | M3-PH2-TC02, TC05; M3-PH3-TC02; M3-PH4-TC05 |
| Track by number | Anyone, status only | `lookup_tracking`, A13 DTO | M2-PH3-TC06, TC07, TC09 |
| Manage user accounts | Admin only | A07-A09, A20 | M1-PH3-TC09, TC11, TC12 |
| Dashboard | Admin only | A18 | M3-PH3-TC09 |
| Read proof photo | Seller own, Rider assigned, Admin (D-04) | A19 | M3-PH3-TC08 |

## B Rubric criteria

| Criterion (max) | What earns it | Phases | Evidence |
| --- | --- | --- | --- |
| 1a Module functions (5) | Every listed function runs end to end | PH3 (functionally), PH4, PH6 demo | G3; M1/M2/M3 PH6-T04; section A tests |
| 1b Deployment and integration (10) | Integrated system on a cloud server, all roles online; local-only loses 5 marks | PH5, PH6 | G5; M1-PH5-TC08, M2-PH5-TC09, M3-PH5-TC08 |
| 2a Security controls (6) | Module key controls enforced on the server | PH2 to PH4 | Section C |
| 2b Policies and error handling (4) | Applicable policies P1-P5; generic errors; no secrets or real data | PH1 to PH6 | Section D; M1-PH1-TC01, TC03, TC15; M1-PH2-TC13; M1-PH4-TC14 |
| 3 Security testing (10) | More than five input types per member with input, expected, actual | PH4 (execution), PH6 (document) | Worksheet rows in section F; M1-PH6-TC02, M2-PH6-TC02, M3-PH6-TC02 |
| 4 Live demonstration and Q&A (5) | About 10 minutes per member on the cloud deployment, attacks shown failing | PH6 | M1-PH6-TC03, TC04; M2-PH6-TC03, TC04; M3-PH6-TC03, TC04 |

## C Rubric key security controls per module (2a)

| Module | Control | First enforced | Tests |
| --- | --- | --- | --- |
| M1 | Parameterized queries | PH2 | M1-PH2-TC03; static scan in M1-PH4-TC14 |
| M1 | Password hashing (Argon2id) | PH1 | M1-PH1-TC04; M1-PH2-TC01, TC17 |
| M1 | Lockout or rate limit on login | PH2 | M1-PH2-TC05; M1-PH4-TC08, TC09; M1-PH5-TC04 |
| M1 | Session regenerated on login, destroyed on logout | PH2 | M1-PH2-TC02, TC06; M1-PH4-TC02 |
| M1 | Role checked on the server | PH2 | M1-PH2-TC08; M1-PH3-TC09; M1-PH4-TC01 |
| M1 | Logins logged without passwords | PH2 | M1-PH2-TC12; M1-PH4-TC14 |
| M2 | Parameterized queries | PH2 | M2-PH2-TC17 (static scan and path-parameter injection); M2-PH3-TC03, TC14 |
| M2 | Output encoding against XSS | PH2 | M2-PH2-TC12; M2-PH3-TC14; M2-PH4-TC08 |
| M2 | Ownership checked for every parcel ID | PH2 | M2-PH2-TC10; M2-PH3-TC15; M2-PH4-TC01 |
| M2 | Cryptographically random tracking number | PH1 | M2-PH1-TC09; M2-PH2-TC01 |
| M2 | Server-side validation | PH1 | M2-PH1-TC10; M2-PH2-TC03 |
| M2 | Tracking page never shows name, phone or address | PH3 | M2-PH3-TC07, TC09; M2-PH4-TC06 |
| M2 | Rate limit on lookups | PH3 | M2-PH3-TC08; M2-PH4-TC07; M2-PH5-TC08 |
| M3 | Rider updates only assigned parcels (server-side) | PH2 | M3-PH2-TC02, TC05; M3-PH4-TC05 |
| M3 | Only Admin assigns and views dashboard | PH3 | M3-PH3-TC02, TC09 |
| M3 | Upload checks type, size and real content; renamed; stored outside web root | PH3 | M3-PH3-TC06, TC07, TC20; M3-PH4-TC06; M3-PH1-TC04; M3-PH5-TC01 |
| M3 | Status changes logged with user and time | PH2 | M3-PH2-TC01, TC13; M3-PH4-TC11 |
| M3 | Parameterized queries | PH2 | M3-PH2-TC15 (static scan and injection in filters); M3-PH4-TC11 |

## D Policies P1 to P5

| Policy | Implemented by | Tests |
| --- | --- | --- |
| P1 Access control: least privilege, no shared accounts, no access to others' parcels, Riders disabled on leaving | Roles, RLS, assignment checks, disablement with `session_version` | M2-PH2-TC10; M3-PH2-TC02; M1-PH3-TC11; M1-PH4-TC01; M3-PH4-TC13 |
| P2 Passwords at least 10 characters, unique to the application, report compromise | Password service, common-password list, incident runbook | M1-PH1-TC04; M1-PH3-TC01, TC04; M1-PH4-TC19 |
| P3 Personal data: collection for delivery only, no export, delete or anonymize 12 months after delivery | Public DTO allowlist, no export routes, retention functions and jobs, photo deny-before-delete, backup interpretation (D-17) | M2-PH3-TC07; M2-PH3-TC12, TC13; M2-PH4-TC12, TC13; M3-PH4-TC04; M2-PH5-TC05, TC06 |
| P4 Secure development: no secrets in code, no real data in tests, generic errors, details in logs | Settings fail-closed, secret scanning, synthetic fixtures, error envelope | M1-PH1-TC01, TC03, TC12; M2-PH1-TC07; M1-PH4-TC14; M1-PH5-TC05; M1-PH6-TC06, M2-PH6-TC06, M3-PH6-TC06 |
| P5 Logging and incident response: log logins, failed logins, status changes without secrets; report within 1 hour; lock affected accounts | Audit service, redaction, ops lock/recover commands, runbook | M1-PH2-TC12; M3-PH2-TC13; M3-PH4-TC11; M1-PH4-TC10, TC19; M1-PH5-TC11 |

## E Threats (case study 8)

| Threat | Controls | Tests |
| --- | --- | --- |
| SQL injection (search, login) | Bound parameters, allowlisted sorts, literal search, restricted DB roles | M1-PH2-TC03; M2-PH3-TC03, TC14; M2-PH4-TC08 |
| Broken access control by changing a parcel ID | Uniform 404, RLS, role checks, matrix | M2-PH2-TC10; M3-PH2-TC02; M1-PH4-TC01 |
| Guessable tracking numbers | 128-bit random token, unique index, lookup rate limit | M2-PH1-TC09; M2-PH3-TC08, TC19; M2-PH4-TC07 |
| Weak password storage and brute force | Argon2id, 10-character minimum, throttling, generic errors | M1-PH1-TC04; M1-PH2-TC04, TC05; M1-PH4-TC08, TC09 |
| XSS in recipient name or address | Text-only rendering, JSON output, CSP | M2-PH3-TC14; M2-PH4-TC08; M1-PH4-TC12, TC13 |
| Malicious upload | Decoded-content validation, re-encode, random private storage, limits | M3-PH3-TC06, TC07; M3-PH4-TC06 |

## F Security worksheet rows (51) to phases and test cases

Rows are defined in [security-tests.md](../security-tests.md). "Executed in" is the first phase in which the row gets an observed result; PH4 consolidates all rows on one commit and PH6 records the final result.

| Row | Executed in | Test cases |
| --- | --- | --- |
| M1-01 | PH2 | M1-PH2-TC03; M1-PH4-TC14, TC18 |
| M1-02 | PH3 | M1-PH1-TC04; M1-PH3-TC01, TC04 |
| M1-03 | PH2 | M1-PH1-TC04; M1-PH2-TC01, TC17 |
| M1-04 | PH2 | M1-PH2-TC04, TC05; M1-PH4-TC08, TC09; M1-PH5-TC04 |
| M1-05 | PH3 | M1-PH3-TC09; M1-PH4-TC01 |
| M1-06 | PH3 | M1-PH3-TC16, TC20; M1-PH4-TC13 |
| M1-07 | PH2 | M1-PH2-TC02, TC06; M1-PH4-TC02 |
| M1-08 | PH3 | M1-PH3-TC02 |
| M1-09 | PH2 (prep), PH3 | M1-PH2-TC09, TC10; M1-PH3-TC11, TC17; M1-PH4-TC05, TC07 |
| M1-10 | PH3 | M1-PH3-TC06 |
| M1-11 | PH4 | M1-PH4-TC04, TC05, TC06 |
| M1-12 | PH4 | M1-PH4-TC10; M1-PH5-TC11 |
| M2-01 | PH3 | M2-PH2-TC17; M2-PH3-TC03, TC14; M2-PH4-TC08 |
| M2-02 | PH3 | M2-PH2-TC12; M2-PH3-TC14; M2-PH4-TC08 |
| M2-03 | PH2 | M2-PH1-TC10; M2-PH2-TC03 |
| M2-04 | PH2 | M2-PH2-TC10, TC14; M2-PH3-TC15 |
| M2-05 | PH2 | M2-PH1-TC09; M2-PH2-TC01; M2-PH3-TC19 |
| M2-06 | PH3 | M2-PH3-TC07, TC09; M2-PH4-TC06; M2-PH5-TC08 |
| M2-07 | PH3 | M2-PH3-TC08; M2-PH4-TC07; M2-PH5-TC08 |
| M2-08 | PH2 | M2-PH2-TC02 |
| M2-09 | PH2 | M2-PH1-TC08; M2-PH2-TC02 |
| M2-10 | PH3 | M2-PH3-TC12, TC13; M2-PH4-TC12, TC13; M2-PH5-TC05 |
| M3-01 | PH2 | M3-PH2-TC02, TC05; M3-PH4-TC05, TC13 |
| M3-02 | PH3 | M3-PH3-TC02, TC09 |
| M3-03 | PH3 | M3-PH3-TC06, TC20; M3-PH4-TC06 |
| M3-04 | PH3 | M3-PH3-TC07; M3-PH4-TC06 |
| M3-05 | PH3 | M3-PH1-TC04; M3-PH3-TC04, TC08; M3-PH4-TC09; M3-PH5-TC01 |
| M3-06 | PH2 | M3-PH1-TC02; M3-PH2-TC03, TC12 |
| M3-07 | PH2 | M3-PH2-TC01, TC13; M3-PH4-TC11 |
| M3-08 | PH3 | M3-PH3-TC04, TC06; M3-PH4-TC01 |
| M3-09 | PH2 | M3-PH1-TC02; M3-PH2-TC02 |
| M3-10 | PH4 | M3-PH4-TC05 |
| S-01 | PH2 | M1-PH2-TC07, TC19; M2-PH2-TC04; M3-PH2-TC07; M1-PH4-TC20 |
| S-02 | PH2 (local), PH5 | M1-PH2-TC01; M1-PH4-TC12, TC21; M1-PH5-TC06 |
| S-03 | PH1 | M1-PH1-TC03, TC12; M2-PH1-TC07; M1-PH4-TC14; M1-PH5-TC05; M1-PH6-TC06 |
| S-04 | PH1 | M1-PH1-TC01; M1-PH2-TC13; M1-PH4-TC14 |
| S-05 | PH2 (redaction canary from PH1) | M1-PH1-TC02; M1-PH2-TC12; M3-PH2-TC13; M3-PH4-TC11 |
| S-06 | PH4 | M1-PH4-TC19; M1-PH5-TC11 |
| S-07 | PH4 (local), PH5 | M3-PH4-TC07; M3-PH5-TC01, TC05 |
| S-08 | PH1 | M1-PH1-TC08, TC13; M1-PH2-TC15; M1-PH4-TC12, TC15; M1-PH5-TC12 |
| S-09 | PH4 (local), PH5 | M1-PH4-TC11; M3-PH4-TC07; M1-PH5-TC07; M2-PH5-TC06; M3-PH5-TC04 |
| RLS-01 | PH1 | M2-PH1-TC01; M2-PH4-TC01; M2-PH5-TC04 |
| RLS-02 | PH2 | M2-PH2-TC06; M2-PH4-TC01 |
| RLS-03 | PH2 (parcels), PH3 and PH4 (proof metadata) | M3-PH2-TC05; M3-PH3-TC08; M2-PH4-TC01 |
| RLS-04 | PH2 | M2-PH2-TC07; M1-PH2-TC09 |
| RLS-05 | PH1 | M2-PH1-TC04; M2-PH2-TC09; M2-PH4-TC01, TC17 |
| RLS-06 | PH2 | M2-PH2-TC08; M2-PH4-TC01 |
| RLS-07 | PH3 | M2-PH3-TC06 |
| RLS-08 | PH3 | M2-PH3-TC06; M2-PH4-TC03 |
| RLS-09 | PH1 | M1-PH1-TC06; M2-PH1-TC03; M2-PH4-TC02, TC03 |
| RLS-10 | PH3 | M3-PH3-TC11; M3-PH4-TC02 |

## G Test families (testing strategy) to phases

| Family | Introduced | Completed |
| --- | --- | --- |
| UT-A01 to A05 | PH1 to PH3 (M1) | PH4 |
| UT-P01 to P04 | PH1 to PH3 (M2) | PH4 |
| UT-D01 to D05 | PH1 to PH3 (M3) | PH4 |
| IT-A01 to A04 | PH2 | PH4 |
| IT-P01 to P04 | PH2 | PH4 |
| IT-D01 to D04 | PH2 | PH4 |
| RLS-01 to RLS-10 | PH1 | PH4, repeated PH5 under deployed credentials |
| CMP-A, CMP-P, CMP-D | PH1 to PH3 | PH4 regression |
| E2E-A, E2E-P, E2E-D | PH2 | PH4, repeated PH5 on the live URL |
| CT-01, CT-02, CT-03; MIG-01 to MIG-03; LINT-01; HAR-01; FIX-01 | PH1 | PH4 |
| OPS-01, OPS-03 to OPS-09 | PH1 (OPS-01), PH3 (OPS-03) | PH5 |

Counts of tests or coverage percentages never establish completion; each row above must pass with the expected outcome stated in the phase file.
