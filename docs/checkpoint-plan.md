# ParcelTrack Lite checkpoint preparation

Checkpoint date: 22 October 2026, Malaysia time.

This pack prepares the five deliverables supplied by the team. It draws on the local project briefing, case study and marking rubric. A separate runnable browser-only prototype now covers the three interfaces; real server/database integration remains to be built. Plans and test expectations below are not evidence of implementation.

The [complete project plan](project-plan.md) and [separate module folders](project-plan.md#plans-by-owner) define the full implementation scope as six phases (PH1-PH6). The checkpoint corresponds to the checkpoint-critical `(CP)` tasks of PH1 and the PH2 slices ([phase framework](shared/phase-framework.md), [first execution sequence](shared/execution-sequence.md)); it does not require completing the functionality planned for PH3 to PH6.

## 1 Module allocation and development stack

The team confirmed this allocation on 21 October 2026:

| Owner | GitHub | Required module | Primary responsibility |
| --- | --- | --- | --- |
| Naszrul | Naszrul-NZL | M1 Login and User Management | Seller registration, login/logout, password change, admin management of Rider accounts |
| Zikri | Zikri809 | M2 Parcel Registration and Public Tracking | Parcel registration, seller parcel list/search, tracking numbers, public status history |
| Syauqi | Qee110 | M3 Delivery Update and Admin Dashboard | Admin assignment, rider parcel list/status updates, proof photo, dashboard counts |

Database design, shared layout and integration belong to all three members. Each member must understand, test and explain their own module's code. The confirmed GitHub handles are not substitutes for the full names and matric numbers required on the lecturer's allocation sheet.

### Stack decisions and recommendation

The current implementation baseline supersedes the 21 October separate API plan. It was changed by user instruction on 22 October 2026 to one application stack and local full Supabase Docker.

| Layer | Selection | Reason |
| --- | --- | --- |
| Application | Next.js App Router with TypeScript/React | Pages, Route Handlers and server services in one project |
| Shared contracts | Strict Zod schemas and inferred TypeScript types | One validation/type source; server validation remains mandatory |
| Database | PostgreSQL inside full official Supabase Docker stack | Existing relational model, transactions and RLS retained |
| Database access/migrations | pg and node-pg-migrate with reviewed SQL | One checked-out client per transaction and ordered schema/grant revisions |
| Proof storage | Private local Supabase Storage bucket via server-only adapter | Full validation, per-parcel authorization and durable object storage |
| Application identity | Username accounts, Argon2id and opaque server-side sessions | Preserve existing security contract; bundled Supabase Auth is not a second login authority |
| Immediate environment | Local Next.js plus full Supabase Compose, loopback-only admin/gateway ports | No cloud account, managed Free project or separate Python API needed |
| Later deployment | PH5 cloud host/provider decision remains open | Local-first does not remove the source cloud-assessment requirement |

The [local development plan](local-development.md) gives the PH1 setup sequence and [system contract](shared/system-contract.md) defines the future source tree and security model. The full Supabase stack includes its default gateway, Studio, Auth, PostgREST, Storage, Realtime, pooler and supporting services; do not silently reduce it to a standalone PostgreSQL container. Application tables live in non-exposed schema app and are accessed only by restricted server roles. Use synthetic data and private generated credentials.

Next.js/PostgreSQL differ from the combinations in the lecturer's source brief; acceptance remains unrecorded under EXT-02. Cloud hosting is deferred until the local integrated system is proven. The existing React/Vite checkpoint demo still uses browser-only data and keeps its historical frontend verification; updating these plans does not implement the migration.

### Proposed cloud deployment

Implement and verify the full stack locally first using the [local setup plan](local-development.md). Preserve PostgreSQL and Storage volumes, loopback-only administration and restricted application roles. Cloud execution is deferred until PH5 and EXT-04. Do not select a provider, open public ports or provision resources merely from this document. A later cloud host must run the Supabase Docker services or make an explicitly reviewed architecture change; Vercel alone cannot run them. The source's cloud/full-marks criterion remains unchanged.

### Shared demo data

Prepare one Admin, two Sellers and two Riders using synthetic names and contact details. Supply credentials privately; never commit usable passwords. Generate a harmless JPG or PNG for proof and retain clearly labeled invalid test fixtures outside public storage.

### Later integrated demonstration order

1. Naszrul logs in as Seller A and shows a failed login, successful login and denied Admin access.
2. Zikri registers a parcel and notes the generated tracking number. Refresh to show that it is stored.
3. Zikri switches to Seller B and demonstrates that direct access to Seller A's parcel fails.
4. Syauqi logs in as Admin and assigns that parcel to Rider A.
5. Syauqi logs in as Rider B and demonstrates that an update to Rider A's parcel fails.
6. Syauqi logs in as Rider A, records Out for Delivery, and then Delivered with a valid proof image.
7. Zikri opens public tracking without login and shows status timestamps without recipient data or the photo.
8. Syauqi returns to the Admin dashboard and shows the updated counts.

This sequence is the later end-to-end target after the small checkpoint slices work. The Week 14 requirement is a 30-minute group demonstration, approximately 10 minutes per person. The supplied documents do not set tomorrow's presentation length.

### Later functionality still required

An initial demo does not complete the modules. M1 also needs Seller self-registration, Admin creation/disablement of Riders and password change. M2 needs own-parcel search, validation and lookup rate limits. M3 needs the Failed outcome, complete upload controls, status validation and accountable logs. All module security controls and integration need testing before the final submission.

## 4 Security requirements

The [security worksheet](security-tests.md) maps module requirements to observable results. Every requirement starts as planned, with no passing result claimed.

The five policies in the case study require:

- P1: Server-side role and parcel access checks, individual accounts, and disabling Rider accounts on the day a rider leaves. Disabled accounts must lose access through existing sessions too.
- P2: Passwords of at least 10 characters, unique to this application, with prompt reporting of compromise. The application can enforce length and common-password checks; cross-service uniqueness also requires user guidance.
- P3: Use recipient data only for delivery, prevent unauthorized disclosure/export, and delete or anonymize it 12 months after delivery. This retention period is the project's stated policy. Plan removal of personal information in proof images too.
- P4: No source-code secrets, no real recipient data in testing, and generic user errors with technical details limited to protected logs.
- P5: Record successful and failed logins and status changes without passwords or full addresses. Report suspected incidents to the Admin within one hour and lock affected accounts.

Document the proposed retention procedure and incident process even if their automation is scheduled after the initial demo. Do not describe them as implemented until verified.

## 5 Completed work challenges and next steps

### Verified baseline

| Item | Status as of this preparation |
| --- | --- |
| Briefing, case study and rubric | Read and mapped to this plan |
| Git repository | Initialized locally with origin configured to the GitHub repository |
| Team access | Reported as three GitHub collaborators verified in an earlier session; not re-verified here |
| Module allocation | Confirmed by team |
| Reference-file ignore rules | `.gitignore` ignores Office temporary files only; the three reference documents are tracked in the repository |
| ERD, requirement matrix and demo sequence | Drafted locally in this pack |
| Development stack | full-stack Next.js, PostgreSQL/RLS, Docker and cloud selected; detailed implementation contracts drafted |
| Application, database and module interfaces | Not built |
| Security test execution | Not run; no application exists |
| Cloud deployment | Local-first instruction confirmed; later cloud host/provider unresolved; no live URL |

Check Git history and the published branch/PR for the revision being presented. This pack describes planning progress; it does not claim implementation or deployment completion.

### Challenges and response

| Challenge | Response |
| --- | --- |
| Browser-only demo exists; real Next.js/Supabase integration remains | Prioritize one working path per module and integrate early |
| Modules depend on the same users, parcels and statuses | Agree on the ERD, role values and status transition rules first |
| Role checks can be confused with parcel ownership | Test both a wrong role and a different user with the same role |
| Uploads and public tracking can expose personal data | Use private proof storage and a minimal public response |
| cloud account access and deployment details are not yet established | Build locally first; decide hosting before PH5; verify persistence and backup locally |

### Execution order before the checkpoint

1. Use the confirmed full-stack Next.js/local-Supabase baseline and shared contract. Naszrul completes/submits the lecturer's allocation sheet by Week 5, including full names/matric numbers and starter-kit declaration if applicable, and retains the receipt. Current submission status is unverified; do not assume tomorrow is the Week 5 deadline.
2. Create the shared schema/migrations and seed synthetic accounts, parcels and Rider assignments (M2-PH1-T01 to T06, M1-PH1-T06, T07).
3. Naszrul builds login/logout (M1-PH2-T02 to T06); Zikri builds registration/persistence (M2-PH2-T01 to T04, T06); Syauqi builds assigned-parcel view and Out for Delivery update (M3-PH2-T02 to T04).
4. Run the three checkpoint slices against the same database/session (INT-CP-01 to INT-CP-03) and record actual outcomes.
5. Present the ERD, security requirements, module plans and local Next.js/full-Supabase architecture. Prove local integration first and record later cloud decisions without claiming deployment.
6. Capture real evidence and list unimplemented features explicitly. Continue through PH3 to PH6 of the full project plan after the checkpoint.

If time prevents a cloud demo, disclose that gap. A deployment plan does not satisfy a requirement for a live cloud application. The final rubric deducts five marks from deployment/integration for a local-only system.

### Presentation outline

1. Project purpose, team and confirmed module ownership.
2. Proposed or confirmed stack, repository URL and cloud status.
3. Initial ERD and shared data rules.
4. Naszrul demonstrates M1 and one rejected access attempt.
5. Zikri demonstrates the PH2 registration/persistence slice and ownership check; describes public tracking/privacy as planned until implemented.
6. Syauqi demonstrates the PH2 assigned-parcel/Out for Delivery slice (seeded assignment, disclosed); describes assignment/dashboard/upload controls as planned until implemented.
7. Security requirements with actual test evidence where available.
8. Completed work, current challenges and next steps.

Until the application exists, describe slides 4 to 6 as planned demonstrations. Replace those descriptions with live evidence as work is completed.

## Source materials

- ParcelTrack Lite Project Briefing.pptx: slides 6 to 13 cover modules, ownership, access, security, stack, deployment and submission.
- ParcelTrack_Lite_Case_Study.docx: sections 4 to 10 define functionality, roles, environment, threats, policies and final submission.
- Rubric_Project_STTCK3033_ParcelTrack_Lite (1).docx: section 2 lists module controls and test inputs; section 3 sets assessment bands.
- The team's five checkpoint items and module allocation were supplied in this chat. Treat them as the checkpoint requirements; the source documents describe the wider project.
