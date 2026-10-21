# Decision register and external dependencies

This register separates four kinds of statement so plans cannot quietly promote a proposal into a requirement.

| Class | Meaning |
| --- | --- |
| Source | Stated by the lecturer's briefing, case study or rubric (reference files at the repository root) |
| Confirmed | Decided by the team (recorded in the checkpoint plan, 21 October 2026) |
| Proposed | Design choice made in these plans; reviewable and changeable through the [contract change rule](system-contract.md) |
| Open or external | Needs information or action from outside the plan; not resolved by editing documents |

Status of every row is as of this document; nothing is implemented. Update the status column only with evidence (receipt, PR, test result).

## Source requirements (summary, with locations)

| ID | Requirement | Location |
| --- | --- | --- |
| SRC-01 | Three modules, one per member; group integrates one system; each marked individually | Case study 4, 4.4; rubric 1 |
| SRC-02 | Seller self-registers; Admin creates Riders; login/logout; change password | Case study 4.1 |
| SRC-03 | Seller registers a parcel (name, phone, address, weight); unique hard-to-guess tracking number; sees and searches own parcels only | Case study 4.2 |
| SRC-04 | Public tracking by tracking number shows status, date and time only; never name, phone or address | Case study 4.2 |
| SRC-05 | Admin assigns parcels; Rider sees assigned only; updates Out for Delivery, Delivered, Failed; one JPG or PNG proof photo | Case study 4.3 |
| SRC-06 | Admin dashboard of parcels by status for the five statuses | Case study 4.3 |
| SRC-07 | Access checked on the server for every request; role matrix | Case study 5 |
| SRC-08 | Record who changed each parcel status and when | Case study 3, 2.3 |
| SRC-09 | Policies P1-P5 (least privilege and disablement on the day a Rider leaves; passwords at least 10 characters; PDPA retention delete/anonymize 12 months after delivery; no secrets in code, no real data in tests, generic errors; logging without passwords or full addresses and 1-hour incident reporting) | Case study 9 |
| SRC-10 | Threats: SQL injection, broken access control, guessable tracking numbers, weak password storage and brute force, XSS, malicious upload | Case study 8 |
| SRC-11 | Cloud deployment earns full marks in rubric 1b; local only loses 5 marks | Case study 6, 7; rubric 1 |
| SRC-12 | Module-specific key controls and suggested test inputs; testing band needs more than five input types | Rubric 2, 3 |
| SRC-13 | Final: live demonstration (30 minutes per group, about 10 per member) and security test document by module (input, expected, actual, owner) | Case study 10 |
| SRC-14 | Stack must be one of PHP+MySQL, Flask/Django+SQLite/MySQL, Spring Boot+MySQL | Case study 6; briefing slide 11 |
| SRC-15 | Module allocation submitted by Week 5; starter-kit use declared with an untouched first commit | Case study 4.4; briefing slide 7 |
| SRC-16 | Scale: about 50 sellers, 15 riders, 2 admins, 800 parcels per day; riders on Android phones over 4G | Case study 7 |
| SRC-17 | Every module must be tested with suitable security tools before release | Case study 11 |

## Decisions

