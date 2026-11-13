# Decision register and external dependencies

This register separates four kinds of statement so plans cannot quietly promote a proposal into a requirement.

| Class | Meaning |
| --- | --- |
| Source | Stated by the lecturer's briefing, case study or rubric (original files under docs/requirements) |
| Confirmed | Decided by the team/user, including lecturer stack approval reported on 13 November 2026 |
| Proposed | Design choice made in these plans; reviewable and changeable through the [contract change rule](system-contract.md) |
| Open or external | Needs information or action from outside the plan; not resolved by editing documents |

Status of every row is as of this document. Local implementation is recorded in [implementation status](../implementation-status.md); external records are not implied by local code. Update status with evidence such as an explicit user confirmation, receipt, PR or test result. EXT-02 records the project owner's confirmation of lecturer approval, not an invented written receipt.

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
| SRC-15 | Preserve assessed module ownership and declare any starter-kit use with an untouched first commit | Case study 4.4; briefing slide 7 |
| SRC-16 | Scale: about 50 sellers, 15 riders, 2 admins, 800 parcels per day; riders on Android phones over 4G | Case study 7 |
| SRC-17 | Every module must be tested with suitable security tools before release | Case study 11 |

## Decisions

| ID | Class | Decision | Evidence and notes | Status |
| --- | --- | --- | --- | --- |
| D-01 | Confirmed | Full-stack Next.js App Router/TypeScript with PostgreSQL in full Supabase Docker, local first | Selected by the team/user; lecturer approval confirmed by the project owner in chat on 13 November 2026. Original SRC-14 stack wording remains preserved in the source requirements | Approved stack; EXT-02 resolved. Cloud provider and sizing remain EXT-04 |
| D-02 | Confirmed | One npm application/lockfile; Next.js Node runtime, shared strict Zod schemas, pg, node-pg-migrate, Sharp, Argon2id and opaque server-side sessions; full official Supabase Compose stack locally | User confirmed one application stack and local Supabase Docker. Existing username/session security contract retained; bundled Supabase Auth is not a second app identity source | Foundation implemented locally; pinned versions recorded under D-21. Business workflows and G1 acceptance remain open |
| D-03 | Confirmed / Open | Local development first; cloud hosting deferred | User steering supersedes the earlier AWS/EC2 commitment and the tentative Vercel/managed-free recommendation. Full Supabase Docker is local infrastructure, not a hosted Free project | No cloud provider or resources selected/provisioned by this change; resolve EXT-04 for PH5 |
| D-04 | Proposed | Proof photo readable by the parcel's Seller, the assigned Rider and Admin; never public | Brief specifies upload rights, not download rights | Proposed |
| D-05 | Proposed | Weight 0.001 to 100.000 kg, three decimals | Brief gives no upper bound | Proposed |
| D-06 | Proposed | Failed parcels are anonymized 12 months after `terminal_at`, like Delivered; see D-31 for parcels that never become terminal | P3 names delivery only | Proposed |
| D-07 | Proposed | Both Delivered and Failed require one valid proof photo | Case study: Delivered or Failed with proof photo | Proposed (consistent with source wording) |
| D-08 | Proposed | Seller search `q` matches tracking-number prefix or recipient-name substring, literal only | Case study says "searches their own parcels" without fields | Proposed; drop name search if the team disagrees |
| D-09 | Proposed | Tracking token `PTL-` + 32 uppercase hex from 16 random bytes; public lookup by POST (keeps tokens out of URLs) that is read-only and therefore exempt from the CSRF token and anonymous session but keeps a same-origin check and the lookup limiter; input normalized to uppercase | Source requires hard-to-guess and cryptographically random | Proposed |
| D-10 | Proposed | Separate local Next.js .env.local and Supabase Compose .env; per-service/command credential custody; private file mounts for container secrets where supported | Only app/tracking DB and required Storage credentials enter the web service; bootstrap/migration/ops/backup/maintenance remain private jobs. NEXT_PUBLIC_ never contains secrets | Local implementation in M1-PH1-T02; cloud custody chosen under EXT-04 |
| D-11 | Proposed | Local Next.js same-origin routing; loopback-only Supabase gateway/Studio; later production HTTPS proxy/TLS chosen under EXT-04 | No Vite proxy or Python API routing. Cloud topology and trusted forwarding header rules must be verified on its actual host | Local first; cloud deferred |
| D-12 | Proposed | Sharp full JPEG/PNG decode and sanitized re-encode, 3 MiB input/output and 12-megapixel limit; whole multipart request 4 MiB | M3-PH1-T05 spike on actual local hardware; no assumption of hosted Vercel limits or arbitrary laptop capacity | Validate pinned native library and measured resource bounds |
| D-13 | Proposed | Private Supabase Storage delivery-proofs bucket; generated immutable storage_key = <parcelId>/<32 hex>.<jpg or png>; no overwrite | Next.js ProofStore uses Storage API, never direct service filesystem or storage.objects mutations; parcel authorization precedes privileged storage operations | Local full Supabase adapter; compensating SQL/object workflow in contract |
| D-14 | Proposed | Creation fingerprint = HMAC-SHA256 with `FINGERPRINT_KEY` | Plain hash of low-entropy personal data is guessable | Proposed (contract v3) |
| D-15 | Proposed | Backup coordination: shared transaction advisory lock for writers/jobs, exclusive lock for backup, `system_state.maintenance_mode` flag rejecting unsafe methods with 503 | Contract named the intent, not the mechanism | Proposed (contract v3, revised after review: route-based gate, expiry, session-level backup lock, `backup_operator` role) |
| D-16 | Proposed | Account-changing events append to a private off-database journal on a separately backed-up local volume; restore reconciles or quarantines | No cloud journal destination selected. Incomplete/lost journal after a crash requires quarantine; memory buffering is not treated as durable | Local first; later off-host destination under EXT-04 |
| D-17 | Proposed | Daily matching app-schema and Storage API backups, encrypted, with 30-day expiry; deny expired data and re-anonymize after restore | Local off-volume destination first; cloud off-host location later. Do not restore application dumps over vendor Supabase schemas | Record backup-retention interpretation and actual recovery evidence |
| D-18 | Proposed | Throttle values: login hard block 5 failures per (username, source) per 15 minutes, username-only 20 failures alert without blocking, per-source 100 failures; tracking 30 per source per minute; registration 30 per source per hour; anonymous sessions created lazily; A12/A19 reads 120 per user per minute; current-password attempts 5 per user per 15 minutes; sessions: anonymous 10 minutes, idle 30 minutes, absolute 8 hours; shared mobile or office addresses make these tuning values, configurable per environment | Brief requires limits but gives no numbers | Proposed |
| D-19 | Proposed | New password must differ from the current one; common-password list is local | P2 gives only length and uniqueness | Proposed |
| D-20 | Proposed | Error-code registry in the contract; all modules use only registered codes | Needed for conformance test CT-03 | Proposed (contract v3) |
| D-21 | Confirmed | Pinned Node.js, Next.js, PostgreSQL, Supabase Compose/image and npm dependency versions | [Version record](../../infra/VERSIONS.md), package-lock.json and preserved upstream Compose configuration record the local foundation. Node.js 24.14.0 is the reproducible setup/CI baseline; 24.22.1 has also been checked locally. Application requires no Python runtime | Recorded and locally exercised; clean-checkout reproduction by another owner and remote CI remain G1 evidence |
| D-22 | Proposed | Test principal injection only into test-built service/handler dependencies; never a request/header/cookie switch | Production exports import real auth only; test modules and failpoint registries are excluded from production dependency graphs | Next.js production build negative control required |
| D-23 | Proposed | Migration order 0001 to 0007 and `audit_event.parcel_id` foreign key added by 0003 | Breaks M1/M2 table-order cycle | Proposed (contract v3) |
| D-24 | Proposed | `as_of` time parameter accepted only by maintenance-role functions; request paths use database `now()` | Prevents clients influencing time | Proposed (contract v3) |
| D-25 | Proposed | Audit event-type list defined centrally; 0002 enforces it | Avoids cross-module migration churn | Proposed (contract v3) |
| D-26 | Proposed | Next.js-compatible per-request nonce CSP, dynamic private pages and no shared caching | No blanket script-src self policy that breaks hydration; local dev exceptions cannot reach production | Production build and browser checks before enforcement |
| D-27 | Proposed | Rate-limit source derives from verified local connection/proxy; cloud forwarding trust is host-specific | Never trust arbitrary X-Forwarded-For; keep keyed source digests | Local verification first; cloud test under EXT-04 |
| D-28 | Proposed | Registration may reveal a taken username (unavoidable usability) while login stays generic; mitigated by throttle and audit | Trade-off | Accepted trade-off, proposed |
| D-29 | Proposed | Out of scope: redelivery after final outcome, multiple/replacement photos, bulk assignment, maps, email recovery, payments | Not in the case study | Proposed (project plan) |
| D-30 | Proposed | Initial PH2 delivery slice uses guarded seeded assignment (TMP-02), replaced by real Admin assignment in PH3 | Enables incremental integration without exposing fixture controls in production | Retire by M3-PH3-T04; verify M3-PH3-TC17 |
| D-31 | Proposed | Parcels that never become terminal are anonymized 12 months after their last status change (SHOULD tier) | P3 purpose ends even for lost or cancelled parcels | Proposed |
| D-32 | Proposed | Admin password reset (A21) with a one-time password; initial and reset passwords expire after 72 hours (SHOULD tier) | Day-to-day resets must not need operator shell access (P1) | Proposed |
| D-33 | Proposed | Accepted residual risk: `app_runtime` keeps direct DML on `auth_session` and `rate_limit_bucket`; a stolen runtime credential could forge a session. Mitigated by credential custody, short lifetimes and the account-table protections | Review finding R3-05 | Accepted, proposed |
| D-34 | Proposed | Phone input accepts Malaysian local numbers starting with 0 (normalized to +60) and international numbers starting with +; stored form is E.164 | Source says only 'phone number'; E.164-only would reject normal local entries | Proposed |
| D-35 | Proposed | Design rules not stated in the sources: forced first-login password change; reactivation of accounts; Admin audit viewer; Admin and self cannot be disabled through the web; reassignment of unfinished parcels and the needs-reassignment view; Failed is terminal; field length limits | Reasoned from P1/P2/P5 and the status flow | Proposed; disable (P1) is the only source-backed account action |
| D-36 | Proposed | Priority tiers: MUST (rubric-required functions, key controls, listed test inputs, cloud deployment with HTTPS and all roles, test document, demo), SHOULD (contract controls beyond the rubric), STRETCH (listed in the phase framework). Gates G3-G6 pass on MUST and SHOULD; STRETCH is reported honestly and does not block | Three people, rubric-weighted scope | Proposed |
| D-37 | Proposed | Admin sees who changed each status (`changedBy`) in private detail; other roles and the public never do | SRC-08 needs a demonstrable read path | Proposed |
| D-38 | Proposed | Restore exercises use synthetic data, or a protected same-account environment limited to named operators and destroyed afterwards; audit events are kept 24 months and application and database logs 90 days; interpretation recorded in the final document | P3/P4 | Proposed |
| D-39 | Proposed | TypeScript ESLint/Semgrep, npm audit, gitleaks, Trivy/hadolint for pinned infrastructure; ZAP and sqlmap against local Next.js plus real Supabase; authorized TLS checks on later cloud URL | Retain module-specific attack evidence and triage; no Python security toolchain. Do not scan shared hosting infrastructure outside the permitted app target | SRC-17; action versions pinned by commit SHA |

## External dependencies

| ID | Dependency | Needed by | Owner to chase | Status |
| --- | --- | --- | --- | --- |
| EXT-02 | Lecturer approval of the selected Next.js/TypeScript/PostgreSQL/full-Supabase tech stack | Resolved; no longer blocks implementation or G1 | Naszrul / project owner | Approved — project owner confirmed lecturer approval in chat on 13 November 2026 |
| EXT-03 | Apply PR-only branch protection (`.github/branch-protection.json`) with repository administration access; decide required checks after CI exists | PH1 CI complete; M1-PH5-T10 | Naszrul | Pending; not applied |
| EXT-04 | Later cloud provider/account, full Supabase Docker host sizing/cost, domain/TLS, network exposure, durable storage and backup destination | Local PH1-PH4 proceed without cloud access; resolve before any PH5 provisioning | Naszrul with the team (M1-PH1-T13) | Deferred by user: local first |
| EXT-05 | Full names and matric numbers for the final security test document | G6 | each member | Needed |
| EXT-06 | Private record of the incident contact channel and who holds the operations credential | Before cloud release (PH5) | Naszrul | Not recorded |
| EXT-07 | Backup encryption key custody and the identities of recovery operators | PH5 | Syauqi with the team | Not decided |
| EXT-08 | Week 14 calendar date (not stated in the source documents) | Needed to schedule gates backwards; no date is invented | Naszrul asks the lecturer; independent of the resolved stack approval | Unknown |

## How a proposal becomes a requirement

A Proposed row changes only through a PR that updates this register, the system contract, every affected phase file and its tests, with approval from all three owners. A Source row cannot be changed by the team; if the team departs from it (D-01), record the departure and the external acceptance status here.