| ID | Class | Decision | Evidence and notes | Status |
| --- | --- | --- | --- | --- |
| D-01 | Confirmed | FastAPI and PostgreSQL instead of the framework/database combinations named in the brief | Checkpoint plan: selected by the team. Conflicts with SRC-14 unless the lecturer accepts it (EXT-02) | Confirmed by team; lecturer acceptance unverified. Needs a written reply before PH1 code is merged (EXT-02). Fallback if refused: FastAPI refused only, port the thin HTTP layer to Flask (business rules live in SQL functions and services); PostgreSQL refused, MySQL port is a redesign of RLS, hardened functions and locking (large). Decide at once if a refusal arrives |
| D-02 | Confirmed | React with TypeScript/Vite, SQLAlchemy with psycopg, Alembic, Argon2id, server-side sessions, Docker Compose | Checkpoint plan and project plan | Confirmed (versions: D-21) |
| D-03 | Confirmed / Proposed | AWS is the hosting provider (confirmed); one EC2 instance running Compose (proposed) | Checkpoint plan | AWS confirmed; EC2 proposal open until EXT-04 |
| D-04 | Proposed | Proof photo readable by the parcel's Seller, the assigned Rider and Admin; never public | Brief specifies upload rights, not download rights | Proposed |
| D-05 | Proposed | Weight 0.001 to 100.000 kg, three decimals | Brief gives no upper bound | Proposed |
| D-06 | Proposed | Failed parcels are anonymized 12 months after `terminal_at`, like Delivered; see D-31 for parcels that never become terminal | P3 names delivery only | Proposed |
| D-07 | Proposed | Both Delivered and Failed require one valid proof photo | Case study: Delivered or Failed with proof photo | Proposed (consistent with source wording) |
| D-08 | Proposed | Seller search `q` matches tracking-number prefix or recipient-name substring, literal only | Case study says "searches their own parcels" without fields | Proposed; drop name search if the team disagrees |
| D-09 | Proposed | Tracking token `PTL-` + 32 uppercase hex from 16 random bytes; public lookup by POST (keeps tokens out of URLs) that is read-only and therefore exempt from the CSRF token and anonymous session but keeps a same-origin check and the lookup limiter; input normalized to uppercase | Source requires hard-to-guess and cryptographically random | Proposed |
| D-10 | Open | Where production secrets live (root-only environment file on the instance, or AWS Systems Manager Parameter Store) | Needs EXT-04 | Open; decide in M1-PH5-T03 |
| D-11 | Open | Reverse proxy and TLS automation (Caddy suggested for automatic certificates; nginx plus certbot is the alternative) | Needs domain decision | Open; decide in M1-PH5-T02 |
| D-12 | Proposed | Pillow for image decode/re-encode with pixel and byte limits; confirm by spike | M3-PH1-T05 | Proposed pending spike |
| D-13 | Proposed | `storage_key` = `<parcelId>/<32 hex>.<jpg\|png>` so reconciliation can lock the correct parcel from the path | Review finding: no way to map an orphan file to a parcel otherwise | Proposed (contract v3) |
| D-14 | Proposed | Creation fingerprint = HMAC-SHA256 with `FINGERPRINT_KEY` | Plain hash of low-entropy personal data is guessable | Proposed (contract v3) |
| D-15 | Proposed | Backup coordination: shared transaction advisory lock for writers/jobs, exclusive lock for backup, `system_state.maintenance_mode` flag rejecting unsafe methods with 503 | Contract named the intent, not the mechanism | Proposed (contract v3, revised after review: route-based gate, expiry, session-level backup lock, `backup_operator` role) |
| D-16 | Proposed | Operations commands and every account-changing event (web or command) are appended to an off-database account journal (write-only S3 prefix or CloudWatch Logs); restore replays it and falls back to quarantine if it is missing | A database restore cannot know later locks | Proposed (contract v3) |
| D-17 | Proposed | Backups retained 30 days (including noncurrent object versions and any EBS snapshots); the P3 12-month rule is applied to the live system, and expired data is re-anonymized after any restore; backup expiry documented as the interpretation | Backups would otherwise hold expired personal data | Proposed; record interpretation in the final document |
| D-18 | Proposed | Throttle values: login hard block 5 failures per (username, source) per 15 minutes, username-only 20 failures alert without blocking, per-source 100 failures; tracking 30 per source per minute; registration 30 per source per hour; anonymous sessions created lazily; A12/A19 reads 120 per user per minute; current-password attempts 5 per user per 15 minutes; sessions: anonymous 10 minutes, idle 30 minutes, absolute 8 hours; shared mobile or office addresses make these tuning values, configurable per environment | Brief requires limits but gives no numbers | Proposed |
| D-19 | Proposed | New password must differ from the current one; common-password list is local | P2 gives only length and uniqueness | Proposed |
| D-20 | Proposed | Error-code registry in the contract; all modules use only registered codes | Needed for conformance test CT-03 | Proposed (contract v3) |
| D-21 | Open | Exact versions of Python, Node and PostgreSQL (supported, pinned) | Recorded in `infra/VERSIONS.md` in M1-PH1-T01 | Open |
| D-22 | Proposed | Test principal override only through the test app factory's `dependency_overrides`; no header, query or cookie switch | Production safety | Proposed (contract v3) |
| D-23 | Proposed | Migration order 0001 to 0007 and `audit_event.parcel_id` foreign key added by 0003 | Breaks M1/M2 table-order cycle | Proposed (contract v3) |
| D-24 | Proposed | `as_of` time parameter accepted only by maintenance-role functions; request paths use database `now()` | Prevents clients influencing time | Proposed (contract v3) |
| D-25 | Proposed | Audit event-type list defined centrally; 0002 enforces it | Avoids cross-module migration churn | Proposed (contract v3) |
| D-26 | Proposed | Security headers and CSP without inline scripts | Defense in depth for XSS | Proposed (contract v3) |
| D-27 | Proposed | Client address for rate limits comes only from the trusted proxy; forwarded headers from elsewhere ignored | Without it the limiter keys the proxy | Proposed (contract v3) |
| D-28 | Proposed | Registration may reveal a taken username (unavoidable usability) while login stays generic; mitigated by throttle and audit | Trade-off | Accepted trade-off, proposed |
| D-29 | Proposed | Out of scope: redelivery after final outcome, multiple/replacement photos, bulk assignment, maps, email recovery, payments | Not in the case study | Proposed (project plan) |
| D-30 | Proposed | Checkpoint uses seeded assignment (TMP-02), disclosed in the demo | Checkpoint plan | Proposed |
| D-31 | Proposed | Parcels that never become terminal are anonymized 12 months after their last status change (SHOULD tier) | P3 purpose ends even for lost or cancelled parcels | Proposed |
| D-32 | Proposed | Admin password reset (A21) with a one-time password; initial and reset passwords expire after 72 hours (SHOULD tier) | Day-to-day resets must not need operator shell access (P1) | Proposed |
| D-33 | Proposed | Accepted residual risk: `app_runtime` keeps direct DML on `auth_session` and `rate_limit_bucket`; a stolen runtime credential could forge a session. Mitigated by credential custody, short lifetimes and the account-table protections | Review finding R3-05 | Accepted, proposed |
| D-34 | Proposed | Phone input accepts Malaysian local numbers starting with 0 (normalized to +60) and international numbers starting with +; stored form is E.164 | Source says only 'phone number'; E.164-only would reject normal local entries | Proposed |
| D-35 | Proposed | Design rules not stated in the sources: forced first-login password change; reactivation of accounts; Admin audit viewer; Admin and self cannot be disabled through the web; reassignment of unfinished parcels and the needs-reassignment view; Failed is terminal; field length limits | Reasoned from P1/P2/P5 and the status flow | Proposed; disable (P1) is the only source-backed account action |
| D-36 | Proposed | Priority tiers: MUST (rubric-required functions, key controls, listed test inputs, cloud deployment with HTTPS and all roles, test document, demo), SHOULD (contract controls beyond the rubric), STRETCH (listed in the phase framework). Gates G3-G6 pass on MUST and SHOULD; STRETCH is reported honestly and does not block | Three people, rubric-weighted scope | Proposed |
| D-37 | Proposed | Admin sees who changed each status (`changedBy`) in private detail; other roles and the public never do | SRC-08 needs a demonstrable read path | Proposed |
| D-38 | Proposed | Restore exercises use synthetic data, or a protected same-account environment limited to named operators and destroyed afterwards; audit events are kept 24 months and application and database logs 90 days; interpretation recorded in the final document | P3/P4 | Proposed |
| D-39 | Proposed | Security tooling: Bandit or Semgrep (backend), eslint-plugin-security (frontend), pip-audit and npm audit, gitleaks (tree and history from PH1), Trivy and hadolint (images, Compose), OWASP ZAP baseline and sqlmap against login, search, tracking and upload routes on Compose in PH4 and on the cloud URL in PH5, nmap and testssl.sh on the live host; GitHub Actions pinned by commit SHA | SRC-17 | Proposed |

## External dependencies

| ID | Dependency | Needed by | Owner to chase | Status |
| --- | --- | --- | --- | --- |
| EXT-01 | Week 5 module allocation submission (full names, matric numbers, starter-kit declaration if any) and a retained receipt | Overdue risk: Week 5 may already have passed; act on the first day, evidence by G6 | NASZ (M1-PH1-T13, M1-PH6-T06) | Unverified; submission status not known to the plan |
| EXT-02 | Lecturer notice and written acceptance of FastAPI/PostgreSQL (and ask the Week 14 date, EXT-08, in the same message) | Before PH1 code is merged; at the latest G1 | NASZ (M1-PH1-T13) | Not recorded |
| EXT-03 | Apply PR-only branch protection (`.github/branch-protection.json`) with repository administration access; decide required checks after CI exists | PH1 CI complete; M1-PH5-T10 | NASZ | Pending; not applied |
| EXT-04 | AWS account access, region, instance size, budget, domain or accepted address, TLS approach | Decision before PH3 starts (walking-skeleton deployment, M1-PH3-T12); PH5 entry | NASZ with the team (M1-PH1-T13) | Unresolved |
| EXT-05 | Full names and matric numbers for the allocation sheet and the test document | EXT-01, G6 | each member | Needed |
| EXT-06 | Private record of the incident contact channel and who holds the operations credential | Before cloud release (PH5) | NASZ | Not recorded |
| EXT-07 | Backup encryption key custody and the identities of recovery operators | PH5 | Qee with the team | Not decided |
| EXT-08 | Week 14 calendar date (not stated in the source documents) | Needed to schedule gates backwards; no date is invented | NASZ asks the lecturer with EXT-02 | Unknown |

## How a proposal becomes a requirement

A Proposed row changes only through a PR that updates this register, the system contract, every affected phase file and its tests, with approval from all three owners. A Source row cannot be changed by the team; if the team departs from it (D-01), record the departure and the external acceptance status here.
